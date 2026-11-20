import { readFileSync } from "node:fs";

const [environmentPath, candidateId] = process.argv.slice(2);
if (!environmentPath || !candidateId || !/^[a-z0-9-]{1,80}$/.test(candidateId)) {
  throw new Error("Usage: inspect-market-candidate.ts <environment-file> <candidate-id>");
}

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
const chainId = Number(required(env, "CHAIN_ID"));
if ((environment !== "testnet" && environment !== "mainnet") || !Number.isSafeInteger(chainId) || chainId <= 0) {
  throw new Error("Candidate inspection environment is invalid");
}

const url = new URL("/rest/v1/market_candidates", required(env, "SUPABASE_URL"));
url.search = new URLSearchParams({
  select: "candidate_id,symbol,lifecycle_status,detected_token_address,token_address,asset_uid,identity_approval_status,token_live,oracle_ready,liquidity_ready,trading_capabilities,trading_halted,disabled_reason",
  environment: `eq.${environment}`,
  chain_id: `eq.${chainId}`,
  candidate_id: `eq.${candidateId}`,
  limit: "1",
}).toString();
const response = await fetch(url, {
  headers: { apikey: required(env, "SUPABASE_SECRET_KEY") },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Candidate inspection failed with status ${response.status}`);
const rows = await response.json() as unknown[];
if (rows.length !== 1) throw new Error("Candidate was not found");
const evidenceUrl = new URL("/rest/v1/market_candidate_identity_observations", required(env, "SUPABASE_URL"));
evidenceUrl.search = new URLSearchParams({
  select: "source_kind,passed,observed_at",
  environment: `eq.${environment}`,
  chain_id: `eq.${chainId}`,
  candidate_id: `eq.${candidateId}`,
  order: "observed_at.desc",
}).toString();
const evidenceResponse = await fetch(evidenceUrl, {
  headers: { apikey: required(env, "SUPABASE_SECRET_KEY") },
  signal: AbortSignal.timeout(30_000),
});
if (!evidenceResponse.ok) throw new Error(`Candidate evidence inspection failed with status ${evidenceResponse.status}`);
console.log(JSON.stringify({ environment, chainId, candidate: rows[0], evidence: await evidenceResponse.json() }, null, 2));

function parseEnv(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.startsWith("#")) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
