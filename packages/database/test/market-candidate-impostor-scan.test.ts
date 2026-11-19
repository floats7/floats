import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionResult, parseAbi } from "viem";
import { scanMarketCandidateImpostors } from "../src/market-candidate-impostor-scan.ts";

const metadataAbi = parseAbi(["function symbol() view returns (string)", "function name() view returns (string)"]);

test("records and alerts for explorer tokens that imitate a candidate", async () => {
  const canonical = `0x${"1".repeat(40)}`;
  const impostor = `0x${"2".repeat(40)}`;
  const writes: unknown[] = [];
  const alerts: unknown[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "explorer.example") return Response.json({ items: [
      { type: "token", address_hash: canonical, symbol: "ANT", name: "Anthropic" },
      { type: "token", address_hash: impostor, symbol: "ANT", name: "Anthropic Token" },
      { type: "token", address_hash: `0x${"3".repeat(40)}`, symbol: "OTHER", name: "Unrelated" },
    ] });
    if ((init?.method ?? "GET") === "GET") return Response.json([{
      candidate_id: "anthropic",
      symbol: "ANT",
      company_name: "Anthropic",
      detected_token_address: canonical,
      token_address: null,
    }]);
    writes.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  };
  const count = await scanMarketCandidateImpostors({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    explorerUrl: new URL("https://explorer.example"),
    rpcUrl: new URL("https://rpc.example"),
    fetch: fetchMock,
    onAlert: async (alert) => { alerts.push(alert); },
  });
  assert.equal(count, 1);
  assert.equal(writes.length, 1);
  assert.equal((writes[0] as { token_address: string }).token_address, impostor);
  assert.equal(alerts.length, 1);
});

test("falls back to recent onchain mints when explorer search is unavailable", async () => {
  const impostor = `0x${"4".repeat(40)}`;
  const alerts: unknown[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "explorer.example") return new Response(null, { status: 403 });
    if (url.hostname === "database.example" && (init?.method ?? "GET") === "GET") return Response.json([{
      candidate_id: "anthropic-fallback",
      symbol: "ANT",
      company_name: "Anthropic",
      detected_token_address: null,
      token_address: null,
    }]);
    if (url.hostname === "rpc.example") {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
      if (body.method === "eth_blockNumber") return Response.json({ jsonrpc: "2.0", id: body.id, result: "0x2710" });
      if (body.method === "eth_getLogs") return Response.json({ jsonrpc: "2.0", id: body.id, result: [{ address: impostor }] });
      const call = (body.params[0] as { data: string }).data;
      const symbolSelector = "0x95d89b41";
      const result = call === symbolSelector
        ? encodeFunctionResult({ abi: metadataAbi, functionName: "symbol", result: "ANT" })
        : encodeFunctionResult({ abi: metadataAbi, functionName: "name", result: "Anthropic Fake" });
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    }
    return new Response(null, { status: 204 });
  };
  const count = await scanMarketCandidateImpostors({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    explorerUrl: new URL("https://explorer.example"),
    rpcUrl: new URL("https://rpc.example"),
    fetch: fetchMock,
    onAlert: async (alert) => { alerts.push(alert); },
  });
  assert.equal(count, 1);
  assert.equal(alerts.length, 1);
  assert.deepEqual((alerts[0] as { failures: string[] }).failures, ["NON_CANONICAL_ONCHAIN_TOKEN"]);
});

test("detects configured candidate aliases without treating them as canonical identity", async () => {
  const impostor = `0x${"5".repeat(40)}`;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "explorer.example") return Response.json({ items: [
      { type: "token", address_hash: impostor, symbol: "OAI", name: "ChatGPT Stock Token" },
    ] });
    if ((init?.method ?? "GET") === "GET") return Response.json([{
      candidate_id: "openai",
      symbol: "OPENAI",
      company_name: "OpenAI",
      detected_token_address: null,
      token_address: null,
      impostor_aliases: ["OAI", "ChatGPT"],
    }]);
    return new Response(null, { status: 204 });
  };
  const count = await scanMarketCandidateImpostors({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    explorerUrl: new URL("https://explorer.example"),
    rpcUrl: new URL("https://rpc.example"),
    fetch: fetchMock,
  });
  assert.equal(count, 1);
});
