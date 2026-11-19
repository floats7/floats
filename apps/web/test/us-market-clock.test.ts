import assert from "node:assert/strict";
import test from "node:test";
import { currentPublicEquitySession, dateInNewYork, isDebutingToday, listingOpenAt } from "../src/lib/us-market-clock.ts";

test("resolves the New York listing date independently from the browser timezone", () => {
  assert.equal(dateInNewYork(new Date("2026-11-19T04:59:00Z")), "2026-11-18");
  assert.equal(dateInNewYork(new Date("2026-11-19T05:00:00Z")), "2026-11-19");
  assert.equal(isDebutingToday("2026-11-19", new Date("2026-11-19T12:00:00Z")), true);
});

test("identifies regular, extended, overnight, and closed sessions", () => {
  assert.equal(currentPublicEquitySession(new Date("2026-11-19T15:00:00Z")), "market");
  assert.equal(currentPublicEquitySession(new Date("2026-11-19T13:00:00Z")), "extended");
  assert.equal(currentPublicEquitySession(new Date("2026-11-19T02:00:00Z")), "overnight");
  assert.equal(currentPublicEquitySession(new Date("2026-11-26T15:00:00Z")), "closed");
});

test("converts the ANT Nasdaq opening time using the New York offset", () => {
  assert.equal(listingOpenAt("2026-11-19").toISOString(), "2026-11-19T14:30:00.000Z");
  assert.equal(listingOpenAt("2026-07-01").toISOString(), "2026-07-01T13:30:00.000Z");
});
