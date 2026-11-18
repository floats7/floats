import assert from "node:assert/strict";
import test from "node:test";

import { PostgresKeeperStateDatabase } from "../src/postgres-state-database.ts";

test("serializes bigint transaction payloads without precision loss", async () => {
  let values: readonly unknown[] = [];
  const database = new PostgresKeeperStateDatabase({
    async query(_text, input) {
      values = input;
      return { rows: [] };
    },
  });

  await database.claimJob({
    environment: "testnet",
    chainId: 46630,
    jobName: "options-settlement",
    idempotencyKey: `0x${"11".repeat(32)}`,
    payload: {
      to: `0x${"22".repeat(20)}`,
      data: "0x1234",
      value: 2n ** 255n,
    },
  });

  assert.equal(
    values[4],
    JSON.stringify({
      to: `0x${"22".repeat(20)}`,
      data: "0x1234",
      value: (2n ** 255n).toString(),
    }),
  );
});
