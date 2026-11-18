import type { QueryResultRow } from "pg";

import type { QuoteAuditRecord, QuoteAuditSink } from "./service.ts";

export interface PricerSqlClient {
  query<TRow extends QueryResultRow>(
    text: string,
    values: readonly unknown[],
  ): Promise<{ readonly rows: readonly TRow[] }>;
}

export class PostgresQuoteAuditSink implements QuoteAuditSink {
  constructor(
    private readonly client: PricerSqlClient,
    private readonly environment: "testnet" | "mainnet",
    private readonly chainId: number,
  ) {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Invalid chain ID");
  }

  async append(record: QuoteAuditRecord): Promise<void> {
    await this.client.query(
      `insert into public.options_quote_audit (
         environment, chain_id, request_id, series_id, buyer, side,
         decision, reason, policy_input, pricing_result
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
      [
        this.environment,
        this.chainId,
        record.requestId,
        record.seriesId.toLowerCase(),
        record.buyer.toLowerCase(),
        record.side,
        record.decision,
        record.reason ?? null,
        serializeJson(record.policyInput),
        record.result === undefined ? null : serializeJson(record.result),
      ],
    );
  }
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item
  );
}
