import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionResult, parseAbi } from "viem";
import { PerpsActionDiscovery } from "../src/perps-discovery.ts";
import type { Hex } from "../src/types.ts";

const fundingAbi = parseAbi(["function getFundingState(bytes32 marketId) view returns ((int256 cumulativeIndex18,uint48 lastUpdatedAt,uint256 skewCoefficient18,uint256 maximumRate18,bool configured) state)"]);
const riskAbi = parseAbi(["function isolatedHealth(address account,bytes32 marketId) view returns ((int256 equityUsd18,uint256 initialMarginUsd18,uint256 maintenanceMarginUsd18,uint256 marginRatio18,bool liquidatable) health)"]);
const vaultAbi = parseAbi(["function withdrawalRequests(uint256 requestId) view returns (address owner,address receiver,uint256 shares,uint256 assets,uint48 unlockAt,uint8 state)"]);
const vaultStateAbi = parseAbi([
  "function managedAssets() view returns (uint256)", "function availableLiquidity() view returns (uint256)",
  "function reservedTraderLiability() view returns (uint256)", "function payableWithdrawalAssets() view returns (uint256)",
  "function recognizedBadDebt() view returns (uint256)", "function totalSupply() view returns (uint256)",
  "function utilizationBps() view returns (uint256)", "function operationsPaused() view returns (bool)",
]);
const marketAbi = parseAbi(["function openInterest(bytes32 marketId) view returns (uint256 longOpenInterestUsd18,uint256 shortOpenInterestUsd18)"]);
const positionAbi = parseAbi(["function getPosition(address account,bytes32 marketId) view returns ((int256 size18,uint256 entryPriceUsd18,int256 lastFundingIndex18,int256 realizedPnlUsd18,uint256 pendingFeesUsd18) position)"]);
const adlAbi = parseAbi(["function pendingShortAdlDeficit6(bytes32 marketId) view returns (uint256)"]);
const oracleAbi = parseAbi(["function getPrice(bytes32 marketId) view returns ((uint256 markPriceUsd18,uint256 updatedAt,uint80 roundId) price)"]);
const registryAbi = parseAbi(["function getMarket(bytes32 marketId) view returns ((address underlying,bytes32 underlyingUid,bytes32 symbol,address priceFeed,uint32 maxLeverageBps,uint32 initialMarginBps,uint32 maintenanceMarginBps,uint32 openInterestCapBps,uint32 baseSpreadBps,uint32 tradingFeeBps,uint32 extendedSpreadMultiplierBps,uint32 extendedLeverageDivisorBps,uint48 maxPriceAge,bool isolatedOnly) config,uint8 state,uint8 session)"]);
const ADDRESS = "0x1111111111111111111111111111111111111111" as Hex;
const ADDRESS_TWO = "0x2222222222222222222222222222222222222222" as Hex;
const MARKET = `0x${"22".repeat(32)}` as Hex;

test("Perps discovery emits only due and unsafe actions", async () => {
  const replies = [
    encodeFunctionResult({ abi: fundingAbi, functionName: "getFundingState", result: { cumulativeIndex18: 0n, lastUpdatedAt: 1000, skewCoefficient18: 1n, maximumRate18: 1n, configured: true } }),
    encodeFunctionResult({ abi: fundingAbi, functionName: "getFundingState", result: { cumulativeIndex18: 0n, lastUpdatedAt: 1000, skewCoefficient18: 1n, maximumRate18: 1n, configured: true } }),
    encodeFunctionResult({ abi: riskAbi, functionName: "isolatedHealth", result: { equityUsd18: 1n, initialMarginUsd18: 2n, maintenanceMarginUsd18: 2n, marginRatio18: 1n, liquidatable: true } }),
    encodeFunctionResult({ abi: vaultAbi, functionName: "withdrawalRequests", result: [ADDRESS, ADDRESS, 1n, 0n, 5000, 1] }),
  ];
  const fetchImplementation: typeof fetch = async () => Response.json({ jsonrpc: "2.0", id: 1, result: replies.shift() });
  const discovery = new PerpsActionDiscovery(new URL("https://rpc.example"), { registry: ADDRESS, market: ADDRESS, oracle: ADDRESS, funding: ADDRESS, risk: ADDRESS, liquidation: ADDRESS, vault: ADDRESS, insurance: ADDRESS }, fetchImplementation);

  assert.equal(await discovery.funding(MARKET, 4599), undefined);
  assert.ok(await discovery.funding(MARKET, 4600));
  assert.ok(await discovery.liquidation({ account: ADDRESS, marketId: MARKET, mode: "isolated" }));
  assert.ok(await discovery.withdrawal(1n, 5000));
});

