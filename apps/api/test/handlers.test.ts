import assert from "node:assert/strict";
import test from "node:test";

import type { ApiContext } from "../src/context.ts";
import {
  getLatestIndexState,
  getNavHistory,
  getOperationalActions,
  getPublicConfig,
  getRegistryChanges,
} from "../src/handlers.ts";
import type { ReadModelRepository } from "../src/read-model-repository.ts";
import type { VaultQuoteReader } from "../src/vault-quote-reader.ts";

function context(readModels: Partial<ReadModelRepository> = {}): ApiContext {
  return {
    publicConfig: {
      appEnvironment: "testnet",
      chainId: 46630,
      blockExplorerUrl: "https://explorer.testnet.chain.robinhood.com/",
      vaultAddress: `0x${"1".repeat(40)}`,
      usdgAddress: `0x${"2".repeat(40)}`,
      walletConnectProjectId: "0123456789abcdef0123456789abcdef",
    },
    vaultAddress: `0x${"1".repeat(40)}`,
    readModels: readModels as ReadModelRepository,
    vaultQuotes: {} as VaultQuoteReader,
  };
}

test("public config endpoint cannot expose Supabase configuration", async () => {
  const response = await getPublicConfig(context());
  const body = JSON.stringify(await response.json());

  assert.equal(response.status, 200);
  assert.equal(body.includes("supabase"), false);
  assert.equal(body.includes("secret"), false);
  assert.match(response.headers.get("cache-control") ?? "", /max-age=15/);
});

test("index state joins holdings at the exact NAV block", async () => {
  let requestedBlock: number | undefined;
  const response = await getLatestIndexState(context({
    latestNav: async () => [{
      block_number: 500,
      nav_usd_18: "250000000000000000000",
      total_supply_18: "200000000000000000000",
      share_price_usd_18: "1250000000000000000",
      oracle_health: { token: "live" },
      observed_at: "2026-01-01T00:00:00Z",
    }],
    listLatestHoldings: async (_vault, block) => {
      requestedBlock = block;
      return [];
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(requestedBlock, 500);
  const payload = await response.json() as { data: { navUsd18: string } };
  assert.equal(payload.data.navUsd18, "250000000000000000000");
});

test("collection endpoints reject unbounded or invalid query parameters", async () => {
  const invalidLimit = await getRegistryChanges(context(), new URL("https://floats.test/api/registry-changes?limit=101"));
  const invalidModule = await getOperationalActions(context(), new URL("https://floats.test/api/operations?module=unknown"));

  assert.equal(invalidLimit.status, 400);
  assert.equal(invalidModule.status, 400);
  assert.deepEqual(await invalidLimit.json(), { error: { code: "INVALID_LIMIT" } });
  assert.deepEqual(await invalidModule.json(), { error: { code: "INVALID_MODULE" } });
});

test("backend failures return a stable error without database details", async () => {
  const response = await getLatestIndexState(context({
    latestNav: async () => { throw new Error("sensitive database relation name"); },
  }));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: "INTERNAL_ERROR" } });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("NAV history is bounded and returned in chronological order", async () => {
  let observedLimit: number | undefined;
  const response = await getNavHistory(context({
    listNavHistory: async (_vault, limit) => {
      observedLimit = limit;
      return [
        { block_number: 20, nav_usd_18: "2", total_supply_18: "1", share_price_usd_18: "2", oracle_health: {}, observed_at: "2026-01-02T00:00:00Z" },
        { block_number: 10, nav_usd_18: "1", total_supply_18: "1", share_price_usd_18: "1", oracle_health: {}, observed_at: "2026-01-01T00:00:00Z" },
      ];
    },
  }), new URL("https://floats.test/api/nav-history?limit=250"));

  assert.equal(observedLimit, 250);
  const payload = await response.json() as { data: Array<{ blockNumber: number }> };
  assert.deepEqual(payload.data.map((point) => point.blockNumber), [10, 20]);

  const invalid = await getNavHistory(context(), new URL("https://floats.test/api/nav-history?limit=1"));
  assert.equal(invalid.status, 400);
});
