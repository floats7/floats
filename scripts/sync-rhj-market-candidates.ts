import { readFileSync } from "node:fs";
import { syncOfficialMarketCandidates } from "../packages/database/src/market-candidate-sync.ts";

const environmentPath = process.argv[2];
if (!environmentPath) throw new Error("Usage: sync-rhj-market-candidates.ts <environment-file>");
const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));

const updated = await syncOfficialMarketCandidates({
  databaseUrl: new URL(required(env, "SUPABASE_URL")),
  secretKey: required(env, "SUPABASE_SECRET_KEY"),
  environment,
  chainId,
});
console.log(`Synchronized ${updated} official RHJ candidate records for ${environment}; no secret values were printed.`);

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
