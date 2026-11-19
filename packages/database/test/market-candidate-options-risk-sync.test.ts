import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionResult, parseAbi, type Hex } from "viem";

import { measureOptionsRisk, parseCandidateOptionsRiskRoutes } from "../src/market-candidate-options-risk-sync.ts";

const riskAbi = parseAbi(["function underlyingExposure6(address underlying) view returns (uint256)", "function limits() view returns (uint16 utilizationBps,uint16 underlyingBps,uint16 expiryBps,uint16 seriesBps)", "function vault() view returns (address)"]);
const vaultAbi = parseAbi(["function totalAssets() view returns (uint256)"]);
const address = (digit: string) => `0x${digit.repeat(40)}`;

test("Options exposure warning is derived from the configured onchain cap", async () => {
  let call = 0;
  const evidence = await measureOptionsRisk({
    async call() {
      call += 1;
      if (call === 1) return encodeFunctionResult({ abi: riskAbi, functionName: "underlyingExposure6", result: 45_000_000n }) as Hex;
      if (call === 2) return encodeFunctionResult({ abi: riskAbi, functionName: "limits", result: [500, 500, 500, 250] }) as Hex;
      if (call === 3) return encodeFunctionResult({ abi: riskAbi, functionName: "vault", result: address("4") }) as Hex;
      return encodeFunctionResult({ abi: vaultAbi, functionName: "totalAssets", result: 1_000_000_000n }) as Hex;
    },
    async getCode() { return "0x01"; },
  }, { candidateId: "anthropic", tokenAddress: address("1"), riskManagerAddress: address("2"), warningUtilizationBps: 8_000 });
  assert.equal(evidence.maximumExposure6, "50000000");
  assert.equal(evidence.capUtilizationBps, 9_000);
  assert.equal(evidence.warning, true);
});

test("Options risk route is data driven", () => {
  const [route] = parseCandidateOptionsRiskRoutes(JSON.stringify([{ candidateId: "anthropic", tokenAddress: address("1"), riskManagerAddress: address("2"), warningUtilizationBps: 8_000 }]));
  assert.equal(route?.warningUtilizationBps, 8_000);
});