test("Perps discovery reads LP risk state directly from contracts", async () => {
  const replies = [
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "managedAssets", result: 1_000_000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "availableLiquidity", result: 700_000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "reservedTraderLiability", result: 200_000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "payableWithdrawalAssets", result: 50_000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "recognizedBadDebt", result: 10_000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "totalSupply", result: 900_000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "utilizationBps", result: 3000n }),
    encodeFunctionResult({ abi: vaultStateAbi, functionName: "operationsPaused", result: true }),
    encodeFunctionResult({ abi: marketAbi, functionName: "openInterest", result: [20n, 30n] }),
  ];
  const fetchImplementation: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    return Response.json({ jsonrpc: "2.0", id: 1, result: request.method === "eth_blockNumber" ? "0x2a" : replies.shift() });
  };
  const discovery = new PerpsActionDiscovery(new URL("https://rpc.example"), { registry: ADDRESS, market: ADDRESS, oracle: ADDRESS, funding: ADDRESS, risk: ADDRESS, liquidation: ADDRESS, vault: ADDRESS, insurance: ADDRESS }, fetchImplementation);
  const state = await discovery.lpState([MARKET]);
  assert.equal(state.managedAssets6, 1_000_000n);
  assert.equal(state.recognizedBadDebt6, 10_000n);
  assert.equal(state.operationsPaused, true);
  assert.equal(state.blockNumber, 42n);
  assert.deepEqual(state.openInterest, [{ marketId: MARKET, longUsd18: 20n, shortUsd18: 30n }]);
});

test("Perps discovery obtains market identity and OI cap from the registry", async () => {
  const result = encodeFunctionResult({
    abi: registryAbi,
    functionName: "getMarket",
    result: [{
      underlying: ADDRESS,
      underlyingUid: MARKET,
      symbol: `0x${"00".repeat(32)}`,
      priceFeed: ADDRESS,
      maxLeverageBps: 30_000,
      initialMarginBps: 3_334,
      maintenanceMarginBps: 1_000,
      openInterestCapBps: 400,
      baseSpreadBps: 20,
      tradingFeeBps: 6,
      extendedSpreadMultiplierBps: 20_000,
      extendedLeverageDivisorBps: 20_000,
      maxPriceAge: 300,
      isolatedOnly: true,
    }, 0, 3],
  });
  const fetchImplementation: typeof fetch = async () => Response.json({ jsonrpc: "2.0", id: 1, result });
  const discovery = new PerpsActionDiscovery(new URL("https://rpc.example"), { registry: ADDRESS, market: ADDRESS, oracle: ADDRESS, funding: ADDRESS, risk: ADDRESS, liquidation: ADDRESS, vault: ADDRESS, insurance: ADDRESS }, fetchImplementation);
  assert.deepEqual(await discovery.marketDescriptor(MARKET), { marketId: MARKET, underlying: ADDRESS, openInterestCapBps: 400n });
});

test("Perps discovery selects the largest profitable bounded ADL candidate", async () => {
  const position = (entryPriceUsd18: bigint) => encodeFunctionResult({
    abi: positionAbi,
    functionName: "getPosition",
    result: { size18: -1n * 10n ** 18n, entryPriceUsd18, lastFundingIndex18: 0n, realizedPnlUsd18: 0n, pendingFeesUsd18: 0n },
  });
  const pending = encodeFunctionResult({ abi: adlAbi, functionName: "pendingShortAdlDeficit6", result: 20_000_000n });
  const price = encodeFunctionResult({ abi: oracleAbi, functionName: "getPrice", result: { markPriceUsd18: 100n * 10n ** 18n, updatedAt: 1n, roundId: 1n } });
  const replies = [position(110n * 10n ** 18n), pending, price, position(120n * 10n ** 18n), pending, price];
  const fetchImplementation: typeof fetch = async () => Response.json({ jsonrpc: "2.0", id: 1, result: replies.shift() });
  const discovery = new PerpsActionDiscovery(new URL("https://rpc.example"), { registry: ADDRESS, market: ADDRESS, oracle: ADDRESS, funding: ADDRESS, risk: ADDRESS, liquidation: ADDRESS, vault: ADDRESS, insurance: ADDRESS }, fetchImplementation);

  const action = await discovery.adl([
    { account: ADDRESS, marketId: MARKET, mode: "isolated" },
    { account: ADDRESS_TWO, marketId: MARKET, mode: "isolated" },
  ]);

  assert.ok(action);
  assert.match(action.id, new RegExp(ADDRESS_TWO, "i"));
});
