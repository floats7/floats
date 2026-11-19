import { defineRailway, group, preserve, project, service } from "railway/iac";

export default defineRailway((context) => {
  const network = resolveNetwork(context);
  const web = service("floats-web", {
    build: "npm install && npm --prefix apps/web install && npm --prefix apps/web run build",
    start: "npm --prefix apps/web run start -- --hostname 0.0.0.0 --port $PORT",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: 1,
    env: {
      APP_ENV: network,
      NEXT_PUBLIC_API_URL: preserve(),
      NODE_ENV: preserve(),
    },
  });

  const api = service("floats-api", {
    build: "npm install",
    start: "npm run start:api",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: 1,
    env: {
      APP_ENV: network,
      BLOCK_EXPLORER_URL: preserve(),
      CHAIN_ID: preserve(),
      FLOATS_VAULT_ADDRESS: preserve(),
      NODE_ENV: preserve(),
      RPC_URL: preserve(),
      SUPABASE_SECRET_KEY: preserve(),
      SUPABASE_URL: preserve(),
      USDG_ADDRESS: preserve(),
      WALLETS_CONNECT_PROJECT_ID: preserve(),
      WEB_ORIGIN: preserve(),
      OPTIONS_MARKET_ADDRESS: preserve(),
      OPTION_TOKEN_ADDRESS: preserve(),
      OPTIONS_VAULT_ADDRESS: preserve(),
      OPTIONS_PRICER_URL: preserve(),
      OPTIONS_PRICER_AUTH_TOKEN: preserve(),
    },
  });

  const indexer = service("floats-indexer", {
    build: "npm install",
    start: "npm run start:operations",
    replicas: 1,
    env: {
      APP_ENV: network,
      BLOCK_EXPLORER_URL: preserve(),
      CHAIN_ID: preserve(),
      FEE_MODULE_ADDRESS: preserve(),
      FLOATS_VAULT_ADDRESS: preserve(),
      INDEXER_BATCH_SIZE: preserve(),
      INDEXER_CONFIRMATIONS: preserve(),
      INDEXER_POLL_INTERVAL_MS: preserve(),
      INDEXER_REORG_REPLAY_DEPTH: preserve(),
      INDEXER_START_BLOCK: preserve(),
      INDEX_REGISTRY_ADDRESS: preserve(),
      NAV_ORACLE_ADDRESS: preserve(),
      NODE_ENV: preserve(),
      REBALANCER_ADDRESS: preserve(),
      RPC_URL: preserve(),
      RPC_INDEXER: preserve(),
      SUPABASE_SECRET_KEY: preserve(),
      SUPABASE_URL: preserve(),
      SUPABASE_DB_URL: preserve(),
      SUPABASE_DB_CA_BASE64: preserve(),
      KEEPER_ADDRESS: preserve(),
      KEEPER_PRIVATE_KEY: preserve(),
      KEEPER_POLL_INTERVAL_MS: preserve(),
      KEEPER_RUN_ONCE: preserve(),
      MARKET_CANDIDATE_SYNC_INTERVAL_MS: preserve(),
      MARKET_CANDIDATE_SYNC_MODE: preserve(),
      MARKET_CANDIDATE_REFERENCE_TOKEN_ADDRESSES_JSON: preserve(),
      MARKET_CANDIDATE_LIQUIDITY_ROUTES_JSON: preserve(),
      MARKET_CANDIDATE_ORACLE_ROUTES_JSON: preserve(),
      MARKET_CANDIDATE_OPTIONS_RISK_ROUTES_JSON: preserve(),
      MARKET_CANDIDATE_SEC_FILINGS_JSON: preserve(),
      SEC_USER_AGENT: preserve(),
      CHAINLINK_FEED_DIRECTORY_URL: preserve(),
      CANDIDATE_ALERT_TELEGRAM_BOT_TOKEN: preserve(),
      CANDIDATE_ALERT_TELEGRAM_CHAT_ID: preserve(),
      OPTIONS_DESIRED_SERIES_JSON: preserve(),
      OPTIONS_SERIES_REGISTRY_ADDRESS: preserve(),
      OPTIONS_MARKET_ADDRESS: preserve(),
      OPTIONS_SETTLEMENT_ENGINE_ADDRESS: preserve(),
      OPTIONS_VAULT_ADDRESS: preserve(),
      OPTIONS_RISK_MANAGER_ADDRESS: preserve(),
    },
  });

  const signer = service("floats-options-signer", {
    build: "npm install",
    start: "npm run start:signer",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: 1,
    env: {
      APP_ENV: network,
      CHAIN_ID: preserve(),
      PORT: "8080",
      QUOTE_VERIFIER_ADDRESS: preserve(),
      OPTIONS_QUOTE_SIGNER_PRIVATE_KEY: preserve(),
      SIGNER_INTERNAL_AUTH_TOKEN: preserve(),
    },
  });

  const pricer = service("floats-options-pricer", {
    build: "npm install",
    start: "npm run start:pricer",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: 1,
    env: {
      APP_ENV: network,
      CHAIN_ID: preserve(),
      PORT: "8080",
      RPC_URL: preserve(),
      SUPABASE_DB_URL: preserve(),
      SUPABASE_DB_CA_BASE64: preserve(),
      OPTIONS_VAULT_ADDRESS: preserve(),
      QUOTE_VERIFIER_ADDRESS: preserve(),
      OPTIONS_QUOTE_SIGNER_ADDRESS: preserve(),
      OPTIONS_QUOTE_SIGNER_URL: preserve(),
      OPTIONS_QUOTE_SIGNER_AUTH_TOKEN: preserve(),
      PRICER_INTERNAL_AUTH_TOKEN: preserve(),
      OPTIONS_RISK_FREE_RATE: preserve(),
    },
  });

  const backendServices = network === "testnet"
    ? [api, indexer, pricer, signer]
    : [api, indexer];

  return project("Floats", {
    resources: [web, group("Backend", backendServices)],
  });
});

interface RailwayEnvironmentContext {
  readonly environment?: string;
  readonly environmentName?: string;
  isEnvironment(name: string): boolean;
}

function resolveNetwork(context: RailwayEnvironmentContext): "testnet" | "mainnet" {
  if (context.isEnvironment("testnet")) return "testnet";
  if (context.isEnvironment("mainnet")) return "mainnet";
  const environment = context.environmentName ?? context.environment ?? "unknown";
  throw new Error(
    `Unsupported Railway environment '${environment}'. Expected an explicitly linked testnet or mainnet environment.`,
  );
}
