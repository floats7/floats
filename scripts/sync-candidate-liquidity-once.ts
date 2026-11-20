import { readFileSync } from "node:fs";
import {
  parseCandidateLiquidityRoutes,
  syncCandidateLiquidity,
} from "../packages/database/src/market-candidate-liquidity-sync.ts";

const [environmentPath] = process.argv.slice(2);
if (!environmentPath) throw new Error("Usage: sync-candidate-liquidity-once.ts <environment-file>");

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");

const ready = await syncCandidateLiquidity({
  databaseUrl: new URL(required(env, "SUPABASE_URL")),
  secretKey: required(env, "SUPABASE_SECRET_KEY"),
  environment,
  chainId,
  rpcUrl: new URL(required(env, "RPC_INDEXER")),
  routes: parseCandidateLiquidityRoutes(required(env, "MARKET_CANDIDATE_LIQUIDITY_ROUTES_JSON")),
});

console.log(JSON.stringify({ event: "candidate_liquidity_sync_completed", environment, chainId, ready }));

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
