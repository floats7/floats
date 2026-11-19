import assert from "node:assert/strict";
import test from "node:test";
import {
  addUsTradingDays,
  fifthUsTradingDay,
  isUsTradingDay,
  usEquitySession,
} from "../src/us-equity-calendar.ts";

test("computes ANT day five without landing on Thanksgiving", () => {
  assert.equal(fifthUsTradingDay("2026-11-19"), "2026-11-25");
  assert.equal(isUsTradingDay("2026-11-26"), false);
  assert.deepEqual(usEquitySession("2026-11-27"), { state: "early_close", closeEt: "13:00" });
});

test("skips weekends and full US market holidays", () => {
  assert.equal(addUsTradingDays("2026-06-18", 1), "2026-06-22");
  assert.equal(addUsTradingDays("2026-12-24", 1), "2026-12-28");
  assert.equal(addUsTradingDays("2026-01-02", -1), "2025-12-31");
});

test("rejects a listing date that is not a trading day", () => {
  assert.throws(() => fifthUsTradingDay("2026-11-21"), /must be a US trading day/);
  assert.throws(() => fifthUsTradingDay("2026-02-30"), /invalid/);
});
