import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTradingCapabilities } from "../src/trading-capabilities.ts";

test("normalizes the live nested Robinhood capability shape", () => {
  assert.deepEqual(normalizeTradingCapabilities({
    market: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
    extended: { whole: "TRADING_STATUS_UNTRADABLE", fractional: "TRADING_STATUS_POSITION_CLOSING_ONLY" },
    overnight: { whole: "TRADING_STATUS_UNTRADABLE", fractional: "TRADING_STATUS_UNTRADABLE" },
  }), { market: "tradable", extended: "restricted", overnight: "unavailable" });
});

test("normalizes the documented flat Robinhood capability shape", () => {
  assert.deepEqual(normalizeTradingCapabilities({
    fractionalTradability: "tradable",
    allDayTradability: "position_closing_only",
    extendedHoursFractionalTradability: false,
  }), { market: "tradable", extended: "unavailable", overnight: "restricted" });
});

test("fails closed to unknown for malformed capability data", () => {
  assert.deepEqual(normalizeTradingCapabilities(null), {
    market: "unknown", extended: "unknown", overnight: "unknown",
  });
});
