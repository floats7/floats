import assert from "node:assert/strict";
import test from "node:test";

import {
  DriftJob,
  OperationalHealthJob,
  OptionsSeriesCreationJob,
  OptionsSeriesCloseJob,
  OptionsSettlementJob,
  OptionsWithdrawalEpochJob,
  OracleHealthJob,
} from "../src/jobs.ts";
import {
  OptionsActionDiscovery,
  type OptionsContractReader,
  type OptionsSeriesTerms,
  type OptionsUnderlyingConfiguration,
} from "../src/options-discovery.ts";
import type { KeeperStateStore } from "../src/state.ts";
import { TransactionCoordinator } from "../src/transaction-coordinator.ts";
import type {
  Alert,
  JobName,
  JobRecord,
  JobStatus,
  TransactionClient,
  TransactionRequest,
} from "../src/types.ts";

const request: TransactionRequest = { to: "0x1234", data: "0xabcd", value: 0n };
const registry = `0x${"11".repeat(20)}` as const;
const engine = `0x${"22".repeat(20)}` as const;
const vault = `0x${"33".repeat(20)}` as const;
const seriesId = `0x${"44".repeat(32)}` as const;
const terms: OptionsSeriesTerms = {
  underlying: `0x${"55".repeat(20)}`,
  underlyingUid: `0x${"66".repeat(32)}`,
  priceSource: `0x${"77".repeat(20)}`,
  kind: 0,
  strikeUsd18: 100n * 10n ** 18n,
  capUsd18: 200n * 10n ** 18n,
  expiry: 2_000,
  contractSize18: 10n ** 18n,
  corporateActionPolicyVersion: 1,
};

class MemoryState implements KeeperStateStore {
  readonly records = new Map<string, JobRecord>();

  async get<T>(jobName: JobName, idempotencyKey: string) {
    return this.records.get(`${jobName}:${idempotencyKey}`) as JobRecord<T> | undefined;
  }

  async claim<T>(jobName: JobName, idempotencyKey: string, payload: T) {
    const key = `${jobName}:${idempotencyKey}`;
    const existing = this.records.get(key);
    if (existing && existing.status !== "failed") return undefined;
    if (existing?.nextAttemptAt && existing.nextAttemptAt.getTime() > Date.now()) return undefined;
    const record: JobRecord<T> = {
      jobName,
      idempotencyKey,
      status: "ready",
      attemptCount: existing?.attemptCount ?? 0,
      payload,
    };
    this.records.set(key, record as JobRecord);
    return record;
  }

  async update<T>(
    jobName: JobName,
    idempotencyKey: string,
    update: {
      status: JobStatus;
      attemptCount?: number;
      transactionHash?: `0x${string}`;
      transactionNonce?: bigint;
      lastError?: string;
      nextAttemptAt?: Date;
    },
  ) {
    const key = `${jobName}:${idempotencyKey}`;
    const existing = this.records.get(key);
    assert(existing);
    const record = { ...existing, ...update } as JobRecord<T>;
    this.records.set(key, record as JobRecord);
    return record;
  }
}

class MemoryAlerts {
  readonly alerts: Alert[] = [];
  async publish(alert: Alert) {
    this.alerts.push(alert);
  }
}

test("simulates before broadcast and records confirmation", async () => {
  const calls: string[] = [];
  const client: TransactionClient = {
    async simulate() {
      calls.push("simulate");
      return { success: true, gasEstimate: 100n };
    },
    async send() {
      calls.push("send");
      return { hash: "0x01", nonce: 7n };
    },
    async receipt() {
      calls.push("receipt");
      return { hash: "0x01", blockNumber: 10n, success: true };
    },
  };
  const state = new MemoryState();
  const coordinator = new TransactionCoordinator(state, client, new MemoryAlerts(), {
    maximumAttempts: 3,
    retryDelayMs: 1_000,
  });

  const receipt = await coordinator.execute("rebalance", "plan-1", request);
  assert.equal(receipt?.success, true);
  assert.deepEqual(calls, ["simulate", "send", "receipt"]);
  assert.equal(state.records.get("rebalance:plan-1")?.status, "confirmed");
});

test("idempotency claim prevents duplicate transaction", async () => {
  let sends = 0;
  const client: TransactionClient = {
    async simulate() {
      return { success: true, gasEstimate: 100n };
    },
    async send() {
      sends += 1;
      return { hash: "0x01", nonce: 1n };
    },
    async receipt() {
      return undefined;
    },
  };
  const state = new MemoryState();
  const coordinator = new TransactionCoordinator(state, client, new MemoryAlerts(), {
    maximumAttempts: 3,
    retryDelayMs: 1_000,
  });

  await coordinator.execute("entry-exit", "same-key", request);
  await coordinator.execute("entry-exit", "same-key", request);
  assert.equal(sends, 1);
});

