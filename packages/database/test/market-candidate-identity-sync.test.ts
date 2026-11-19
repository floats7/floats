import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, encodeFunctionResult, parseAbi, type Hex } from "viem";
import { verifyPendingMarketCandidateIdentities } from "../src/market-candidate-identity-sync.ts";

const ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function uid() view returns (bytes32)",
  "function uiMultiplier() view returns (uint256)",
]);

test("marks an ANTP-style interface mismatch as suspected fake without approving it", async () => {
  const patches: unknown[] = [];
  const uid = `0x${"2".repeat(64)}` as Hex;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "rpc.example") {
      const rpc = JSON.parse(String(init?.body)) as { id: number; method: string; params: Array<{ data?: Hex } | string> };
      if (rpc.method === "eth_getCode") return Response.json({ jsonrpc: "2.0", id: rpc.id, result: "0x6001" });
      const data = (rpc.params[0] as { data: Hex }).data;
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: rpcResult(data, uid) });
    }
    const method = init?.method ?? "GET";
    if (method === "GET") return Response.json([{
      candidate_id: "anthropic",
      symbol: "ANT",
      official_token_name: "Anthropic • Robinhood Token",
      asset_uid: uid,
      detected_token_address: `0x${"1".repeat(40)}`,
    }]);
    if (method === "PATCH") patches.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  };

  const verified = await verifyPendingMarketCandidateIdentities({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    rpcUrl: new URL("https://rpc.example"),
    fetch: fetchMock,
  });

  assert.equal(verified, 0);
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0], {
    lifecycle_status: "suspected_fake",
    identity_approval_status: "rejected",
    disabled_reason: "Canonical identity mismatch: SYMBOL_MISMATCH, NAME_MISMATCH",
    last_checked_at: (patches[0] as { last_checked_at: string }).last_checked_at,
    updated_at: (patches[0] as { updated_at: string }).updated_at,
  });
});

test("keeps canonical verification progressing when the optional lineage explorer is unavailable", async () => {
  const patches: unknown[] = [];
  const observations: Array<{ source_kind: string; evidence: { available?: boolean; reason?: string } }> = [];
  const uid = `0x${"2".repeat(64)}` as Hex;
  const token = `0x${"1".repeat(40)}`;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "rpc.example") {
      const rpc = JSON.parse(String(init?.body)) as { id: number; method: string; params: Array<{ data?: Hex } | string> };
      if (rpc.method === "eth_getCode") return Response.json({ jsonrpc: "2.0", id: rpc.id, result: "0x6001" });
      const data = (rpc.params[0] as { data: Hex }).data;
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: canonicalRpcResult(data, uid) });
    }
    if (url.hostname === "explorer.example") return new Response(null, { status: 403 });
    const method = init?.method ?? "GET";
    if (method === "GET") return Response.json([{
      candidate_id: "anthropic",
      symbol: "ANT",
      official_token_name: "Anthropic • Robinhood Token",
      asset_uid: uid,
      detected_token_address: token,
    }]);
    if (method === "PATCH") patches.push(JSON.parse(String(init?.body)));
    if (method === "POST") observations.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  };

  const verified = await verifyPendingMarketCandidateIdentities({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    rpcUrl: new URL("https://rpc.example"),
    explorerUrl: new URL("https://explorer.example"),
    referenceTokenAddresses: [`0x${"3".repeat(40)}`],
    fetch: fetchMock,
  });

  assert.equal(verified, 1);
  assert.equal(patches.length, 1);
  const lineage = observations.find((item) => item.source_kind === "deployer");
  assert.equal(lineage?.evidence.available, false);
  assert.equal(lineage?.evidence.reason, "Lineage explorer returned 403");
});

function rpcResult(data: Hex, uid: Hex): Hex {
  const selector = data.slice(0, 10);
  const values = new Map<string, Hex>([
    [selectorFor("symbol"), encodeFunctionResult({ abi: ABI, functionName: "symbol", result: "ANTP" })],
    [selectorFor("name"), encodeFunctionResult({ abi: ABI, functionName: "name", result: "Fake Anthropic" })],
    [selectorFor("decimals"), encodeFunctionResult({ abi: ABI, functionName: "decimals", result: 18 })],
    [selectorFor("totalSupply"), encodeFunctionResult({ abi: ABI, functionName: "totalSupply", result: 1n })],
    [selectorFor("uid"), encodeFunctionResult({ abi: ABI, functionName: "uid", result: uid })],
    [selectorFor("uiMultiplier"), encodeFunctionResult({ abi: ABI, functionName: "uiMultiplier", result: 10n ** 18n })],
  ]);
  return values.get(selector) ?? "0x";
}

function canonicalRpcResult(data: Hex, uid: Hex): Hex {
  const selector = data.slice(0, 10);
  const values = new Map<string, Hex>([
    [selectorFor("symbol"), encodeFunctionResult({ abi: ABI, functionName: "symbol", result: "ANT" })],
    [selectorFor("name"), encodeFunctionResult({ abi: ABI, functionName: "name", result: "Anthropic • Robinhood Token" })],
    [selectorFor("decimals"), encodeFunctionResult({ abi: ABI, functionName: "decimals", result: 18 })],
    [selectorFor("totalSupply"), encodeFunctionResult({ abi: ABI, functionName: "totalSupply", result: 1n })],
    [selectorFor("uid"), encodeFunctionResult({ abi: ABI, functionName: "uid", result: uid })],
    [selectorFor("uiMultiplier"), encodeFunctionResult({ abi: ABI, functionName: "uiMultiplier", result: 10n ** 18n })],
  ]);
  return values.get(selector) ?? "0x";
}

function selectorFor(functionName: "symbol" | "name" | "decimals" | "totalSupply" | "uid" | "uiMultiplier"): string {
  return encodeFunctionData({ abi: ABI, functionName }).slice(0, 10);
}
