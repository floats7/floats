import { readFileSync } from "node:fs";
import { parseMarketCandidates } from "./lib/market-candidate-input.ts";

const [environmentPath, inputPath] = process.argv.slice(2);
if (!environmentPath || !inputPath) {
  throw new Error("Usage: import-market-candidates.ts <environment-file> <candidates.json>");
}

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");

const input = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
const candidates = parseMarketCandidates(input);

const rows = candidates.map((item) => ({
  environment,
  chain_id: chainId,
  candidate_id: item.id,
  symbol: item.symbol,
  company_name: item.name,
  lifecycle_status: item.status,
  ipo_date: item.ipoDate,
  expected_listing_date: item.listingDate,
  eligible_from: item.eligibleFrom,
  source_url: item.sourceUrl,
  disabled_reason: item.disabledReason,
  token_address: item.tokenAddress,
  logo_url: item.logoUrl,
  token_live: item.tokenLive,
  oracle_ready: item.oracleReady,
  liquidity_ready: item.liquidityReady,
  governance_approved: item.governanceApproved,
  ipo_stage: item.ipoStage,
  ticker_announced: item.tickerAnnounced,
  exchange: item.exchange,
  price_range_low: item.priceRangeLow,
  price_range_high: item.priceRangeHigh,
  ipo_price: item.ipoPrice,
  stage_source_url: item.stageSourceUrl,
  stage_updated_at: item.stageUpdatedAt,
  impostor_aliases: item.impostorAliases,
}));

const response = await fetch(databaseUrl(env, "/rest/v1/market_candidates?on_conflict=environment,chain_id,candidate_id"), {
  method: "POST",
  headers: databaseHeaders(env, "resolution=merge-duplicates,return=minimal"),
  body: JSON.stringify(rows),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Candidate import failed with status ${response.status}`);

console.log(`Imported ${candidates.length} market candidates into ${environment}; no secret values were printed.`);

function databaseUrl(values: ReadonlyMap<string, string>, path: string) {
  return new URL(path, required(values, "SUPABASE_URL"));
}

function databaseHeaders(values: ReadonlyMap<string, string>, prefer: string) {
  return { "content-type": "application/json", apikey: required(values, "SUPABASE_SECRET_KEY"), prefer };
}

function parseEnv(path: string) { const values = new Map<string,string>(); for (const line of readFileSync(path,"utf8").split(/\r?\n/)) { const i=line.indexOf("="); if(i>0&&!line.startsWith("#")) values.set(line.slice(0,i),line.slice(i+1)); } return values; }
function required(values: ReadonlyMap<string,string>, key: string) { const value=values.get(key)?.trim(); if(!value) throw new Error(`${key} is required`); return value; }
