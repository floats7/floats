import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import type { Address } from "../../indexer/src/types.ts";

const previewAbi = parseAbi([
  "function previewPositionChange(address account,bytes32 marketId,int256 sizeDelta18) view returns ((uint256 markPriceUsd18,uint256 executionPriceUsd18,uint256 spreadBps,uint256 feeUsd6,uint256 resultingNotionalUsd18,uint256 requiredInitialMarginUsd18,uint256 liquidationPriceUsd18,int256 resultingSize18) preview)",
]);
const registryAbi = parseAbi([
  "function getMarket(bytes32 marketId) view returns ((address underlying,bytes32 underlyingUid,bytes32 symbol,address priceFeed,uint32 maxLeverageBps,uint32 initialMarginBps,uint32 maintenanceMarginBps,uint32 openInterestCapBps,uint32 baseSpreadBps,uint32 tradingFeeBps,uint32 extendedSpreadMultiplierBps,uint32 extendedLeverageDivisorBps,uint48 maxPriceAge,bool isolatedOnly) config,uint8 state,uint8 session)",
]);
const positionAbi = parseAbi([
  "function getPosition(address account,bytes32 marketId) view returns ((int256 size18,uint256 entryPriceUsd18,int256 lastFundingIndex18,int256 realizedPnlUsd18,uint256 pendingFeesUsd18) position)",
  "function positionAccounting(address account,bytes32 marketId) view returns (uint256 openInterestUsd18,uint256 reservedLiability6)",
]);
const marginAbi = parseAbi([
  "function marginMode(address account,bytes32 marketId) view returns (uint8)",
  "function isolatedMargin(address account,bytes32 marketId) view returns (uint256)",
  "function freeCollateral(address account) view returns (uint256)",
  "function crossCollateral(address account) view returns (uint256)",
]);
const riskAbi = parseAbi([
  "function isolatedHealth(address account,bytes32 marketId) view returns ((int256 equityUsd18,uint256 initialMarginUsd18,uint256 maintenanceMarginUsd18,uint256 marginRatio18,bool liquidatable) health)",
  "function isolatedLiquidationPrice(address account,bytes32 marketId) view returns (uint256 liquidationPriceUsd18)",
  "function crossHealth(address account) view returns ((int256 equityUsd18,uint256 initialMarginUsd18,uint256 maintenanceMarginUsd18,uint256 marginRatio18,bool liquidatable) health)",
]);
const oracleAbi = parseAbi([
  "function getPrice(bytes32 marketId) view returns ((uint256 markPriceUsd18,uint48 updatedAt) price)",
]);
const vaultAbi = parseAbi([
  "function managedAssets() view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function reservedTraderLiability() view returns (uint256)",
  "function payableWithdrawalAssets() view returns (uint256)",
  "function recognizedBadDebt() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function utilizationBps() view returns (uint256)",
  "function operationsPaused() view returns (bool)",
  "function minimumWithdrawalDelay() view returns (uint48)",
]);
const marketAccountingAbi = parseAbi([
  "function openInterest(bytes32 marketId) view returns (uint256 longOpenInterestUsd18,uint256 shortOpenInterestUsd18)",
]);

export interface PerpsTradePreview {
  readonly markPriceUsd18: string;
  readonly executionPriceUsd18: string;
  readonly spreadBps: number;
  readonly feeUsd6: string;
  readonly resultingNotionalUsd18: string;
  readonly requiredInitialMarginUsd18: string;
  readonly liquidationPriceUsd18: string;
  readonly resultingSize18: string;
}

export class PerpsReader {
  private requestId = 0;

