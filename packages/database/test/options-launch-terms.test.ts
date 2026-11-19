import assert from "node:assert/strict";
import test from "node:test";
import { buildLaunchStrikes, expiryAtUsMarketClose } from "../src/options-launch-terms.ts";

test("builds ATM and plus/minus launch strikes with a 1.5x call cap", () => {
  const strikes = buildLaunchStrikes(100n * 10n ** 18n);
  assert.deepEqual(strikes.map((item) => [item.label, item.strikeUsd18 / 10n ** 18n, item.cappedCallCapUsd18 / 10n ** 18n]), [
    ["minus-20", 80n, 120n],
    ["minus-10", 90n, 135n],
    ["atm", 100n, 150n],
    ["plus-10", 110n, 165n],
    ["plus-20", 120n, 180n],
  ]);
});

test("creates regular-close expiries and rejects Thanksgiving or its early close", () => {
  assert.equal(new Date(expiryAtUsMarketClose("2026-11-25") * 1_000).toISOString(), "2026-11-25T21:00:00.000Z");
  assert.equal(new Date(expiryAtUsMarketClose("2026-12-04") * 1_000).toISOString(), "2026-12-04T21:00:00.000Z");
  assert.throws(() => expiryAtUsMarketClose("2026-11-26"), /closed market/);
  assert.throws(() => expiryAtUsMarketClose("2026-11-27"), /early-close/);
});
