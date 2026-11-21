import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import type { Hex, TransactionRequest } from "./types.ts";

const fundingAbi = parseAbi([
  "function getFundingState(bytes32 marketId) view returns ((int256 cumulativeIndex18,uint48 lastUpdatedAt,uint256 skewCoefficient18,uint256 maximumRate18,bool configured) state)",
  "function updateFunding(bytes32 marketId) returns (int256 cumulativeIndex18)",
]);
const riskAbi = parseAbi([
  "function isolatedHealth(address account,bytes32 marketId) view returns ((int256 equityUsd18,uint256 initialMarginUsd18,uint256 maintenanceMarginUsd18,uint256 marginRatio18,bool liquidatable) health)",
  "function crossHealth(address account) view returns ((int256 equityUsd18,uint256 initialMarginUsd18,uint256 maintenanceMarginUsd18,uint256 marginRatio18,bool liquidatable) health)",
]);
const liquidationAbi = parseAbi([
  "function liquidateIsolated(address account,bytes32 marketId) returns (uint256 closedSize18,uint256 badDebt6)",
  "function liquidateCross(address account) returns (bytes32 marketId,uint256 closedSize18,uint256 badDebt6)",
  "function pendingLongAdlDeficit6(bytes32 marketId) view returns (uint256)",
  "function pendingShortAdlDeficit6(bytes32 marketId) view returns (uint256)",
  "function executeAdl(address account,bytes32 marketId,uint256 closeSize18) returns (uint256 coveredDeficit6)",
]);
const vaultAbi = parseAbi([
  "function withdrawalRequests(uint256 requestId) view returns (address owner,address receiver,uint256 shares,uint256 assets,uint48 unlockAt,uint8 state)",
  "function processWithdrawal(uint256 requestId)",
  "function managedAssets() view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function reservedTraderLiability() view returns (uint256)",
  "function payableWithdrawalAssets() view returns (uint256)",
  "function recognizedBadDebt() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function utilizationBps() view returns (uint256)",
  "function operationsPaused() view returns (bool)",
]);
const marketAbi = parseAbi([
  "function openInterest(bytes32 marketId) view returns (uint256 longOpenInterestUsd18,uint256 shortOpenInterestUsd18)",
  "function getPosition(address account,bytes32 marketId) view returns ((int256 size18,uint256 entryPriceUsd18,int256 lastFundingIndex18,int256 realizedPnlUsd18,uint256 pendingFeesUsd18) position)",
]);
const registryAbi = parseAbi([
  "function sessionState(bytes32 marketId) view returns (uint8)",
  "function setSessionState(bytes32 marketId,uint8 next)",
  "function getMarket(bytes32 marketId) view returns ((address underlying,bytes32 underlyingUid,bytes32 symbol,address priceFeed,uint32 maxLeverageBps,uint32 initialMarginBps,uint32 maintenanceMarginBps,uint32 openInterestCapBps,uint32 baseSpreadBps,uint32 tradingFeeBps,uint32 extendedSpreadMultiplierBps,uint32 extendedLeverageDivisorBps,uint48 maxPriceAge,bool isolatedOnly) config,uint8 state,uint8 session)",
]);
const oracleAbi = parseAbi(["function getPrice(bytes32 marketId) view returns ((uint256 markPriceUsd18,uint48 updatedAt) price)"]);
const insuranceAbi = parseAbi(["function collateralToken() view returns (address)"]);
const erc20Abi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

export interface PerpsContracts { readonly registry: Hex; readonly market: Hex; readonly oracle: Hex; readonly funding: Hex; readonly risk: Hex; readonly liquidation: Hex; readonly vault: Hex; readonly insurance: Hex; }
export interface PerpsPositionCandidate { readonly account: Hex; readonly marketId: Hex; readonly mode: "isolated" | "cross"; }
export interface PerpsMarketDescriptor { readonly marketId: Hex; readonly underlying: Hex; readonly openInterestCapBps: bigint; }
export interface PerpsAction { readonly id: string; readonly request: TransactionRequest; }

export class PerpsActionDiscovery {
  private requestId = 0;
  constructor(private readonly rpcUrl: URL, private readonly contracts: PerpsContracts, private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch) {}

