import assert from "node:assert/strict";
import test from "node:test";

import { calculateBasketRealizedVolatility } from "../src/basket-volatility.ts";

const unit = 10n ** 18n;

test("annualizes sample volatility from ordered finalized basket closes", () => {
  const returns = [0.01, -0.02, 0.015, -0.005, 0.012, -0.008];
  let price = 100;
  const prices = [price];
  for (const value of returns) {
    price *= Math.exp(value);
    prices.push(price);
  }
  const observations = prices.map((value, index) => ({
    sessionDate: `2026-01-${String(index + 1).padStart(2, "0")}`,
    sharePriceUsd18: BigInt(Math.round(value * 1e9)) * 10n ** 9n,
  }));

  const result = calculateBasketRealizedVolatility(observations, returns.length);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const expected = Math.sqrt(
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (returns.length - 1) * 252,
  );
  assert.ok(Math.abs(result.annualizedVolatility - expected) < 1e-8);
  assert.equal(result.sampleSize, returns.length);
});

test("rejects sparse, duplicate, or invalid basket close history", () => {
  assert.throws(() => calculateBasketRealizedVolatility([
    { sessionDate: "2026-01-01", sharePriceUsd18: 100n * unit },
  ]), /INSUFFICIENT_NAV_HISTORY/);
  assert.throws(() => calculateBasketRealizedVolatility([
    { sessionDate: "2026-01-01", sharePriceUsd18: 100n * unit },
    { sessionDate: "2026-01-01", sharePriceUsd18: 101n * unit },
    { sessionDate: "2026-01-02", sharePriceUsd18: 102n * unit },
  ], 2), /NAV_SESSIONS_NOT_STRICTLY_ORDERED/);
});
