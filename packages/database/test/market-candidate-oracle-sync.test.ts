import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionResult, parseAbi, type Hex } from "viem";

import { deviationBps, discoverCandidateOracleRoutes, parseCandidateOracleRoutes, verifyCandidateOracle } from "../src/market-candidate-oracle-sync.ts";

const abi = parseAbi(["function decimals() view returns (uint8)", "function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)"]);
const address = (digit: string) => `0x${digit.repeat(40)}`;

function reader(round: { answer: bigint; updatedAt: bigint; roundId?: bigint; answeredInRound?: bigint }) {
  let call = 0;
  return {
    async getCode() { return "0x01" as Hex; },
    async call() {
      call += 1;
      if (call === 1) return encodeFunctionResult({ abi, functionName: "decimals", result: 8 }) as Hex;
      const roundId = round.roundId ?? 10n;
      return encodeFunctionResult({ abi, functionName: "latestRoundData", result: [roundId, round.answer, round.updatedAt, round.updatedAt, round.answeredInRound ?? roundId] }) as Hex;
    },
  };
}

const route = { candidateId: "anthropic", tokenAddress: address("1"), feedAddress: address("2"), maxAgeSeconds: 60, stabilitySeconds: 1_800, maxDeviationBps: 1_000 };

test("official feed verification accepts a fresh valid round and normalizes to 18 decimals", async () => {
  const now = new Date("2026-11-19T15:00:00.000Z");
  const updatedAt = BigInt(Math.floor(now.getTime() / 1_000) - 20);
  const evidence = await verifyCandidateOracle(reader({ answer: 30_000_000_000n, updatedAt }), route, now, 299n * 10n ** 18n);
  assert.equal(evidence.passed, true);
  assert.equal(evidence.price18, (300n * 10n ** 18n).toString());
});

test("official feed verification rejects stale and invalid rounds", async () => {
  const now = new Date("2026-11-19T15:00:00.000Z");
  const stale = await verifyCandidateOracle(reader({ answer: 30_000_000_000n, updatedAt: BigInt(Math.floor(now.getTime() / 1_000) - 61) }), route, now);
  const invalid = await verifyCandidateOracle(reader({ answer: -1n, updatedAt: BigInt(Math.floor(now.getTime() / 1_000)) }), route, now);
  assert.equal(stale.failureCode, "FEED_STALE");
  assert.equal(invalid.failureCode, "FEED_ANSWER_INVALID");
});

test("oracle route configuration and deviation policy are data driven", () => {
  const [parsed] = parseCandidateOracleRoutes(JSON.stringify([route]));
  assert.equal(parsed?.stabilitySeconds, 1_800);
  assert.equal(deviationBps(100n, 105n), 500);
});

test("discovers an exact official candidate feed from the Chainlink directory", async () => {
  const tokenAddress = address("1");
  const feedAddress = address("2");
  const routes = await discoverCandidateOracleRoutes({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    directoryUrl: new URL("https://feeds.example/robinhood.json"),
    fetch: async (input) => {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      if (url.hostname === "database.example") return Response.json([{
        candidate_id: "anthropic",
        symbol: "ANT",
        token_address: tokenAddress,
      }]);
      return Response.json([
        { name: "Robinhood ANT / USD", proxyAddress: feedAddress, docs: { baseAsset: "ANT", quoteAsset: "USD" } },
        { name: "Robinhood ANT (24/7)", proxyAddress: address("3"), docs: { baseAsset: "ANT", quoteAsset: "USD" } },
      ]);
    },
  });
  assert.deepEqual(routes, [{ candidateId: "anthropic", tokenAddress, feedAddress }]);
});

test("official feed discovery fails closed on ambiguous exact feeds", async () => {
  await assert.rejects(discoverCandidateOracleRoutes({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    directoryUrl: new URL("https://feeds.example/robinhood.json"),
    fetch: async (input) => {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      if (url.hostname === "database.example") return Response.json([{ candidate_id: "anthropic", symbol: "ANT", token_address: address("1") }]);
      return Response.json([address("2"), address("3")].map((proxyAddress) => ({
        name: "Robinhood ANT / USD",
        proxyAddress,
        docs: { baseAsset: "ANT", quoteAsset: "USD" },
      })));
    },
  }), /Multiple official ANT\/USD feeds/);
});