  async funding(marketId: Hex, observedAtSeconds: number): Promise<PerpsAction | undefined> {
    const data = encodeFunctionData({ abi: fundingAbi, functionName: "getFundingState", args: [marketId] });
    const state = decodeFunctionResult({ abi: fundingAbi, functionName: "getFundingState", data: await this.call(this.contracts.funding, data) });
    if (!state.configured || observedAtSeconds < Number(state.lastUpdatedAt) + 3600) return undefined;
    return { id: `${marketId}:${Math.floor(observedAtSeconds / 3600)}`, request: transaction(this.contracts.funding, encodeFunctionData({ abi: fundingAbi, functionName: "updateFunding", args: [marketId] })) };
  }

  async liquidation(candidate: PerpsPositionCandidate): Promise<PerpsAction | undefined> {
    const functionName = candidate.mode === "isolated" ? "isolatedHealth" : "crossHealth";
    const args = candidate.mode === "isolated" ? [candidate.account, candidate.marketId] as const : [candidate.account] as const;
    const data = encodeFunctionData({ abi: riskAbi, functionName, args } as never);
    const health = decodeFunctionResult({ abi: riskAbi, functionName, data: await this.call(this.contracts.risk, data) } as never) as { liquidatable: boolean };
    if (!health.liquidatable) return undefined;
    const liquidationData = candidate.mode === "isolated"
      ? encodeFunctionData({ abi: liquidationAbi, functionName: "liquidateIsolated", args: [candidate.account, candidate.marketId] })
      : encodeFunctionData({ abi: liquidationAbi, functionName: "liquidateCross", args: [candidate.account] });
    return { id: `${candidate.mode}:${candidate.account}:${candidate.marketId}`, request: transaction(this.contracts.liquidation, liquidationData) };
  }

  async adl(candidates: readonly PerpsPositionCandidate[]): Promise<PerpsAction | undefined> {
    let selected: {
      readonly account: Hex;
      readonly marketId: Hex;
      readonly closeSize18: bigint;
      readonly pending6: bigint;
      readonly profit6: bigint;
    } | undefined;
    for (const candidate of candidates) {
      const position = await this.read(
        this.contracts.market,
        marketAbi,
        "getPosition",
        [candidate.account, candidate.marketId],
      ) as { readonly size18: bigint; readonly entryPriceUsd18: bigint };
      if (position.size18 === 0n) continue;
      const targetLong = position.size18 > 0n;
      const deficitFunction = targetLong
        ? "pendingLongAdlDeficit6"
        : "pendingShortAdlDeficit6";
      const pending6 = await this.read(
        this.contracts.liquidation,
        liquidationAbi,
        deficitFunction,
        [candidate.marketId],
      ) as bigint;
      if (pending6 === 0n) continue;
      const price = await this.read(
        this.contracts.oracle,
        oracleAbi,
        "getPrice",
        [candidate.marketId],
      ) as { readonly markPriceUsd18: bigint };
      const priceDifference = targetLong
        ? price.markPriceUsd18 - position.entryPriceUsd18
        : position.entryPriceUsd18 - price.markPriceUsd18;
      if (priceDifference <= 0n) continue;
      const absoluteSize = position.size18 > 0n ? position.size18 : -position.size18;
      const profit6 = absoluteSize * priceDifference / 10n ** 30n;
      if (profit6 === 0n || (selected && selected.profit6 >= profit6)) continue;
      const boundedSize = absoluteSize * 2500n / 10_000n;
      const deficitBoundedSize = pending6 * 10n ** 30n / priceDifference;
      const closeSize18 = boundedSize < deficitBoundedSize ? boundedSize : deficitBoundedSize;
      if (closeSize18 === 0n) continue;
      selected = { account: candidate.account, marketId: candidate.marketId, closeSize18, pending6, profit6 };
    }
    if (!selected) return undefined;
    return {
      id: `adl:${selected.marketId}:${selected.account}:${selected.pending6}`,
      request: transaction(
        this.contracts.liquidation,
        encodeFunctionData({
          abi: liquidationAbi,
          functionName: "executeAdl",
          args: [selected.account, selected.marketId, selected.closeSize18],
        }),
      ),
    };
  }

  async withdrawal(requestId: bigint, observedAtSeconds: number): Promise<PerpsAction | undefined> {
    const data = encodeFunctionData({ abi: vaultAbi, functionName: "withdrawalRequests", args: [requestId] });
    const [, , , , unlockAt, state] = decodeFunctionResult({ abi: vaultAbi, functionName: "withdrawalRequests", data: await this.call(this.contracts.vault, data) });
    if (state !== 1 || observedAtSeconds < Number(unlockAt)) return undefined;
    return { id: requestId.toString(), request: transaction(this.contracts.vault, encodeFunctionData({ abi: vaultAbi, functionName: "processWithdrawal", args: [requestId] })) };
  }

