import assert from "node:assert/strict";
import test from "node:test";
import { syncOfficialMarketCandidates } from "../src/market-candidate-sync.ts";

test("sync promotes only an existing candidate with an official active deployment", async () => {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const method = init?.method ?? "GET";
    requests.push({ url: url.toString(), method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.hostname === "api.robinhood.com") {
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
  assert.equal(requests.length, 3);
  assert.equal(requests[2]?.method, "PATCH");
  assert.deepEqual(requests[2]?.body, {
    token_address: `0x${"1".repeat(40)}`,
    asset_uid: `0x${"3".repeat(64)}`,
    isin: "US0000000001",
    token_live: true,
    lifecycle_status: "oracle_pending",
    disabled_reason: "Oracle verification pending",
    last_checked_at: (requests[2]?.body as { last_checked_at: string }).last_checked_at,
    updated_at: (requests[2]?.body as { updated_at: string }).updated_at,
  });
});

function officialAsset(tokenSymbol: string, contractAddress: string) {
  return {
    id: `0x${"3".repeat(64)}`,
    tokenSymbol,
    status: "ASSET_STATUS_ACTIVE",
    isin: "US0000000001",
    logoUrl: "https://cdn.example/asset.png",
    deployments: [{ contractAddress, chainId: 4663 }],
  };
}
