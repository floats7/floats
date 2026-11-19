import assert from "node:assert/strict";
import test from "node:test";
import {
  createPendingMessage,
  evaluateCrossChainAlerts,
  reconcileMessages,
  reconcileSupply,
  transitionMessage,
  type CrossChainMessage,
} from "../src/index.ts";

const guid = `0x${"11".repeat(32)}` as const;
const transactionHash = `0x${"22".repeat(32)}` as const;
const sender = `0x${"33".repeat(20)}` as const;
const recipient = `0x${"44".repeat(20)}` as const;
const token = `0x${"55".repeat(20)}` as const;
const sentAt = new Date("2026-11-19T00:00:00.000Z");

function pendingMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    ...createPendingMessage({
      guid,
      sourceEid: 30_416,
      destinationEid: 33_001,
      sender,
      recipient,
      token,
      amountLocal: 1_000_000_000_000n,
      nativeFee: 10n,
      sentAt,
      transactionHash,
    }),
    ...overrides,
  };
}

test("message lifecycle rejects replay after delivery", () => {
  const delivered = transitionMessage(pendingMessage(), {
    type: "delivery_confirmed",
    observedAt: new Date("2026-11-19T00:01:00.000Z"),
  });
  assert.equal(delivered.state, "delivered");
  assert.throws(
    () =>
      transitionMessage(delivered, {
        type: "delivery_confirmed",
        observedAt: new Date("2026-11-19T00:02:00.000Z"),
      }),
    /CROSSCHAIN_INVALID_TRANSITION/,
  );
});

test("retryable execution can return to pending", () => {
  const retryable = transitionMessage(pendingMessage(), {
    type: "execution_failed",
    retryable: true,
    observedAt: new Date("2026-11-19T00:01:00.000Z"),
  });
  const retried = transitionMessage(retryable, {
    type: "retry_submitted",
    observedAt: new Date("2026-11-19T00:02:00.000Z"),
  });
  assert.equal(retried.state, "pending");
});

test("supply reconciliation detects remote undercollateralization", () => {
  const result = reconcileSupply({
    canonicalTotalSupply: 1_000n,
    canonicalAdapterBalance: 200n,
    remoteOftTotalSupply: 201n,
  });
  assert.equal(result.isBacked, false);
  assert.equal(result.backingSurplus, -1n);
  assert.equal(result.canonicalCirculatingOutsideAdapter, 800n);
});

test("message reconciliation rejects duplicate source EID and GUID", () => {
  assert.throws(() => reconcileMessages([pendingMessage(), pendingMessage()]), /DUPLICATE_MESSAGE/);
});

test("monitoring emits bounded actionable alerts", () => {
  const observedAt = new Date("2026-11-19T00:20:00.000Z");
  const alerts = evaluateCrossChainAlerts({
    observedAt,
    supply: {
      canonicalTotalSupply: 1_000n,
      canonicalAdapterBalance: 100n,
      remoteOftTotalSupply: 101n,
    },
    messages: [pendingMessage()],
    maximumDeliveryDelaySeconds: 300,
    navObservedAt: sentAt,
    maximumNavAgeSeconds: 600,
    expectedConfigurationHash: "0xexpected",
    observedConfigurationHash: "0xobserved",
  });
  assert.deepEqual(
    alerts.map((alert) => alert.code),
    [
      "SUPPLY_INVARIANT_MISMATCH",
      "MESSAGE_DELIVERY_DELAYED",
      "NAV_STALE",
      "CONFIGURATION_DRIFT",
    ],
  );
});
