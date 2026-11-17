import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseRestClient } from "../../api/src/supabase-rest-client.ts";
import { SupabaseIndexerStore } from "../src/supabase-store.ts";

test("commits events and checkpoint through one atomic RPC", async () => {
  let rpcBody: Record<string, unknown> | undefined;
  const client = new SupabaseRestClient({
    baseUrl: new URL("https://example.supabase.co"),
    secretKey: "sb_secret_test",
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      assert.equal(url.pathname, "/rest/v1/rpc/commit_indexer_batch");
      rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 204 });
    },
  });
  const store = new SupabaseIndexerStore(client, {
    environment: "testnet",
    chainId: 46630,
    consumer: "core-events",
  });

  await store.commit({
    fromBlock: 100n,
    toBlock: 100n,
    finalizedBlock: { number: 100n, hash: `0x${"a".repeat(64)}`, timestamp: new Date(0) },
    events: [
      {
        blockNumber: 100n,
        blockHash: `0x${"a".repeat(64)}`,
        blockTimestamp: new Date("2026-01-01T00:00:00.000Z"),
        transactionHash: `0x${"b".repeat(64)}`,
        transactionIndex: 2,
        logIndex: 3,
        contractAddress: `0x${"c".repeat(40)}`,
        eventName: "FeesAccrued",
        payload: { sharesMinted: "42" },
      },
    ],
  });

  assert.equal(rpcBody?.p_from_block, "100");
  assert.equal(rpcBody?.p_to_block, "100");
  const events = rpcBody?.p_events as Array<Record<string, unknown>>;
  assert.equal(events[0]?.block_number, "100");
  assert.equal(events[0]?.event_name, "FeesAccrued");
});