  public constructor(
    private readonly rpcUrl: URL,
    private readonly marketAddress: Address,
    private readonly registryAddress: Address,
    private readonly marginAccountAddress: Address,
    private readonly riskEngineAddress: Address,
    private readonly oracleAddress: Address,
    private readonly liquidityVaultAddress: Address,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  public async readLpState(marketIds: readonly `0x${string}`[] = []) {
    const names = ["managedAssets", "availableLiquidity", "reservedTraderLiability", "payableWithdrawalAssets", "recognizedBadDebt", "totalSupply", "utilizationBps", "operationsPaused", "minimumWithdrawalDelay"] as const;
    const [values, marketInterest] = await Promise.all([
      Promise.all(names.map((name) => this.read(this.liquidityVaultAddress, vaultAbi, name, []))),
      Promise.all(marketIds.map((marketId) => this.read(this.marketAddress, marketAccountingAbi, "openInterest", [marketId]) as Promise<readonly [bigint, bigint]>)),
    ]);
    const totalLongOpenInterestUsd18 = marketInterest.reduce((total, item) => total + item[0], 0n);
    const totalShortOpenInterestUsd18 = marketInterest.reduce((total, item) => total + item[1], 0n);
    const netExposureUsd18 = totalLongOpenInterestUsd18 > totalShortOpenInterestUsd18
      ? totalLongOpenInterestUsd18 - totalShortOpenInterestUsd18
      : totalShortOpenInterestUsd18 - totalLongOpenInterestUsd18;
    return {
      vaultAddress: this.liquidityVaultAddress,
      managedAssets6: (values[0] as bigint).toString(),
      availableLiquidity6: (values[1] as bigint).toString(),
      reservedTraderLiability6: (values[2] as bigint).toString(),
      payableWithdrawalAssets6: (values[3] as bigint).toString(),
      recognizedBadDebt6: (values[4] as bigint).toString(),
      totalSupply18: (values[5] as bigint).toString(),
      utilizationBps: (values[6] as bigint).toString(),
      operationsPaused: values[7] as boolean,
      minimumWithdrawalDelaySeconds: Number(values[8] as bigint),
      totalLongOpenInterestUsd18: totalLongOpenInterestUsd18.toString(),
      totalShortOpenInterestUsd18: totalShortOpenInterestUsd18.toString(),
      netExposureUsd18: netExposureUsd18.toString(),
    };
  }

  public async readPosition(account: Address, marketId: `0x${string}`) {
    const [positionResult, accountingResult, modeResult, isolatedMarginResult] = await Promise.all([
      this.read(this.marketAddress, positionAbi, "getPosition", [account, marketId]),
      this.read(this.marketAddress, positionAbi, "positionAccounting", [account, marketId]),
      this.read(this.marginAccountAddress, marginAbi, "marginMode", [account, marketId]),
      this.read(this.marginAccountAddress, marginAbi, "isolatedMargin", [account, marketId]),
    ]);
    const position = positionResult as { size18: bigint; entryPriceUsd18: bigint; lastFundingIndex18: bigint; realizedPnlUsd18: bigint; pendingFeesUsd18: bigint };
    const [openInterestUsd18, reservedLiability6] = accountingResult as readonly [bigint, bigint];
    const marginMode = Number(modeResult) === 1 ? "cross" : "isolated";
    const health = await this.read(
      this.riskEngineAddress,
      riskAbi,
      marginMode === "cross" ? "crossHealth" : "isolatedHealth",
      marginMode === "cross" ? [account] : [account, marketId],
    ).catch(() => undefined) as { equityUsd18: bigint; initialMarginUsd18: bigint; maintenanceMarginUsd18: bigint; marginRatio18: bigint; liquidatable: boolean } | undefined;
    const liquidationPrice = marginMode === "isolated" && health
      ? await this.read(this.riskEngineAddress, riskAbi, "isolatedLiquidationPrice", [account, marketId]).catch(() => 0n) as bigint
      : 0n;
    return {
      accountAddress: account,
      marketId,
      marginMode,
      size18: position.size18.toString(),
      entryPriceUsd18: position.entryPriceUsd18.toString(),
      lastFundingIndex18: position.lastFundingIndex18.toString(),
      realizedPnlUsd18: position.realizedPnlUsd18.toString(),
      pendingFeesUsd18: position.pendingFeesUsd18.toString(),
      openInterestUsd18: openInterestUsd18.toString(),
      reservedLiability6: reservedLiability6.toString(),
      isolatedMargin6: (isolatedMarginResult as bigint).toString(),
      healthAvailable: Boolean(health),
      equityUsd18: health?.equityUsd18.toString() ?? "0",
      initialMarginUsd18: health?.initialMarginUsd18.toString() ?? "0",
      maintenanceMarginUsd18: health?.maintenanceMarginUsd18.toString() ?? "0",
      marginRatio18: health?.marginRatio18.toString() ?? "0",
      liquidatable: health?.liquidatable ?? false,
      liquidationPriceUsd18: liquidationPrice.toString(),
    };
  }

  public async readCollateral(account: Address) {
    const [free, cross, health] = await Promise.all([
      this.read(this.marginAccountAddress, marginAbi, "freeCollateral", [account]),
      this.read(this.marginAccountAddress, marginAbi, "crossCollateral", [account]),
      this.read(this.riskEngineAddress, riskAbi, "crossHealth", [account]),
    ]);
    const crossHealth = health as { equityUsd18: bigint; initialMarginUsd18: bigint; maintenanceMarginUsd18: bigint; marginRatio18: bigint; liquidatable: boolean };
    return {
      freeCollateral6: (free as bigint).toString(),
      crossCollateral6: (cross as bigint).toString(),
      crossHealth: {
        equityUsd18: crossHealth.equityUsd18.toString(),
        initialMarginUsd18: crossHealth.initialMarginUsd18.toString(),
        maintenanceMarginUsd18: crossHealth.maintenanceMarginUsd18.toString(),
        marginRatio18: crossHealth.marginRatio18.toString(),
        liquidatable: crossHealth.liquidatable,
      },
    };
  }

  public async readMarket(marketId: `0x${string}`) {
    const data = encodeFunctionData({ abi: registryAbi, functionName: "getMarket", args: [marketId] });
    const result = await this.callAt(this.registryAddress, data);
    const oraclePrice = await this.read(this.oracleAddress, oracleAbi, "getPrice", [marketId])
      .catch(() => undefined);
    const [config, state, session] = decodeFunctionResult({ abi: registryAbi, functionName: "getMarket", data: result });
    const price = oraclePrice as { markPriceUsd18: bigint; updatedAt: number } | undefined;
    return {
      marketId,
      symbol: decodeSymbol(config.symbol),
      underlyingAddress: config.underlying.toLowerCase(),
      underlyingUid: config.underlyingUid,
      priceFeedAddress: config.priceFeed.toLowerCase(),
      marketState: (["disabled", "active", "reduce_only"] as const)[state] ?? "disabled",
      sessionState: (["regular", "extended", "overnight", "closed"] as const)[session] ?? "closed",
      isolatedOnly: config.isolatedOnly,
      maxLeverageBps: config.maxLeverageBps,
      initialMarginBps: config.initialMarginBps,
      maintenanceMarginBps: config.maintenanceMarginBps,
      openInterestCapBps: config.openInterestCapBps,
      baseSpreadBps: config.baseSpreadBps,
      tradingFeeBps: config.tradingFeeBps,
      maxPriceAgeSeconds: Number(config.maxPriceAge),
      markPriceUsd18: price?.markPriceUsd18.toString() ?? null,
      oracleUpdatedAt: price ? Number(price.updatedAt) : null,
      oracleHealth: price ? "live" : "unavailable",
    };
  }

  public async preview(input: {
    account: Address;
    marketId: `0x${string}`;
    sizeDelta18: bigint;
  }): Promise<PerpsTradePreview> {
    const data = encodeFunctionData({ abi: previewAbi, functionName: "previewPositionChange", args: [input.account, input.marketId, input.sizeDelta18] });
    const result = await this.callAt(this.marketAddress, data);
    const preview = decodeFunctionResult({ abi: previewAbi, functionName: "previewPositionChange", data: result });
    if (preview.spreadBps > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("PERPS_SPREAD_OUT_OF_RANGE");
    return {
      markPriceUsd18: preview.markPriceUsd18.toString(),
      executionPriceUsd18: preview.executionPriceUsd18.toString(),
      spreadBps: Number(preview.spreadBps),
      feeUsd6: preview.feeUsd6.toString(),
      resultingNotionalUsd18: preview.resultingNotionalUsd18.toString(),
      requiredInitialMarginUsd18: preview.requiredInitialMarginUsd18.toString(),
      liquidationPriceUsd18: preview.liquidationPriceUsd18.toString(),
      resultingSize18: preview.resultingSize18.toString(),
    };
  }

  private async callAt(to: Address, data: `0x${string}`): Promise<`0x${string}`> {
    const response = await this.fetchImplementation(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (!response.ok || body.error || typeof body.result !== "string" || !body.result.startsWith("0x")) {
      throw new Error("PERPS_PREVIEW_UNAVAILABLE");
    }
    return body.result as `0x${string}`;
  }

  private async read(
    to: Address,
    abi: readonly unknown[],
    functionName: string,
    args: readonly unknown[],
  ): Promise<unknown> {
    const data = encodeFunctionData({ abi, functionName, args } as never);
    const result = await this.callAt(to, data);
    return decodeFunctionResult({ abi, functionName, data: result } as never);
  }
}

function decodeSymbol(value: `0x${string}`): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("PERPS_SYMBOL_INVALID");
  const bytes = Uint8Array.from(
    value.slice(2).match(/.{2}/g)?.map((item) => Number.parseInt(item, 16)) ?? [],
  );
  const end = bytes.indexOf(0);
  const symbol = new TextDecoder().decode(end === -1 ? bytes : bytes.slice(0, end));
  if (!/^[A-Z0-9][A-Z0-9-]{0,30}$/.test(symbol)) throw new Error("PERPS_SYMBOL_INVALID");
  return symbol;
}
