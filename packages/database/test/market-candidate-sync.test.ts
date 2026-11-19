import assert from "node:assert/strict";
import test from "node:test";
import { syncOfficialMarketCandidates } from "../src/market-candidate-sync.ts";

test("sync records official detection without making the candidate executable", async () => {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const method = init?.method ?? "GET";
    requests.push({ url: url.toString(), method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.hostname === "api.robinhood.com") {
      if (url.pathname.startsWith("/rhj/prices/")) return Response.json({ quotes: [{ tokenSymbol: "ANT", isTradingHalt: false, generatedAt: "2026-11-19T12:00:00Z" }] });
      return Response.json({ assets: [officialAsset("ANT", `0x${"1".repeat(40)}`), officialAsset("OTHER", `0x${"2".repeat(40)}`)] });
    }
    if (method === "GET") {
      return Response.json([{ candidate_id: "anthropic", symbol: "ANT", lifecycle_status: "listing_expected" }]);
    }
    return new Response(null, { status: 204 });
  };

  const updated = await syncOfficialMarketCandidates({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    fetch: fetchMock,
  });

  assert.equal(updated, 1);
  assert.equal(requests.length, 5);
  assert.equal(requests[3]?.method, "POST");
  assert.match(requests[3]?.url ?? "", /market_candidate_identity_observations/);
  assert.deepEqual(requests[3]?.body, {
    environment: "mainnet",
    chain_id: 4663,
    candidate_id: "anthropic",
    token_address: `0x${"1".repeat(40)}`,
    source_kind: "robinhood_asset_registry",
    source_url: "https://api.robinhood.com/rhj/assets",
    passed: true,
    evidence: {
      assetId: `0x${"3".repeat(64)}`,
      tokenSymbol: "ANT",
      status: "ASSET_STATUS_ACTIVE",
      chainId: 4663,
    },
    evidence_hash: (requests[3]?.body as { evidence_hash: string }).evidence_hash,
    observed_at: (requests[3]?.body as { observed_at: string }).observed_at,
  });
  assert.match((requests[3]?.body as { evidence_hash: string }).evidence_hash, /^0x[0-9a-f]{64}$/);
  assert.equal(requests[4]?.method, "PATCH");
  assert.deepEqual(requests[4]?.body, {
    detected_token_address: `0x${"1".repeat(40)}`,
    asset_uid: `0x${"3".repeat(64)}`,
    isin: "US0000000001",
    logo_url: "https://cdn.example/asset.png",
    official_token_name: "Anthropic • Robinhood Token",
    token_decimals: 18,
    current_multiplier: "1.000000000000000000",
    pending_multiplier: null,
    trading_capabilities: { allDayTradability: "tradable" },
    official_metadata_observed_at: (requests[4]?.body as { official_metadata_observed_at: string }).official_metadata_observed_at,
    trading_halted: false,
    official_quote_generated_at: "2026-11-19T12:00:00Z",
    lifecycle_status: "verification_pending",
    identity_approval_status: "pending",
    disabled_reason: "Canonical identity verification pending",
    last_checked_at: (requests[4]?.body as { last_checked_at: string }).last_checked_at,
    updated_at: (requests[4]?.body as { updated_at: string }).updated_at,
  });
});

test("sync does not rewrite an unchanged pending identity", async () => {
  const requests: string[] = [];
  const address = `0x${"1".repeat(40)}`;
  const fetchMock: typeof fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    requests.push(url.toString());
    if (url.hostname === "api.robinhood.com") return Response.json({ assets: [officialAsset("ANT", address)] });
    return Response.json([{
      candidate_id: "anthropic",
      symbol: "ANT",
      lifecycle_status: "verification_pending",
      detected_token_address: address,
      identity_approval_status: "pending",
    }]);
  };

  const updated = await syncOfficialMarketCandidates({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    fetch: fetchMock,
  });

  assert.equal(updated, 0);
  assert.equal(requests.length, 2);
});

test("approved candidates keep refreshing official metadata and alert on a new trading halt", async () => {
  const tokenAddress = `0x${"1".repeat(40)}`;
  const requests: Array<{ method: string; body: Record<string, unknown> | null }> = [];
  const alerts: unknown[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const method = init?.method ?? "GET";
    requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null });
    if (url.hostname === "api.robinhood.com") {
      if (url.pathname.startsWith("/rhj/prices/")) return Response.json({ quotes: [{ tokenSymbol: "ANT", isTradingHalt: true, generatedAt: "2026-11-19T13:00:00Z" }] });
      return Response.json({ assets: [officialAsset("ANT", tokenAddress)] });
    }
    if (method === "GET") return Response.json([{ candidate_id: "anthropic", symbol: "ANT", lifecycle_status: "active", token_address: tokenAddress, identity_approval_status: "approved", trading_halted: false }]);
    return new Response(null, { status: 204 });
  };

  const updated = await syncOfficialMarketCandidates({
    databaseUrl: new URL("https://database.example"), secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet", chainId: 4663, fetch: fetchMock,
    onAlert: async (alert) => { alerts.push(alert); },
  });

  assert.equal(updated, 1);
  assert.equal(requests.at(-1)?.method, "PATCH");
  assert.equal(requests.at(-1)?.body?.trading_halted, true);
  assert.deepEqual(alerts, [{ severity: "critical", code: "OFFICIAL_TRADING_HALTED", candidateId: "anthropic", symbol: "ANT", tokenAddress, observedAt: (alerts[0] as { observedAt: string }).observedAt }]);
});

function officialAsset(tokenSymbol: string, contractAddress: string) {
  return {
    id: `0x${"3".repeat(64)}`,
    tokenSymbol,
    tokenName: "Anthropic • Robinhood Token",
    status: "ASSET_STATUS_ACTIVE",
    isin: "US0000000001",
    logoUrl: "https://cdn.example/asset.png",
    tokenDecimals: 18,
    currentMultiplier: "1.000000000000000000",
    pendingMultiplier: "",
    tradingCapabilities: { allDayTradability: "tradable" },
    deployments: [{ contractAddress, chainId: 4663 }],
  };
}
