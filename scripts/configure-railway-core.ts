import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [environmentPath, railwayEnvironment, projectId] = process.argv.slice(2);
if (!environmentPath || !railwayEnvironment || !projectId) {
  throw new Error("Usage: configure-railway-core.ts <.env.testnet|.env.mainnet> <testnet|mainnet> <project-id>");
}
if (environmentPath !== `.env.${railwayEnvironment}` || !["testnet", "mainnet"].includes(railwayEnvironment)) {
  throw new Error("Environment file and Railway environment must match");
}
if (!/^[0-9a-f-]{36}$/.test(projectId)) throw new Error("Invalid Railway project ID");

const values = parseEnv(environmentPath);
const apiOrigin = railwayEnvironment === "mainnet" ? "https://api.floats.trade" : "https://api-testnet.floats.trade";
const webOrigin = railwayEnvironment === "mainnet" ? "https://floats.trade" : "https://testnet.floats.trade";

const serviceVariables: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "floats-web": compact({
    APP_ENV: railwayEnvironment,
    FLOATS_CONTRACT_ADDRESS: optional("FLOATS_CONTRACT_ADDRESS"),
    NEXT_PUBLIC_API_URL: apiOrigin,
    NODE_ENV: "production",
  }),
  "floats-api": compact({
    APP_ENV: railwayEnvironment,
    BLOCK_EXPLORER_URL: required("BLOCK_EXPLORER_URL"),
    CHAIN_ID: required("CHAIN_ID"),
    FLOATS_VAULT_ADDRESS: required("FLOATS_VAULT_ADDRESS"),
    NODE_ENV: "production",
    RPC_URL: required("RPC_URL"),
    SUPABASE_SECRET_KEY: required("SUPABASE_SECRET_KEY"),
    SUPABASE_URL: required("SUPABASE_URL"),
    USDG_ADDRESS: required("USDG_ADDRESS"),
    WALLETS_CONNECT_PROJECT_ID: required("WALLETS_CONNECT_PROJECT_ID"),
    WEB_ORIGIN: webOrigin,
    OPTIONS_MARKET_ADDRESS: optional("OPTIONS_MARKET_ADDRESS"),
    OPTION_TOKEN_ADDRESS: optional("OPTION_TOKEN_ADDRESS"),
    OPTIONS_VAULT_ADDRESS: optional("OPTIONS_VAULT_ADDRESS"),
    SPOT_ROUTES_JSON: optional("SPOT_ROUTES_JSON") ?? "[]",
  }),
  "floats-indexer": compact({
    APP_ENV: railwayEnvironment,
    BLOCK_EXPLORER_URL: required("BLOCK_EXPLORER_URL"),
    CHAIN_ID: required("CHAIN_ID"),
    FEE_MODULE_ADDRESS: required("FEE_MODULE_ADDRESS"),
    FLOATS_VAULT_ADDRESS: required("FLOATS_VAULT_ADDRESS"),
    INDEXER_BATCH_SIZE: required("INDEXER_BATCH_SIZE"),
    INDEXER_CONFIRMATIONS: required("INDEXER_CONFIRMATIONS"),
    INDEXER_POLL_INTERVAL_MS: optional("INDEXER_POLL_INTERVAL_MS"),
    INDEXER_REORG_REPLAY_DEPTH: required("INDEXER_REORG_REPLAY_DEPTH"),
    INDEXER_START_BLOCK: required("INDEXER_START_BLOCK"),
    INDEX_REGISTRY_ADDRESS: required("INDEX_REGISTRY_ADDRESS"),
    NAV_ORACLE_ADDRESS: required("NAV_ORACLE_ADDRESS"),
    NODE_ENV: "production",
    REBALANCER_ADDRESS: required("REBALANCER_ADDRESS"),
    RPC_URL: required("RPC_URL"),
    RPC_INDEXER: required("RPC_INDEXER"),
    SUPABASE_SECRET_KEY: required("SUPABASE_SECRET_KEY"),
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_DB_URL: required("SUPABASE_DB_URL"),
    SUPABASE_DB_CA_BASE64: optional("SUPABASE_DB_CA_BASE64"),
    KEEPER_ADDRESS: required("KEEPER_ADDRESS"),
    KEEPER_PRIVATE_KEY: required("KEEPER_PRIVATE_KEY"),
    KEEPER_POLL_INTERVAL_MS: required("KEEPER_POLL_INTERVAL_MS"),
    KEEPER_RUN_ONCE: required("KEEPER_RUN_ONCE"),
    MARKET_CANDIDATE_SYNC_INTERVAL_MS: optional("MARKET_CANDIDATE_SYNC_INTERVAL_MS") ?? "21600000",
    OPTIONS_DESIRED_SERIES_JSON: required("OPTIONS_DESIRED_SERIES_JSON"),
    OPTIONS_SERIES_REGISTRY_ADDRESS: required("OPTIONS_SERIES_REGISTRY_ADDRESS"),
    OPTIONS_MARKET_ADDRESS: required("OPTIONS_MARKET_ADDRESS"),
    OPTIONS_SETTLEMENT_ENGINE_ADDRESS: required("OPTIONS_SETTLEMENT_ENGINE_ADDRESS"),
    OPTIONS_VAULT_ADDRESS: required("OPTIONS_VAULT_ADDRESS"),
    OPTIONS_RISK_MANAGER_ADDRESS: required("OPTIONS_RISK_MANAGER_ADDRESS"),
  }),
};

let count = 0;
for (const [service, variables] of Object.entries(serviceVariables)) {
  for (const [key, value] of Object.entries(variables)) {
    const result = spawnSync("railway", [
      "variable", "set", key, "--stdin", "--skip-deploys",
      "--project", projectId, "--service", service, "--environment", railwayEnvironment,
    ], { input: value, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] });
    if (result.status !== 0) throw new Error(`Failed to set ${service}.${key}: ${result.stderr.trim()}`);
    count += 1;
  }
}
console.log(`Configured ${count} ${railwayEnvironment} service variables; values were not printed.`);

function parseEnv(path: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) result.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return result;
}

function required(key: string): string {
  const value = optional(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optional(key: string): string | undefined {
  return values.get(key)?.trim() || undefined;
}

function compact(input: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
