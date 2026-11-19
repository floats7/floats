import assert from "node:assert/strict";
import test from "node:test";

import { deriveRebalanceProgress } from "../src/lib/rebalance-progress.ts";
import type { OperationalActionDto } from "../src/lib/api-client.ts";

const action = (name: string, hash: string): OperationalActionDto => ({ transaction_hash: `0x${"1".repeat(64)}`, log_index: 0, block_number: 1, module: "rebalance", action: name, payload: { instructionHash: hash }, observed_at: "2026-11-19T00:00:00Z" });

test("rebalance progress counts only live authorized chunks", () => {
  const first = `0x${"a".repeat(64)}`;
  const second = `0x${"b".repeat(64)}`;
  const progress = deriveRebalanceProgress([action("InstructionAuthorized", first), action("InstructionExecuted", first), action("InstructionAuthorized", second), action("InstructionCancelled", second)]);
  assert.deepEqual(progress, { authorized: 1, executed: 1 });
});
