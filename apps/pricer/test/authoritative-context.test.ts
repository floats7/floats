import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthoritativePricingContextSource,
  isWithinLaunchTradingDays,
  type OptionsChainPricingReader,
  type PricingSqlClient,
} from "../src/authoritative-context.ts";

test("builds multi-asset pricing context from canonical series, oracle, risk, and IV state", async () => {
  let queries = 0;
  const database: PricingSqlClient = {
    async query() {
      queries += 1;
      if (queries === 1) return { rows: [{
        underlying: `0x${"11".repeat(20)}`,
        price_source: `0x${"22".repeat(20)}`,
        kind: "0",
        strike_usd_18: "100000000000000000000",
        cap_usd_18: "200000000000000000000",
        expiry: "2000000",
        contract_size_18: "1000000000000000000",
        state: "0",
        listing_date: null,
      }] };
      return { rows: [{ source: "external-implied", annualized_volatility: 0.7, observed_at_seconds: "999900" }] };
    },
  };
  const chain: OptionsChainPricingReader = {
    async spot() { return { priceUsd18: 125n * 10n ** 18n, healthy: true }; },
    async vaultAccounting() { return { totalAssets6: 750_000_000n, reservedCollateral6: 250_000_000n }; },
  };
  const source = new AuthoritativePricingContextSource(database, chain, "testnet", 46630, 0.05);
  const result = await source.load({
    requestId: "request",
    seriesId: `0x${"33".repeat(32)}`,
    buyer: `0x${"44".repeat(20)}`,
    side: "buy",
    size18: 10n ** 18n,
  }, 1_000_000);
  assert.equal(result.signedSpotUsd18, 125n * 10n ** 18n);
  assert.equal(result.policyInput.pricing.spotUsd, 125);
  assert.equal(result.policyInput.utilizationBps, 2500);
  assert.equal(result.policyInput.ivObservations[0]?.annualizedVolatility, 0.7);
  assert.equal(result.policyInput.minimumVolatility, 0.4);
  assert.equal(result.policyInput.baseSpreadBps, 1_000);
});

test("applies launch policy across the first three US trading days", () => {
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1_000);
  assert.equal(isWithinLaunchTradingDays("2026-11-19", at("2026-11-19T15:00:00Z"), 3), true);
  assert.equal(isWithinLaunchTradingDays("2026-11-19", at("2026-11-23T15:00:00Z"), 3), true);
  assert.equal(isWithinLaunchTradingDays("2026-11-19", at("2026-11-24T15:00:00Z"), 3), false);
  assert.equal(isWithinLaunchTradingDays("2026-11-19", at("2026-11-26T15:00:00Z"), 3), false);
});

test("fails closed when a series is inactive", async () => {
  const database: PricingSqlClient = {
    async query() { return { rows: [{ state: "2" }] }; },
  };
  const chain = {} as OptionsChainPricingReader;
  const source = new AuthoritativePricingContextSource(database, chain, "mainnet", 4663, 0.05);
  await assert.rejects(source.load({
    requestId: "request",
    seriesId: `0x${"33".repeat(32)}`,
    buyer: `0x${"44".repeat(20)}`,
    side: "buy",
    size18: 1n,
  }, 1_000_000), /SERIES_NOT_ACTIVE/);
});

test("direct pricer requests cannot bypass candidate pause or exposure gates", async () => {
  const base = {
    underlying: `0x${"11".repeat(20)}`, price_source: `0x${"22".repeat(20)}`, kind: "0",
    strike_usd_18: "100000000000000000000", cap_usd_18: "200000000000000000000",
    expiry: "2000000", contract_size_18: "1000000000000000000", state: "0", listing_date: "2026-11-19",
    candidate_id: "anthropic", identity_approval_status: "approved", token_live: true,
    oracle_ready: true, trading_halted: false, trading_capabilities: { market: { whole: "tradable" } },
    options_paused: false, options_exposure_warning: true,
  };
  const database: PricingSqlClient = { async query() { return { rows: [base] }; } };
  const source = new AuthoritativePricingContextSource(database, {} as OptionsChainPricingReader, "mainnet", 4663, 0.05);
  await assert.rejects(source.load({ requestId: "request", seriesId: `0x${"33".repeat(32)}`, buyer: `0x${"44".repeat(20)}`, side: "buy", size18: 1n }, 1_000_000), /OPTIONS_EXPOSURE_WARNING/);
});