test("options jobs derive stable domain idempotency keys", async () => {
  let sends = 0;
  const client: TransactionClient = {
    async simulate() {
      return { success: true, gasEstimate: 100n };
    },
    async send() {
      sends += 1;
      return { hash: `0x0${sends}` as `0x${string}`, nonce: BigInt(sends) };
    },
    async receipt() {
      return undefined;
    },
  };
  const state = new MemoryState();
  const coordinator = new TransactionCoordinator(state, client, new MemoryAlerts(), {
    maximumAttempts: 3,
    retryDelayMs: 1_000,
  });
  const series = new OptionsSeriesCreationJob(coordinator);
  const seriesClose = new OptionsSeriesCloseJob(coordinator);
  const settlement = new OptionsSettlementJob(coordinator);
  const withdrawal = new OptionsWithdrawalEpochJob(coordinator);

  await series.run({ seriesId, request });
  await series.run({ seriesId, request });
  await seriesClose.run({ seriesId, request });
  await seriesClose.run({ seriesId, request });
  await settlement.run({ seriesId, request });
  await settlement.run({ seriesId, request });
  await withdrawal.run({ epochId: 7n, request });
  await withdrawal.run({ epochId: 7n, request });

  assert.equal(sends, 4);
  assert.deepEqual([...state.records.keys()], [
    `options-series:${seriesId}`,
    `options-series-close:${seriesId}`,
    `options-settlement:${seriesId}`,
    "options-withdrawal-epoch:7",
  ]);
});

test("options discovery emits only actions required by current chain state", async () => {
  let exists = false;
  let seriesState = 0;
  let withdrawalState = 1;
  let underlying: OptionsUnderlyingConfiguration = {
    underlying: terms.underlying,
    underlyingUid: `0x${"00".repeat(32)}`,
    priceSource: `0x${"00".repeat(20)}`,
    enabled: false,
  };
  const reader: OptionsContractReader = {
    async computeSeriesId() {
      return seriesId;
    },
    async seriesExists() {
      return exists;
    },
    async getSeries() {
      return { terms, state: seriesState };
    },
    async getWithdrawal() {
      return { unlockAt: 2_000, state: withdrawalState };
    },
    async getUnderlying() {
      return underlying;
    },
  };
  const discovery = new OptionsActionDiscovery(reader, {
    registry,
    settlementEngine: engine,
    vault,
  });

  const desiredUnderlying: OptionsUnderlyingConfiguration = {
    underlying: terms.underlying,
    underlyingUid: terms.underlyingUid,
    priceSource: terms.priceSource,
    enabled: true,
  };
  const configuration = await discovery.underlyingConfiguration(desiredUnderlying);
  assert.equal(configuration?.id, terms.underlying);
  assert.equal(configuration?.request.to, registry);
  underlying = desiredUnderlying;
  assert.equal(await discovery.underlyingConfiguration(desiredUnderlying), undefined);

  const creation = await discovery.seriesCreation(terms);
  assert.equal(creation?.id, seriesId);
  assert.equal(creation?.request.to, registry);
  assert.notEqual(creation?.request.data, "0x");
  exists = true;
  assert.equal(await discovery.seriesCreation(terms), undefined);

  assert.equal(await discovery.settlement(seriesId, 2_000), undefined);
  assert.equal((await discovery.tradingClose(seriesId, 1_999)), undefined);
  assert.equal((await discovery.tradingClose(seriesId, 2_000))?.request.to, registry);
  seriesState = 1;
  assert.equal(await discovery.tradingClose(seriesId, 2_000), undefined);
  assert.equal((await discovery.settlement(seriesId, 1_999)), undefined);
  assert.equal((await discovery.settlement(seriesId, 2_000))?.request.to, engine);

  assert.equal(await discovery.withdrawal(7n, 1_999), undefined);
  assert.equal((await discovery.withdrawal(7n, 2_000))?.request.to, vault);
  withdrawalState = 2;
  assert.equal(await discovery.withdrawal(7n, 2_001), undefined);
});

test("failed simulation is bounded and emits an alert", async () => {
  const client: TransactionClient = {
    async simulate() {
      return { success: false, gasEstimate: 0n, revertData: "0xdead" };
    },
    async send() {
      throw new Error("send must not run");
    },
    async receipt() {
      return undefined;
    },
  };
  const state = new MemoryState();
  const alerts = new MemoryAlerts();
  const coordinator = new TransactionCoordinator(state, client, alerts, {
    maximumAttempts: 1,
    retryDelayMs: 1_000,
  });

  await coordinator.execute("rebalance", "failed-plan", request);
  assert.equal(state.records.get("rebalance:failed-plan")?.status, "abandoned");
  assert.equal(alerts.alerts[0]?.code, "FAILED_TRANSACTION");
  assert.equal(alerts.alerts[0]?.severity, "critical");
});

test("drift and oracle jobs publish domain-specific alerts", async () => {
  const alerts = new MemoryAlerts();
  await new DriftJob(alerts).run({ idempotencyKey: "drift-1", driftBps: 250, maximumDriftBps: 100 });
  await new OracleHealthJob(alerts).run({ idempotencyKey: "oracle-1", symbol: "CRCL", health: "Paused" });

  assert.deepEqual(alerts.alerts.map((alert) => alert.code), ["EXCESSIVE_DRIFT", "STALE_ORACLE"]);
});

test("operational health covers premium, gas, and nonce alerts", async () => {
  const alerts = new MemoryAlerts();
  await new OperationalHealthJob(alerts).run({
    idempotencyKey: "health-1",
    premiumDiscountBps: 200,
    maximumPremiumDiscountBps: 100,
    gasBalance: 1n,
    minimumGasBalance: 2n,
    pendingNonceAgeMs: 20_000,
    maximumPendingNonceAgeMs: 10_000,
  });

  assert.deepEqual(alerts.alerts.map((alert) => alert.code), [
    "PREMIUM_DISCOUNT",
    "LOW_GAS",
    "STUCK_NONCE",
  ]);
});
