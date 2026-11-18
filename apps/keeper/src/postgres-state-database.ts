import type { QueryResultRow } from "pg";

import type { KeeperStateDatabase } from "./state.ts";

interface SqlResult<TRow extends QueryResultRow> {
  readonly rows: readonly TRow[];
}

export interface KeeperSqlClient {
  query<TRow extends QueryResultRow>(
    text: string,
    values: readonly unknown[],
  ): Promise<SqlResult<TRow>>;
}

type KeeperJobRow = QueryResultRow & Record<string, unknown>;

export class PostgresKeeperStateDatabase implements KeeperStateDatabase {
  constructor(private readonly client: KeeperSqlClient) {}

  async getJob(input: {
    environment: "testnet" | "mainnet";
    chainId: number;
    jobName: string;
    idempotencyKey: string;
  }): Promise<Record<string, unknown> | undefined> {
    const result = await this.client.query<KeeperJobRow>(
      `select *
         from public.keeper_jobs
        where environment = $1
          and chain_id = $2
          and job_name = $3
          and idempotency_key = $4`,
      [input.environment, input.chainId, input.jobName, input.idempotencyKey],
    );
    return result.rows[0];
  }

  async claimJob(input: {
    environment: "testnet" | "mainnet";
    chainId: number;
    jobName: string;
    idempotencyKey: string;
    payload: unknown;
  }): Promise<Record<string, unknown> | undefined> {
    const result = await this.client.query<KeeperJobRow>(
      `insert into public.keeper_jobs (
         environment, chain_id, job_name, idempotency_key, status, payload
       ) values ($1, $2, $3, $4, 'ready', $5::jsonb)
       on conflict (environment, chain_id, job_name, idempotency_key) do update
         set status = 'ready',
             payload = excluded.payload,
             updated_at = now()
       where (
         keeper_jobs.status = 'failed'
         and (keeper_jobs.next_attempt_at is null or keeper_jobs.next_attempt_at <= now())
       ) or (
         keeper_jobs.status in ('ready', 'simulated')
         and keeper_jobs.updated_at <= now() - interval '5 minutes'
       )
       returning *`,
      [
        input.environment,
        input.chainId,
        input.jobName,
        input.idempotencyKey,
        stringifyKeeperPayload(input.payload),
      ],
    );
    return result.rows[0];
  }

  async updateJob(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.client.query<KeeperJobRow>(
      `update public.keeper_jobs
          set status = $5,
              attempt_count = coalesce($6, attempt_count),
              transaction_hash = coalesce($7, transaction_hash),
              transaction_nonce = coalesce($8, transaction_nonce),
              last_error = coalesce($9, last_error),
              next_attempt_at = coalesce($10, next_attempt_at),
              updated_at = now()
        where environment = $1
          and chain_id = $2
          and job_name = $3
          and idempotency_key = $4
       returning *`,
      [
        requireString(input, "environment"),
        requirePositiveInteger(input, "chainId"),
        requireString(input, "jobName"),
        requireString(input, "idempotencyKey"),
        requireString(input, "status"),
        optionalNumber(input.attemptCount),
        optionalString(input.transactionHash),
        optionalBigInt(input.transactionNonce),
        optionalString(input.lastError),
        optionalDate(input.nextAttemptAt),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Keeper job disappeared during state update");
    return row;
  }
}

function stringifyKeeperPayload(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item);
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${key}`);
  return value;
}

function requirePositiveInteger(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${key}`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new Error("Invalid string update");
  return value;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid number update");
  }
  return value;
}

function optionalBigInt(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "bigint" || value < 0n) throw new Error("Invalid bigint update");
  return value.toString();
}

function optionalDate(value: unknown): Date | null {
  if (value === undefined) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("Invalid date update");
  return value;
}
