import assert from "node:assert/strict";
import test from "node:test";

import { PostgresQuoteNonceSource, type NonceSqlClient } from "../src/postgres-nonce.ts";

test("allocates a buyer-scoped nonce through one atomic database function", async () => {
  let values: readonly unknown[] = [];
  const client: NonceSqlClient = {
    async query(_sql, parameters) {
      values = parameters;
      return { rows: [{ nonce: "17" }] };
    },
  };
  const source = new PostgresQuoteNonceSource(client, "mainnet", 4663);
  const buyer = `0x${"AB".repeat(20)}` as const;
  assert.equal(await source.next(buyer), 17n);
  assert.deepEqual(values, ["mainnet", 4663, buyer.toLowerCase()]);
});

test("fails closed on malformed database output", async () => {
  const client: NonceSqlClient = {
    async query() {
      return { rows: [{ nonce: "-1" }] };
    },
  };
  await assert.rejects(
    new PostgresQuoteNonceSource(client, "testnet", 46630).next(`0x${"11".repeat(20)}`),
    /QUOTE_NONCE_ALLOCATION_FAILED/,
  );
});
