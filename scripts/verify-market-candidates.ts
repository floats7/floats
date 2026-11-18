import { readFileSync } from "node:fs";

const environmentPath = process.argv[2];
if (!environmentPath) throw new Error("Usage: verify-market-candidates.ts <environment-file>");

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");

const query = new URLSearchParams({
  select: "candidate_id,symbol,lifecycle_status,token_address,token_live",
  environment: `eq.${environment}`,
  chain_id: `eq.${chainId}`,
  order: "symbol.asc",
});
const response = await fetch(new URL(`/rest/v1/market_candidates?${query}`, required(env, "SUPABASE_URL")), {
  headers: { apikey: required(env, "SUPABASE_SECRET_KEY") },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Candidate verification failed with status ${response.status}`);
const rows = await response.json() as Array<{ lifecycle_status: string; token_live: boolean }>;
if (rows.length === 0) throw new Error(`No market candidates found for ${environment}`);
const statusCounts = new Map<string, number>();
for (const row of rows) statusCounts.set(row.lifecycle_status, (statusCounts.get(row.lifecycle_status) ?? 0) + 1);
console.log(JSON.stringify({
  environment,
  chainId,
  total: rows.length,
  tokenLive: rows.filter((row) => row.token_live).length,
  statuses: [...statusCounts].map(([lifecycle_status, count]) => ({ lifecycle_status, count })),
}));

function parseEnv(path: string) {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.startsWith("#")) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string) {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
