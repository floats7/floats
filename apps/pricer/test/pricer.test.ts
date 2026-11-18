import assert from "node:assert/strict";
import test from "node:test";

import { blackScholesPremium } from "../src/black-scholes.ts";
import { priceQuote } from "../src/quote-policy.ts";
import { PricerService, type QuoteAuditRecord } from "../src/service.ts";
import { binomialReferencePremium } from "./binomial-reference.ts";

const basePricing = {
  kind: "capped-call" as const,
  spotUsd: 100,
  strikeUsd: 100,
  capUsd: 120,
  timeToExpiryYears: 1,
  riskFreeRate: 0,
  contractSize: 1,
};

test("Black-Scholes matches the standard ATM call reference", () => {
  const premium = blackScholesPremium({
    ...basePricing,
    capUsd: 10_000,
    volatility: 0.2,
  });
  assert.ok(Math.abs(premium - 7.9656) < 0.001);
});

test("Black-Scholes differentially matches an independent binomial grid", () => {
  const vectors = [
    { kind: "capped-call" as const, spotUsd: 80, strikeUsd: 100, capUsd: 140 },
    { kind: "capped-call" as const, spotUsd: 100, strikeUsd: 100, capUsd: 140 },
    { kind: "capped-call" as const, spotUsd: 130, strikeUsd: 100, capUsd: 140 },
    { kind: "put" as const, spotUsd: 80, strikeUsd: 100 },
    { kind: "put" as const, spotUsd: 100, strikeUsd: 100 },
    { kind: "put" as const, spotUsd: 130, strikeUsd: 100 },
  ];
  for (const vector of vectors) {
    const input = {
      ...vector,
      timeToExpiryYears: 0.25,
      volatility: 0.6,
      riskFreeRate: 0.03,
      contractSize: 1,
    };
    const analytical = blackScholesPremium(input);
    const reference = binomialReferencePremium(input);
    assert.ok(
      Math.abs(analytical - reference) < 0.08,
      `${vector.kind} ${vector.spotUsd} diverged: ${analytical} vs ${reference}`,
    );
  }
});

test("capped call and put premiums remain inside solvency bounds", () => {
  const call = blackScholesPremium({ ...basePricing, volatility: 0.8 });
  const put = blackScholesPremium({
    kind: "put",
    spotUsd: basePricing.spotUsd,
    strikeUsd: basePricing.strikeUsd,
    timeToExpiryYears: basePricing.timeToExpiryYears,
    riskFreeRate: basePricing.riskFreeRate,
    contractSize: basePricing.contractSize,
    volatility: 0.8,
  });
  assert.ok(call >= 0 && call <= 20);
  assert.ok(put >= 0 && put <= 100);
});

test("quote policy applies IV priority, floor, side, and utilization spread", () => {
  const common = {
    pricing: basePricing,
    ivObservations: [
      { source: "basket-realized" as const, annualizedVolatility: 0.3, observedAtSeconds: 990 },
      { source: "sector-peer" as const, annualizedVolatility: 0.2, observedAtSeconds: 990 },
    ],
    nowSeconds: 1_000,
    maximumIvAgeSeconds: 60,
    ipoDay: true,
    offHours: false,
    oracleHealthy: true,
    utilizationBps: 8_000,
    sectorPeerMultiplier: 1.5,
    basketPremium: 0.1,
    utilizationWideningBpsAtMaximum: 500,
  };
  const buy = priceQuote({ ...common, side: "buy" });
  const sell = priceQuote({ ...common, side: "sell-back" });

  assert.equal(buy.ivSource, "sector-peer");
  assert.equal(buy.volatility, 0.6);
  assert.equal(buy.spreadBps, 1_400);
  assert.ok(buy.premiumUsd > sell.premiumUsd);
  assert.ok(buy.premiumPerUnit6 > sell.premiumPerUnit6);
});

test("quote policy fails closed for stale IV or unhealthy oracle", () => {
  const common = {
    pricing: basePricing,
    ivObservations: [
      { source: "external-implied" as const, annualizedVolatility: 0.7, observedAtSeconds: 900 },
    ],
    nowSeconds: 1_000,
    maximumIvAgeSeconds: 60,
    ipoDay: false,
    offHours: false,
    oracleHealthy: true,
    utilizationBps: 0,
    side: "buy" as const,
    sectorPeerMultiplier: 1.5,
    basketPremium: 0.1,
    utilizationWideningBpsAtMaximum: 500,
  };
  assert.throws(() => priceQuote(common), /IV_UNAVAILABLE/);
  assert.throws(() => priceQuote({ ...common, oracleHealthy: false }), /ORACLE_UNAVAILABLE/);
});

test("pricer records both issued and rejected quote decisions", async () => {
  const records: QuoteAuditRecord[] = [];
  const service = new PricerService({
    async append(record) {
      records.push(record);
    },
  });
  const policyInput = {
    pricing: basePricing,
    ivObservations: [
      { source: "external-implied" as const, annualizedVolatility: 0.7, observedAtSeconds: 990 },
    ],
    nowSeconds: 1_000,
    maximumIvAgeSeconds: 60,
    ipoDay: false,
    offHours: false,
    oracleHealthy: true,
    utilizationBps: 0,
    side: "buy" as const,
    sectorPeerMultiplier: 1.5,
    basketPremium: 0.1,
    utilizationWideningBpsAtMaximum: 500,
  };
  const request = {
    requestId: "quote-1",
    seriesId: `0x${"11".repeat(32)}` as const,
    buyer: `0x${"22".repeat(20)}` as const,
    policyInput,
  };

  await service.price(request);
  await assert.rejects(() => service.price({
    ...request,
    requestId: "quote-2",
    policyInput: { ...policyInput, oracleHealthy: false },
  }), /ORACLE_UNAVAILABLE/);
  assert.deepEqual(records.map((record) => record.decision), ["quoted", "rejected"]);
  assert.equal(records[1]?.reason, "ORACLE_UNAVAILABLE");
});
