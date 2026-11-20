import assert from "node:assert/strict";
import test from "node:test";
import { resolvePerpsSession } from "../src/perps-session.ts";

const full = { extendedHours: true, overnight: true };
test("resolves Perps sessions with holidays and early closes", () => {
  assert.equal(resolvePerpsSession(new Date("2026-11-25T15:00:00Z"), full), "regular");
  assert.equal(resolvePerpsSession(new Date("2026-11-26T15:00:00Z"), full), "closed");
  assert.equal(resolvePerpsSession(new Date("2026-11-27T17:30:00Z"), full), "regular");
  assert.equal(resolvePerpsSession(new Date("2026-11-27T19:00:00Z"), full), "extended");
});

test("fails closed when an asset lacks off-hours capability", () => {
  const regularOnly = { extendedHours: false, overnight: false };
  assert.equal(resolvePerpsSession(new Date("2026-11-25T13:00:00Z"), regularOnly), "closed");
});
