import type { JobName, JobRecord, JobStatus } from "./types.ts";

export interface KeeperStateStore {
  get<T>(jobName: JobName, idempotencyKey: string): Promise<JobRecord<T> | undefined>;
  claim<T>(jobName: JobName, idempotencyKey: string, payload: T): Promise<JobRecord<T> | undefined>;
  update<T>(
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
  ): Promise<JobRecord<T>>;
}

export interface KeeperStateDatabase {
  getJob(input: {
    environment: "testnet" | "mainnet";
    chainId: number;
    jobName: JobName;
    idempotencyKey: string;
  }): Promise<Record<string, unknown> | undefined>;
  claimJob(input: {
    environment: "testnet" | "mainnet";
    chainId: number;
    jobName: JobName;
    idempotencyKey: string;
    payload: unknown;
  }): Promise<Record<string, unknown> | undefined>;
  updateJob(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class SupabaseKeeperState implements KeeperStateStore {
  constructor(
    private readonly database: KeeperStateDatabase,
    private readonly environment: "testnet" | "mainnet",
    private readonly chainId: number,
  ) {}

  async get<T>(jobName: JobName, idempotencyKey: string): Promise<JobRecord<T> | undefined> {
    const row = await this.database.getJob({
      environment: this.environment,
      chainId: this.chainId,
      jobName,
      idempotencyKey,
    });
    return row ? this.toRecord<T>(row) : undefined;
  }

  async claim<T>(
    jobName: JobName,
    idempotencyKey: string,
    payload: T,
  ): Promise<JobRecord<T> | undefined> {
    const row = await this.database.claimJob({
      environment: this.environment,
      chainId: this.chainId,
      jobName,
      idempotencyKey,
      payload,
    });
    return row ? this.toRecord<T>(row) : undefined;
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
  ): Promise<JobRecord<T>> {
    const row = await this.database.updateJob({
      environment: this.environment,
      chainId: this.chainId,
      jobName,
      idempotencyKey,
      ...update,
    });
    return this.toRecord<T>(row);
  }

  private toRecord<T>(row: Record<string, unknown>): JobRecord<T> {
    return {
      jobName: row.job_name as JobName,
      idempotencyKey: row.idempotency_key as string,
      status: row.status as JobStatus,
      attemptCount: row.attempt_count as number,
      payload: row.payload as T,
      ...(row.transaction_hash == null
        ? {}
        : { transactionHash: row.transaction_hash as `0x${string}` }),
      ...(row.transaction_nonce == null
        ? {}
        : { transactionNonce: BigInt(row.transaction_nonce as string) }),
      ...(row.last_error == null ? {} : { lastError: row.last_error as string }),
      ...(row.next_attempt_at == null
        ? {}
        : { nextAttemptAt: new Date(row.next_attempt_at as string) }),
      ...(row.updated_at == null ? {} : { updatedAt: new Date(row.updated_at as string) }),
    };
  }
}
