import assert from "node:assert/strict";
import test from "node:test";

import { calculatePriceImpactBps } from "../src/lib/spot-transactions.ts";

test("spot price impact compares executable quote against a marginal probe", () => {
  assert.equal(calculatePriceImpactBps(100n, 97n, 1n, 1n), 300);
  assert.equal(calculatePriceImpactBps(100n, 96n, 1n, 1n), 400);
  assert.equal(calculatePriceImpactBps(100n, 101n, 1n, 1n), 0);
});
