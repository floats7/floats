import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client, type QueryResult } from "pg";
import { postgresTls } from "../packages/database/src/postgres-tls.ts";
import { parseMarketCandidates } from "./lib/market-candidate-input.ts";

const [environmentPath, inputPath] = process.argv.slice(2);
if (!environmentPath || !inputPath) {
  throw new Error("Usage: verify-market-candidate-records.ts <environment-file> <candidate-file>");
}

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");
const candidates = parseMarketCandidates(JSON.parse(readFileSync(inputPath, "utf8")) as unknown);

const client = new Client({
  connectionString: required(env, "SUPABASE_DB_URL"),
  ssl: postgresTls(env.get("SUPABASE_DB_CA_BASE64"), environment === "mainnet"),
  application_name: `floats-${environment}-candidate-record-verifier`,
});
await client.connect();

try {
  for (const expected of candidates) {
    const result: QueryResult<DatabaseCandidate> = await client.query<DatabaseCandidate>(`
      select candidate_id, symbol, company_name, lifecycle_status, ipo_date::text,
             expected_listing_date::text, eligible_from::text, source_url, token_address,
             logo_url, token_live, oracle_ready, liquidity_ready, governance_approved,
             disabled_reason, ipo_stage::text, ticker_announced, exchange,
             price_range_low::text, price_range_high::text, ipo_price::text,
             stage_source_url, stage_updated_at, impostor_aliases
      from public.market_candidates
      where environment = $1 and chain_id = $2 and candidate_id = $3
    `, [environment, chainId, expected.id]);
    assert.equal(result.rowCount, 1, `Candidate ${expected.id} is missing from ${environment}`);
    const actual = result.rows[0];
    const expectedNormalized = {
      ...expected,
      stageUpdatedAt: expected.stageUpdatedAt ? new Date(expected.stageUpdatedAt).toISOString() : null,
    };
    assert.deepEqual({
      id: actual?.candidate_id,
      symbol: actual?.symbol,
      name: actual?.company_name,
      status: actual?.lifecycle_status,
      ipoDate: actual?.ipo_date,
      listingDate: actual?.expected_listing_date,
      eligibleFrom: actual?.eligible_from,
      sourceUrl: actual?.source_url,
      tokenAddress: actual?.token_address,
      logoUrl: actual?.logo_url,
      tokenLive: actual?.token_live,
      oracleReady: actual?.oracle_ready,
      liquidityReady: actual?.liquidity_ready,
      governanceApproved: actual?.governance_approved,
      disabledReason: actual?.disabled_reason,
      ipoStage: actual?.ipo_stage,
      tickerAnnounced: actual?.ticker_announced,
      exchange: actual?.exchange,
      priceRangeLow: numberOrNull(actual?.price_range_low),
      priceRangeHigh: numberOrNull(actual?.price_range_high),
      ipoPrice: numberOrNull(actual?.ipo_price),
      stageSourceUrl: actual?.stage_source_url,
      stageUpdatedAt: actual?.stage_updated_at?.toISOString(),
      impostorAliases: actual?.impostor_aliases,
    }, expectedNormalized, `Candidate ${expected.id} differs from ${inputPath}`);
  }
  console.log(`Verified ${candidates.length} candidate record(s) in ${environment} against ${inputPath}.`);
} finally {
  await client.end();
}

type DatabaseCandidate = {
  candidate_id: string;
  symbol: string;
  company_name: string;
  lifecycle_status: string;
  ipo_date: string | null;
  expected_listing_date: string | null;
  eligible_from: string | null;
  source_url: string | null;
  token_address: string | null;
  logo_url: string | null;
  token_live: boolean;
  oracle_ready: boolean;
  liquidity_ready: boolean;
  governance_approved: boolean;
  disabled_reason: string | null;
  ipo_stage: string | null;
  ticker_announced: boolean;
  exchange: string | null;
  price_range_low: string | null;
  price_range_high: string | null;
  ipo_price: string | null;
  stage_source_url: string | null;
  stage_updated_at: Date | null;
  impostor_aliases: string[];
};

function numberOrNull(value: string | null | undefined) {
  return value == null ? null : Number(value);
}

function parseEnv(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0 && !line.startsWith("#")) values.set(line.slice(0, index), line.slice(index + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
