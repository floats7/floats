import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import { ViemTransactionClient } from "../src/viem-transaction-client.ts";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const request = {
  to: `0x${"22".repeat(20)}` as const,
  data: "0x1234" as const,
  value: 0n,
};

test("simulates immediately before broadcasting with a bounded gas buffer and pending nonce", async () => {
  const calls: string[] = [];
  const client = new ViemTransactionClient(account, {
    async call() { calls.push("call"); },
    async estimateGas() { calls.push("estimate"); return 100n; },
    async getTransactionCount() { calls.push("nonce"); return 7; },
    async waitForTransactionReceipt() { return { blockNumber: 10n, status: "success" }; },
  }, {
    async sendTransaction(input) {
      calls.push("send");
      assert.equal(input.gas, 120n);
      assert.equal(input.nonce, 7);
      return `0x${"33".repeat(32)}`;
    },
  });

  assert.deepEqual(await client.simulate(request), { success: true, gasEstimate: 100n });
  const sent = await client.send(request);
  assert.equal(sent.nonce, 7n);
  assert.deepEqual(calls, ["call", "estimate", "nonce", "send"]);
  assert.equal((await client.receipt(sent.hash))?.success, true);
});

test("refuses unsimulated broadcast and treats a missing receipt as pending", async () => {
  const client = new ViemTransactionClient(account, {
    async call() {},
    async estimateGas() { return 100n; },
    async getTransactionCount() { return 1; },
    async waitForTransactionReceipt() { throw new Error("transaction could not be found"); },
  }, {
    async sendTransaction() { return `0x${"44".repeat(32)}`; },
  });

  await assert.rejects(() => client.send(request), /simulated immediately/);
  assert.equal(await client.receipt(`0x${"44".repeat(32)}`), undefined);
});
