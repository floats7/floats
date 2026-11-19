import { readFileSync } from "node:fs";
import { fifthUsTradingDay } from "../packages/database/src/us-equity-calendar.ts";

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
if (!Array.isArray(input)) throw new Error("Candidate input must be an array");
const candidates = input.map(candidate);
assertUnique(candidates.map((item) => item.id), "candidate id");
assertUnique(candidates.map((item) => item.symbol), "candidate symbol");

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
}));

const response = await fetch(databaseUrl(env, "/rest/v1/market_candidates?on_conflict=environment,chain_id,candidate_id"), {
  method: "POST",
  headers: databaseHeaders(env, "resolution=merge-duplicates,return=minimal"),
  body: JSON.stringify(rows),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Candidate import failed with status ${response.status}`);

console.log(`Imported ${candidates.length} market candidates into ${environment}; no secret values were printed.`);

function candidate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid candidate");
  const row = value as Record<string, unknown>;
  const text = (key: string, pattern?: RegExp) => {
    const item = row[key];
    if (typeof item !== "string" || !item || (pattern && !pattern.test(item))) throw new Error(`Invalid candidate ${key}`);
    return item;
  };
  const optional = (key: string, pattern?: RegExp) => row[key] == null ? null : text(key, pattern);
  const statuses = new Set(["upcoming","listing_expected","listed","token_pending","detected","verification_pending","approval_pending","rejected","suspected_fake","token_live","oracle_pending","liquidity_pending","governance_pending","active","suspended","removed"]);
  const status = text("status");
  if (!statuses.has(status)) throw new Error("Invalid candidate status");
  const sourceUrl = optional("sourceUrl");
  if (sourceUrl && new URL(sourceUrl).protocol !== "https:") throw new Error("Candidate sourceUrl must use HTTPS");
  const logoUrl = optional("logoUrl");
  if (logoUrl && new URL(logoUrl).protocol !== "https:") throw new Error("Candidate logoUrl must use HTTPS");
  const tokenAddress = optional("tokenAddress", /^0x[0-9a-fA-F]{40}$/)?.toLowerCase() ?? null;
  const tokenLive = row.tokenLive === true;
  if (row.tokenLive != null && typeof row.tokenLive !== "boolean") throw new Error("Invalid candidate tokenLive");
  const oracleReady = boolean("oracleReady");
  const liquidityReady = boolean("liquidityReady");
  const governanceApproved = boolean("governanceApproved");
  if ((status === "token_live" || tokenLive) && !tokenAddress) throw new Error("A live candidate requires a token address");
  if ((oracleReady || liquidityReady || governanceApproved) && !tokenLive) throw new Error("Candidate readiness requires a live token");
  return { id: text("id", /^[a-z0-9-]+$/), symbol: text("symbol", /^[A-Z0-9.-]{1,16}$/), name: text("name"), status,
    ipoDate: optional("ipoDate", /^\d{4}-\d{2}-\d{2}$/), listingDate: optional("listingDate", /^\d{4}-\d{2}-\d{2}$/),
    eligibleFrom: optional("eligibleFrom", /^\d{4}-\d{2}-\d{2}$/)
      ?? (optional("listingDate", /^\d{4}-\d{2}-\d{2}$/) ? fifthUsTradingDay(text("listingDate")) : null),
    sourceUrl, tokenAddress, logoUrl, tokenLive,
    oracleReady, liquidityReady, governanceApproved,
    disabledReason: optional("disabledReason") };

  function boolean(key: string) {
    if (row[key] != null && typeof row[key] !== "boolean") throw new Error(`Invalid candidate ${key}`);
    return row[key] === true;
  }
}

function assertUnique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in candidate input`);
}

function databaseUrl(values: ReadonlyMap<string, string>, path: string) {
  return new URL(path, required(values, "SUPABASE_URL"));
}

function databaseHeaders(values: ReadonlyMap<string, string>, prefer: string) {
  return { "content-type": "application/json", apikey: required(values, "SUPABASE_SECRET_KEY"), prefer };
}

function parseEnv(path: string) { const values = new Map<string,string>(); for (const line of readFileSync(path,"utf8").split(/\r?\n/)) { const i=line.indexOf("="); if(i>0&&!line.startsWith("#")) values.set(line.slice(0,i),line.slice(i+1)); } return values; }
function required(values: ReadonlyMap<string,string>, key: string) { const value=values.get(key)?.trim(); if(!value) throw new Error(`${key} is required`); return value; }
