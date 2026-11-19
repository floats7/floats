import assert from "node:assert/strict";
import test from "node:test";

import { PrivateQuoteRuntime, type UnsignedRuntimeQuote } from "../src/runtime.ts";
import { PricerService, type QuoteAuditRecord } from "../src/service.ts";

const seriesId = `0x${"11".repeat(32)}` as const;
const buyer = `0x${"22".repeat(20)}` as const;

test("private runtime binds buyer, nonce, spot, size, side, and 30-second deadline", async () => {
  const audits: QuoteAuditRecord[] = [];
  let signed: UnsignedRuntimeQuote | undefined;
  const runtime = new PrivateQuoteRuntime(
    new PricerService({ async append(record) { audits.push(record); } }),
    {
      async load() {
        return {
          signedSpotUsd18: 150n * 10n ** 18n,
          policyInput: {
            pricing: {
              kind: "capped-call",
              spotUsd: 150,
              strikeUsd: 100,
              capUsd: 200,
              timeToExpiryYears: 7 / 365,
              riskFreeRate: 0.04,
              contractSize: 1,
            },
            ivObservations: [{
              source: "basket-realized",
              annualizedVolatility: 0.7,
              observedAtSeconds: 999,
            }],
            maximumIvAgeSeconds: 60,
            minimumVolatility: 0.4,
            baseSpreadBps: 500,
            oracleHealthy: true,
            utilizationBps: 2_500,
            sectorPeerMultiplier: 1.5,
            basketPremium: 0.1,
            utilizationWideningBpsAtMaximum: 500,
          },
        };
      },
    },
    { async next() { return 7n; } },
    {
      async sign(quote) {
        signed = quote;
        return `0x${"33".repeat(65)}`;
      },
    },
    () => 1_000,
  );

  const result = await runtime.quote({
    requestId: "request-1",
    seriesId,
    buyer,
    side: "buy",
    size18: 2n * 10n ** 18n,
  });

  assert.equal(signed?.buyer, buyer);
  assert.equal(signed?.size18, 2n * 10n ** 18n);
  assert.equal(signed?.signedSpotUsd18, 150n * 10n ** 18n);
  assert.equal(signed?.nonce, 7n);
  assert.equal(signed?.issuedAt, 1_000);
  assert.equal(signed?.validUntil, 1_030);
  assert.equal(result.signature.length, 132);
  assert.equal(result.utilizationBps, 2_500);
  assert.equal(audits[0]?.decision, "quoted");
});

test("private runtime rejects malformed signer output", async () => {
  const runtime = new PrivateQuoteRuntime(
    new PricerService({ async append() {} }),
    {
      async load() {
        return {
          signedSpotUsd18: 100n * 10n ** 18n,
          policyInput: {
            pricing: {
              kind: "put",
              spotUsd: 100,
              strikeUsd: 100,
              timeToExpiryYears: 1,
              riskFreeRate: 0,
              contractSize: 1,
            },
            ivObservations: [{
              source: "external-implied",
              annualizedVolatility: 0.5,
              observedAtSeconds: 999,
            }],
            maximumIvAgeSeconds: 60,
            minimumVolatility: 0.4,
            baseSpreadBps: 500,
            oracleHealthy: true,
            utilizationBps: 0,
            sectorPeerMultiplier: 1.5,
            basketPremium: 0,
            utilizationWideningBpsAtMaximum: 0,
          },
        };
      },
    },
    { async next() { return 1n; } },
    { async sign() { return "0x1234"; } },
    () => 1_000,
  );

  await assert.rejects(() => runtime.quote({
    requestId: "request-2",
    seriesId,
    buyer,
    side: "sell-back",
    size18: 10n ** 18n,
  }), /INVALID_KMS_SIGNATURE/);
});
