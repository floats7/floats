import assert from "node:assert/strict";
import test from "node:test";
import { isUsMarketOpen, nextUsMarketOpen } from "../src/lib/market-hours.ts";

test("US market status closes for Thanksgiving 2026", () => {
  assert.equal(isUsMarketOpen(new Date("2026-11-26T17:00:00.000Z")), false);
});

test("US market status observes the 13:00 ET close after Thanksgiving 2026", () => {
  assert.equal(isUsMarketOpen(new Date("2026-11-27T17:59:00.000Z")), true);
  assert.equal(isUsMarketOpen(new Date("2026-11-27T18:00:00.000Z")), false);
});

test("US market status keeps a normal weekday open through 16:00 ET", () => {
  assert.equal(isUsMarketOpen(new Date("2026-11-25T20:59:00.000Z")), true);
  assert.equal(isUsMarketOpen(new Date("2026-11-25T21:00:00.000Z")), false);
});

test("next US market open skips a weekend and returns UTC", () => {
  assert.equal(
    nextUsMarketOpen(new Date("2026-11-21T03:00:00.000Z")).toISOString(),
    "2026-11-23T14:30:00.000Z",
  );
});

test("next US market open skips Thanksgiving", () => {
  assert.equal(
    nextUsMarketOpen(new Date("2026-11-25T22:00:00.000Z")).toISOString(),
    "2026-11-27T14:30:00.000Z",
  );
});
