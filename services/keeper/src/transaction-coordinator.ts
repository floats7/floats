import type {
  AlertSink,
  JobName,
  TransactionClient,
  TransactionReceipt,
  TransactionRequest,
} from "./types.ts";
import type { KeeperStateStore } from "./state.ts";

export interface RetryPolicy {
  readonly maximumAttempts: number;
  readonly retryDelayMs: number;
}

export class TransactionCoordinator {
  constructor(
    private readonly state: KeeperStateStore,
    private readonly client: TransactionClient,
    private readonly alerts: AlertSink,
    private readonly retryPolicy: RetryPolicy,
  ) {
    if (retryPolicy.maximumAttempts < 1) throw new Error("maximumAttempts must be positive");
    if (retryPolicy.retryDelayMs < 0) throw new Error("retryDelayMs cannot be negative");
  }

  async execute(
    jobName: JobName,
    idempotencyKey: string,
    request: TransactionRequest,
  ): Promise<TransactionReceipt | undefined> {
    const existing = await this.state.get<TransactionRequest>(jobName, idempotencyKey);
    const claimed = existing ?? (await this.state.claim(jobName, idempotencyKey, request));
    if (!claimed || claimed.status === "confirmed" || claimed.status === "broadcast" || claimed.status === "abandoned") {
      return undefined;
    }
    if (claimed.nextAttemptAt && claimed.nextAttemptAt.getTime() > Date.now()) return undefined;

    const attempt = claimed.attemptCount + 1;
    try {
      const simulation = await this.client.simulate(request);
      if (!simulation.success) throw new Error(`simulation reverted: ${simulation.revertData ?? "unknown"}`);

      await this.state.update(jobName, idempotencyKey, { status: "simulated", attemptCount: attempt });
      const sent = await this.client.send(request);
      await this.state.update(jobName, idempotencyKey, {
        status: "broadcast",
        attemptCount: attempt,
        transactionHash: sent.hash,
        transactionNonce: sent.nonce,
      });

      const receipt = await this.client.receipt(sent.hash);
      if (!receipt) return undefined;
      if (!receipt.success) throw new Error(`transaction failed: ${sent.hash}`);

      await this.state.update(jobName, idempotencyKey, { status: "confirmed", attemptCount: attempt });
      return receipt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const abandoned = attempt >= this.retryPolicy.maximumAttempts;
      const failureUpdate = {
        status: abandoned ? "abandoned" : "failed",
        attemptCount: attempt,
        lastError: message,
        ...(abandoned
          ? {}
          : { nextAttemptAt: new Date(Date.now() + this.retryPolicy.retryDelayMs) }),
      } as const;
      await this.state.update(jobName, idempotencyKey, failureUpdate);
      await this.alerts.publish({
        code: "FAILED_TRANSACTION",
        severity: abandoned ? "critical" : "warning",
        message,
        context: { jobName, idempotencyKey, attempt },
      });
      return undefined;
    }
  }

  async reconcileBroadcast(
    jobName: JobName,
    idempotencyKey: string,
    stuckAfterMs: number,
  ): Promise<TransactionReceipt | undefined> {
    const record = await this.state.get<TransactionRequest>(jobName, idempotencyKey);
    if (!record || record.status !== "broadcast" || !record.transactionHash) return undefined;

    const receipt = await this.client.receipt(record.transactionHash);
    if (receipt) {
      await this.state.update(jobName, idempotencyKey, {
        status: receipt.success ? "confirmed" : "failed",
        attemptCount: record.attemptCount,
        ...(receipt.success ? {} : { lastError: `transaction failed: ${receipt.hash}` }),
      });
      return receipt;
    }

    if (record.updatedAt && Date.now() - record.updatedAt.getTime() >= stuckAfterMs) {
      await this.alerts.publish({
        code: "STUCK_NONCE",
        severity: "critical",
        message: "Broadcast transaction has not been confirmed within the configured window",
        context: { jobName, idempotencyKey, transactionHash: record.transactionHash },
      });
    }
    return undefined;
  }
}
