import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionResult, parseAbi, type Hex } from "viem";

import { absoluteDeviationBps, measureCandidateLiquidity, parseCandidateLiquidityRoutes, priceImpactBps } from "../src/market-candidate-liquidity-sync.ts";

const abi = parseAbi(["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"]);
const address = (digit: string) => `0x${digit.repeat(40)}`;

test("two-sided depth passes when both executable impacts stay within two percent", async () => {
  let call = 0;
  const outputs = [24_900n, 100n, 24_800_000_000n, 100_000_000n];
  const evidence = await measureCandidateLiquidity({
    async call() {
      const amountOut = outputs[call++];
      if (amountOut === undefined) throw new Error("unexpected quote");
      return encodeFunctionResult({ abi, functionName: "quoteExactInputSingle", result: [amountOut, 1n, 1, 1n] }) as Hex;
    },
    async getCode() { return "0x01"; },
  }, {
    candidateId: "anthropic",
    tokenAddress: address("1"),
    usdgAddress: address("2"),
    poolAddress: address("3"),
    quoterAddress: address("4"),
    fee: 500,
    notionalUsdg6: 25_000n,
  });
  assert.equal(evidence.passed, true);
  assert.equal(evidence.buyPriceImpactBps, 40);
  assert.ok((evidence.sellPriceImpactBps ?? 10_000) <= 200);
});

test("liquidity gate rejects excessive executable impact", () => {
  assert.equal(priceImpactBps(25_000n, 23_000n, 100n, 100n), 800);
});

test("liquidity route configuration remains generic and server driven", () => {
  const [route] = parseCandidateLiquidityRoutes(JSON.stringify([{
    candidateId: "anthropic",
    tokenAddress: address("1"),
    usdgAddress: address("2"),
    poolAddress: address("3"),
    quoterAddress: address("4"),
    fee: 500,
    notionalUsdg6: "25000000000",
    maxImpactBps: 200,
  }]));
  assert.equal(route?.candidateId, "anthropic");
  assert.equal(route?.notionalUsdg6, 25_000_000_000n);
});

test("DEX execution price is compared with the multiplier-adjusted official reference", () => {
  assert.equal(absoluteDeviationBps(100n, 102n), 200);
  assert.equal(absoluteDeviationBps(100n, 103n), 300);
});

test("liquidity gate fails closed for excessive impact and unavailable quotes", async () => {
  let call = 0;
  const highImpact = await measureCandidateLiquidity({
    async call() {
      const outputs = [20_000n, 100n, 20_000_000_000n, 100_000_000n];
      const amountOut = outputs[call++];
      if (amountOut === undefined) throw new Error("unexpected quote");
      return encodeFunctionResult({ abi, functionName: "quoteExactInputSingle", result: [amountOut, 1n, 1, 1n] }) as Hex;
    },
    async getCode() { return "0x01"; },
  }, { candidateId: "anthropic", tokenAddress: address("1"), usdgAddress: address("2"), poolAddress: address("3"), quoterAddress: address("4"), fee: 500 });
  assert.equal(highImpact.passed, false);
  assert.equal(highImpact.failureCode, "PRICE_IMPACT_EXCEEDED");

  const unavailable = await measureCandidateLiquidity({
    async call() { throw new Error("POOL_UNAVAILABLE"); },
    async getCode() { return "0x"; },
  }, { candidateId: "anthropic", tokenAddress: address("1"), usdgAddress: address("2"), poolAddress: address("3"), quoterAddress: address("4"), fee: 500 });
  assert.equal(unavailable.passed, false);
  assert.equal(unavailable.failureCode, "POOL_UNAVAILABLE");
});
