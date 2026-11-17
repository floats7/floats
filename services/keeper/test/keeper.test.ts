import assert from "node:assert/strict";
import test from "node:test";

import { DriftJob, OperationalHealthJob, OracleHealthJob } from "../src/jobs.ts";
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

class MemoryState implements KeeperStateStore {
  readonly records = new Map<string, JobRecord>();

  async get<T>(jobName: JobName, idempotencyKey: string) {
    return this.records.get(`${jobName}:${idempotencyKey}`) as JobRecord<T> | undefined;
  }

  async claim<T>(jobName: JobName, idempotencyKey: string, payload: T) {
    const key = `${jobName}:${idempotencyKey}`;
    if (this.records.has(key)) return undefined;
    const record: JobRecord<T> = {
      jobName,
      idempotencyKey,
      status: "ready",
      attemptCount: 0,
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
