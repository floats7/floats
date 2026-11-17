export type Hex = `0x${string}`;

export type JobName = "entry-exit" | "drift" | "rebalance" | "oracle-health" | "alert";

export type JobStatus =
  | "ready"
  | "simulated"
  | "broadcast"
  | "confirmed"
  | "failed"
  | "abandoned";

export interface JobRecord<TPayload = unknown> {
  readonly jobName: JobName;
  readonly idempotencyKey: string;
  readonly status: JobStatus;
  readonly attemptCount: number;
  readonly payload: TPayload;
  readonly transactionHash?: Hex;
  readonly transactionNonce?: bigint;
  readonly lastError?: string;
  readonly nextAttemptAt?: Date;
  readonly updatedAt?: Date;
}

export interface TransactionRequest {
  readonly to: Hex;
  readonly data: Hex;
  readonly value: bigint;
}

export interface SimulationResult {
  readonly success: boolean;
  readonly gasEstimate: bigint;
  readonly revertData?: Hex;
}

export interface TransactionReceipt {
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly success: boolean;
}

export interface TransactionClient {
  simulate(request: TransactionRequest): Promise<SimulationResult>;
  send(request: TransactionRequest): Promise<{ hash: Hex; nonce: bigint }>;
  receipt(hash: Hex): Promise<TransactionReceipt | undefined>;
}

export interface Alert {
  readonly code:
    | "STALE_ORACLE"
    | "FAILED_TRANSACTION"
    | "EXCESSIVE_DRIFT"
    | "PREMIUM_DISCOUNT"
    | "LOW_GAS"
    | "STUCK_NONCE";
  readonly severity: "warning" | "critical";
  readonly message: string;
  readonly context: Readonly<Record<string, string | number | boolean>>;
}

export interface AlertSink {
  publish(alert: Alert): Promise<void>;
}
