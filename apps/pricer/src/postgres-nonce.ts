import type { QueryResultRow } from "pg";

import type { Hex, QuoteNonceSource } from "./runtime.ts";

export interface NonceSqlClient {
  query(
    text: string,
    values: readonly unknown[],
  ): Promise<{ readonly rows: readonly QueryResultRow[] }>;
}

interface NonceRow extends QueryResultRow {
  readonly nonce: string;
}

export class PostgresQuoteNonceSource implements QuoteNonceSource {
  constructor(
    private readonly client: NonceSqlClient,
    private readonly environment: "testnet" | "mainnet",
    private readonly chainId: number,
  ) {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Invalid chain ID");
  }

  async next(buyer: Hex): Promise<bigint> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(buyer)) throw new Error("INVALID_BUYER");
    const result = await this.client.query(
      `select public.allocate_options_quote_nonce($1, $2, $3) as nonce`,
      [this.environment, this.chainId, buyer.toLowerCase()],
    );
    const nonce = (result.rows[0] as NonceRow | undefined)?.nonce;
    if (nonce === undefined || !/^(0|[1-9][0-9]*)$/.test(nonce)) {
      throw new Error("QUOTE_NONCE_ALLOCATION_FAILED");
    }
    const parsed = BigInt(nonce);
    if (parsed > (1n << 256n) - 1n) throw new Error("QUOTE_NONCE_EXHAUSTED");
    return parsed;
  }
}
