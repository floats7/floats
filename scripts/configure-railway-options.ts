import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const environmentPath = process.argv[2];
const railwayEnvironment = process.argv[3];
if (!environmentPath || !railwayEnvironment || !/^\.env\.(testnet|mainnet)$/.test(environmentPath)) {
  throw new Error("Usage: configure-railway-options.ts <.env.testnet|.env.mainnet> <testnet|mainnet>");
}
if (!["testnet", "mainnet"].includes(railwayEnvironment)) throw new Error("Invalid Railway environment");

const values = new Map<string, string>();
for (const line of readFileSync(environmentPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
}

function required(key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const serviceVariables: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "floats-options-signer": {
    APP_ENV: railwayEnvironment,
    CHAIN_ID: required("CHAIN_ID"),
    PORT: "8080",
    QUOTE_VERIFIER_ADDRESS: required("QUOTE_VERIFIER_ADDRESS"),
    OPTIONS_QUOTE_SIGNER_PRIVATE_KEY: required("OPTIONS_QUOTE_SIGNER_PRIVATE_KEY"),
    SIGNER_INTERNAL_AUTH_TOKEN: required("SIGNER_INTERNAL_AUTH_TOKEN"),
  },
  "floats-options-pricer": {
    APP_ENV: railwayEnvironment,
    CHAIN_ID: required("CHAIN_ID"),
    PORT: "8080",
    RPC_URL: required("RPC_URL"),
    SUPABASE_DB_URL: required("SUPABASE_DB_URL"),
    ...(values.get("SUPABASE_DB_CA_BASE64")?.trim()
      ? { SUPABASE_DB_CA_BASE64: required("SUPABASE_DB_CA_BASE64") }
      : {}),
    OPTIONS_VAULT_ADDRESS: required("OPTIONS_VAULT_ADDRESS"),
    QUOTE_VERIFIER_ADDRESS: required("QUOTE_VERIFIER_ADDRESS"),
    OPTIONS_QUOTE_SIGNER_ADDRESS: required("OPTIONS_QUOTE_SIGNER_ADDRESS"),
    OPTIONS_QUOTE_SIGNER_URL: "http://${{floats-options-signer.RAILWAY_PRIVATE_DOMAIN}}:8080",
    OPTIONS_QUOTE_SIGNER_AUTH_TOKEN: required("OPTIONS_QUOTE_SIGNER_AUTH_TOKEN"),
    PRICER_INTERNAL_AUTH_TOKEN: required("PRICER_INTERNAL_AUTH_TOKEN"),
    OPTIONS_RISK_FREE_RATE: required("OPTIONS_RISK_FREE_RATE"),
  },
  "floats-api": {
    OPTIONS_MARKET_ADDRESS: required("OPTIONS_MARKET_ADDRESS"),
    OPTION_TOKEN_ADDRESS: required("OPTION_TOKEN_ADDRESS"),
    OPTIONS_VAULT_ADDRESS: required("OPTIONS_VAULT_ADDRESS"),
    OPTIONS_PRICER_URL: "http://${{floats-options-pricer.RAILWAY_PRIVATE_DOMAIN}}:8080",
    OPTIONS_PRICER_AUTH_TOKEN: required("OPTIONS_PRICER_AUTH_TOKEN"),
  },
  "floats-indexer": {
    RPC_URL: required("RPC_URL"),
    SUPABASE_DB_URL: required("SUPABASE_DB_URL"),
    ...(values.get("SUPABASE_DB_CA_BASE64")?.trim()
      ? { SUPABASE_DB_CA_BASE64: required("SUPABASE_DB_CA_BASE64") }
      : {}),
    KEEPER_ADDRESS: required("KEEPER_ADDRESS"),
    KEEPER_PRIVATE_KEY: required("KEEPER_PRIVATE_KEY"),
    KEEPER_POLL_INTERVAL_MS: required("KEEPER_POLL_INTERVAL_MS"),
    KEEPER_RUN_ONCE: required("KEEPER_RUN_ONCE"),
    OPTIONS_DESIRED_SERIES_JSON: required("OPTIONS_DESIRED_SERIES_JSON"),
    OPTIONS_SERIES_REGISTRY_ADDRESS: required("OPTIONS_SERIES_REGISTRY_ADDRESS"),
    OPTIONS_MARKET_ADDRESS: required("OPTIONS_MARKET_ADDRESS"),
    OPTIONS_SETTLEMENT_ENGINE_ADDRESS: required("OPTIONS_SETTLEMENT_ENGINE_ADDRESS"),
    OPTIONS_VAULT_ADDRESS: required("OPTIONS_VAULT_ADDRESS"),
    OPTIONS_RISK_MANAGER_ADDRESS: required("OPTIONS_RISK_MANAGER_ADDRESS"),
  },
};

let count = 0;
for (const [service, variables] of Object.entries(serviceVariables)) {
  for (const [key, value] of Object.entries(variables)) {
    const result = spawnSync(
      "railway",
      ["variable", "set", key, "--stdin", "--skip-deploys", "--service", service, "--environment", railwayEnvironment],
      { input: value, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] },
    );
    if (result.status !== 0) throw new Error(`Failed to set ${service}.${key}: ${result.stderr.trim()}`);
    count += 1;
  }
}
console.log(`Configured ${count} service-scoped Railway variables; values were not printed.`);
