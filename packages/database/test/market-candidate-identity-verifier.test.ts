import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, encodeFunctionResult, keccak256, parseAbi, type Hex } from "viem";
import {
  compareDeploymentLineageWithReferences,
  compareRuntimeCodeWithReferences,
  verifyStockTokenInterface,
  type JsonRpcReader,
} from "../src/market-candidate-identity-verifier.ts";

const ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function uid() view returns (bytes32)",
  "function uiMultiplier() view returns (uint256)",
]);
const address = `0x${"1".repeat(40)}`;
const uid = `0x${"2".repeat(64)}`;

test("accepts the complete canonical Stock Token interface", async () => {
  const code = "0x6001600055" as Hex;
  const evidence = await verifyStockTokenInterface(reader({ code }), { address, symbol: "ANT", assetUid: uid });
  assert.deepEqual(evidence, {
    passed: true,
    address,
    symbol: "ANT",
    tokenName: "Anthropic • Robinhood Token",
    decimals: 18,
    totalSupply: "1000000000000000000000",
    assetUid: uid,
    uiMultiplier18: "1000000000000000000",
    runtimeCodeHash: keccak256(code),
    failures: [],
  });
});

test("fails closed when symbol, decimals, UID, multiplier, or code is invalid", async () => {
  const evidence = await verifyStockTokenInterface(reader({
    symbol: "ANTP",
    tokenName: "Fake Anthropic",
    decimals: 6,
    assetUid: `0x${"3".repeat(64)}`,
    multiplier: 0n,
    code: "0x",
  }), { address, symbol: "ANT", tokenName: "Anthropic • Robinhood Token", assetUid: uid });
  assert.equal(evidence.passed, false);
  assert.deepEqual(evidence.failures, [
    "SYMBOL_MISMATCH",
    "NAME_MISMATCH",
    "DECIMALS_NOT_18",
    "ASSET_UID_MISMATCH",
    "UI_MULTIPLIER_INVALID",
    "RUNTIME_CODE_MISSING",
  ]);
});

test("candidate runtime bytecode must match an approved reference Stock Token", async () => {
  const reference = `0x${"a".repeat(40)}`;
  const code = "0x6001600055" as Hex;
  const evidence = await compareRuntimeCodeWithReferences({
    async call() { throw new Error("not used"); },
    async getCode(target) { return target.toLowerCase() === reference ? code : "0x"; },
  }, keccak256(code), [reference]);
  assert.equal(evidence.passed, true);
  assert.equal(evidence.matchedReferenceAddress, reference);
});

test("candidate deployment lineage must match an approved reference Stock Token creator", async () => {
  const candidate = `0x${"1".repeat(40)}`;
  const reference = `0x${"2".repeat(40)}`;
  const creator = `0x${"a".repeat(40)}`;
  const evidence = await compareDeploymentLineageWithReferences(
    new URL("https://explorer.example"),
    candidate,
    [reference],
    async (input) => {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      const isCandidate = url.pathname.endsWith(candidate);
      return Response.json({
        creator_address_hash: isCandidate ? { hash: creator.toUpperCase().replace("0X", "0x") } : creator,
        creation_tx_hash: `0x${(isCandidate ? "b" : "c").repeat(64)}`,
      });
    },
  );
  assert.equal(evidence.passed, true);
  assert.equal(evidence.candidateCreatorAddress, creator);
  assert.equal(evidence.matchedReferenceAddress, reference);
});

test("candidate deployment lineage fails closed when explorer omits its creator", async () => {
  const candidate = `0x${"1".repeat(40)}`;
  const reference = `0x${"2".repeat(40)}`;
  const evidence = await compareDeploymentLineageWithReferences(
    new URL("https://explorer.example"),
    candidate,
    [reference],
    async (input) => {
      const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      return Response.json(url.pathname.endsWith(candidate) ? {} : { creator_address_hash: `0x${"a".repeat(40)}` });
    },
  );
  assert.equal(evidence.passed, false);
  assert.equal(evidence.candidateCreatorAddress, null);
});

function reader(overrides: {
  symbol?: string;
  tokenName?: string;
  decimals?: number;
  totalSupply?: bigint;
  assetUid?: Hex;
  multiplier?: bigint;
  code?: Hex;
}): JsonRpcReader {
  const values = new Map<string, Hex>([
    [selector("symbol"), encodeFunctionResult({ abi: ABI, functionName: "symbol", result: overrides.symbol ?? "ANT" })],
    [selector("name"), encodeFunctionResult({ abi: ABI, functionName: "name", result: overrides.tokenName ?? "Anthropic • Robinhood Token" })],
    [selector("decimals"), encodeFunctionResult({ abi: ABI, functionName: "decimals", result: overrides.decimals ?? 18 })],
    [selector("totalSupply"), encodeFunctionResult({ abi: ABI, functionName: "totalSupply", result: overrides.totalSupply ?? 1_000n * 10n ** 18n })],
    [selector("uid"), encodeFunctionResult({ abi: ABI, functionName: "uid", result: overrides.assetUid ?? uid })],
    [selector("uiMultiplier"), encodeFunctionResult({ abi: ABI, functionName: "uiMultiplier", result: overrides.multiplier ?? 10n ** 18n })],
  ]);
  return {
    call: async (_address, data) => values.get(data.slice(0, 10)) ?? "0x",
    getCode: async () => overrides.code ?? "0x6001600055",
  };
}

function selector(functionName: "symbol" | "name" | "decimals" | "totalSupply" | "uid" | "uiMultiplier"): string {
  return encodeFunctionData({ abi: ABI, functionName }).slice(0, 10);
}