  async session(marketId: Hex, desired: 0 | 1 | 2 | 3, observedAtSeconds: number): Promise<PerpsAction | undefined> {
    const data = encodeFunctionData({ abi: registryAbi, functionName: "sessionState", args: [marketId] });
    const current = decodeFunctionResult({ abi: registryAbi, functionName: "sessionState", data: await this.call(this.contracts.registry, data) });
    if (current === desired) return undefined;
    return { id: `${marketId}:${desired}:${Math.floor(observedAtSeconds / 60)}`, request: transaction(this.contracts.registry, encodeFunctionData({ abi: registryAbi, functionName: "setSessionState", args: [marketId, desired] })) };
  }

  async marketDescriptor(marketId: Hex): Promise<PerpsMarketDescriptor> {
    const result = await this.read(this.contracts.registry, registryAbi, "getMarket", [marketId]) as readonly [{ readonly underlying: Hex; readonly openInterestCapBps: number }, number, number];
    return { marketId, underlying: result[0].underlying.toLowerCase() as Hex, openInterestCapBps: BigInt(result[0].openInterestCapBps) };
  }

  async oracleHealthy(marketId: Hex): Promise<boolean> {
    try {
      const data = encodeFunctionData({ abi: oracleAbi, functionName: "getPrice", args: [marketId] });
      const price = decodeFunctionResult({ abi: oracleAbi, functionName: "getPrice", data: await this.call(this.contracts.oracle, data) });
      return price.markPriceUsd18 > 0n && price.updatedAt > 0n;
    } catch {
      return false;
    }
  }

  async insuranceBalance(): Promise<bigint> {
    const assetData = encodeFunctionData({ abi: insuranceAbi, functionName: "collateralToken" });
    const asset = decodeFunctionResult({ abi: insuranceAbi, functionName: "collateralToken", data: await this.call(this.contracts.insurance, assetData) });
    const balanceData = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [this.contracts.insurance] });
    return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: await this.call(asset, balanceData) });
  }

  async lpState(marketIds: readonly Hex[]) {
    const vaultFunctions = ["managedAssets", "availableLiquidity", "reservedTraderLiability", "payableWithdrawalAssets", "recognizedBadDebt", "totalSupply", "utilizationBps", "operationsPaused"] as const;
    const [values, interest, blockNumber] = await Promise.all([
      Promise.all(vaultFunctions.map((functionName) => this.read(this.contracts.vault, vaultAbi, functionName, []))),
      Promise.all(marketIds.map((marketId) => this.read(this.contracts.market, marketAbi, "openInterest", [marketId]) as Promise<readonly [bigint, bigint]>)),
      this.blockNumber(),
    ]);
    return {
      managedAssets6: values[0] as bigint,
      availableLiquidity6: values[1] as bigint,
      reservedTraderLiability6: values[2] as bigint,
      payableWithdrawalAssets6: values[3] as bigint,
      recognizedBadDebt6: values[4] as bigint,
      totalSupply18: values[5] as bigint,
      utilizationBps: values[6] as bigint,
      operationsPaused: values[7] as boolean,
      blockNumber,
      openInterest: marketIds.map((marketId, index) => ({ marketId, longUsd18: interest[index]![0], shortUsd18: interest[index]![1] })),
    };
  }

  private async read(to: Hex, abi: readonly unknown[], functionName: string, args: readonly unknown[]): Promise<unknown> {
    const data = encodeFunctionData({ abi, functionName, args } as never);
    return decodeFunctionResult({ abi, functionName, data: await this.call(to, data) } as never);
  }

  private async blockNumber(): Promise<bigint> {
    const response = await this.fetchImplementation(this.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method: "eth_blockNumber", params: [] }) });
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (!response.ok || body.error || typeof body.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.result)) throw new Error("PERPS_KEEPER_READ_FAILED");
    return BigInt(body.result);
  }

  private async call(to: Hex, data: Hex): Promise<Hex> {
    const response = await this.fetchImplementation(this.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method: "eth_call", params: [{ to, data }, "latest"] }) });
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (!response.ok || body.error || typeof body.result !== "string" || !body.result.startsWith("0x")) throw new Error("PERPS_KEEPER_READ_FAILED");
    return body.result as Hex;
  }
}

function transaction(to: Hex, data: Hex): TransactionRequest { return { to, data, value: 0n }; }
