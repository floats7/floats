import { syncListedMarketCandidates, syncOfficialMarketCandidates } from "../../../packages/database/src/market-candidate-sync.ts";
import { verifyPendingMarketCandidateIdentities } from "../../../packages/database/src/market-candidate-identity-sync.ts";
import { parseCandidateLiquidityRoutes, syncCandidateLiquidity } from "../../../packages/database/src/market-candidate-liquidity-sync.ts";
import { discoverCandidateOracleRoutes, parseCandidateOracleRoutes, syncCandidateOracles } from "../../../packages/database/src/market-candidate-oracle-sync.ts";
import { parseCandidateOptionsRiskRoutes, syncCandidateOptionsRisk } from "../../../packages/database/src/market-candidate-options-risk-sync.ts";
import { createCandidateAlertDelivery } from "./candidate-alerts.ts";
import { scanMarketCandidateImpostors } from "../../../packages/database/src/market-candidate-impostor-scan.ts";

const environment = required("APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = integer("CHAIN_ID", 1);
const mode = candidateSyncMode(process.env.MARKET_CANDIDATE_SYNC_MODE);
const intervalMs = integer("MARKET_CANDIDATE_SYNC_INTERVAL_MS", 15_000, modeInterval(mode));
const config = {
  databaseUrl: new URL(required("SUPABASE_URL")),
  secretKey: required("SUPABASE_SECRET_KEY"),
  rpcUrl: new URL(required("RPC_INDEXER")),
  explorerUrl: new URL(required("BLOCK_EXPLORER_URL")),
  environment,
  chainId,
  routes: parseCandidateLiquidityRoutes(process.env.MARKET_CANDIDATE_LIQUIDITY_ROUTES_JSON),
  oracleRoutes: parseCandidateOracleRoutes(process.env.MARKET_CANDIDATE_ORACLE_ROUTES_JSON),
  optionsRiskRoutes: parseCandidateOptionsRiskRoutes(process.env.MARKET_CANDIDATE_OPTIONS_RISK_ROUTES_JSON),
  referenceTokenAddresses: parseReferenceTokenAddresses(process.env.MARKET_CANDIDATE_REFERENCE_TOKEN_ADDRESSES_JSON),
  onAlert: createCandidateAlertDelivery({
    telegramBotToken: process.env.CANDIDATE_ALERT_TELEGRAM_BOT_TOKEN?.trim(),
    telegramChatId: process.env.CANDIDATE_ALERT_TELEGRAM_CHAT_ID?.trim(),
    databaseUrl: new URL(required("SUPABASE_URL")),
    secretKey: required("SUPABASE_SECRET_KEY"),
    environment,
    chainId,
  }),
} as const;
const chainlinkFeedDirectoryUrl = optionalHttpsUrl("CHAINLINK_FEED_DIRECTORY_URL");

let stopping = false;
let wake: (() => void) | undefined;
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log(JSON.stringify({ event: "candidate_sync_started", environment, chainId, mode, intervalMs }));

let consecutiveFailures = 0;
while (!stopping) {
  try {
    const officialAssetsUpdated = await syncOfficialMarketCandidates(config);
    const interfacesVerified = await verifyPendingMarketCandidateIdentities(config);
    const suspectedImpostors = await scanImpostorsWithoutBlockingLaunch(config);
    const discoveredOracleRoutes = chainlinkFeedDirectoryUrl
      ? await discoverCandidateOracleRoutes({ ...config, directoryUrl: chainlinkFeedDirectoryUrl })
      : [];
    const configuredCandidateIds = new Set(config.oracleRoutes.map((route) => route.candidateId));
    const oracleRoutes = [...config.oracleRoutes, ...discoveredOracleRoutes.filter((route) => !configuredCandidateIds.has(route.candidateId))];
    const oraclesReady = await syncCandidateOracles({ ...config, oracleRoutes });
    const liquidityReady = await syncCandidateLiquidity(config);
    const optionsRiskWarnings = await syncCandidateOptionsRisk(config);
    const listingsUpdated = await syncListedMarketCandidates(config);
    console.log(JSON.stringify({ event: "candidate_sync_completed", environment, chainId, officialAssetsUpdated, interfacesVerified, suspectedImpostors, oraclesReady, liquidityReady, optionsRiskWarnings, listingsUpdated }));
    consecutiveFailures = 0;
  } catch (error) {
    consecutiveFailures += 1;
    console.error(JSON.stringify({
      event: "candidate_sync_failed",
      environment,
      chainId,
      error: error instanceof Error ? error.message : "Unknown error",
      consecutiveFailures,
    }));
  }
  if (!stopping) await delay(backoffInterval(intervalMs, consecutiveFailures));
}
console.log(JSON.stringify({ event: "candidate_sync_stopped", environment, chainId }));

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function integer(key: string, minimum: number, fallback?: number): number {
  const raw = process.env[key]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (value === undefined || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${key} is invalid`);
  return value;
}

type CandidateSyncMode = "normal" | "launch_watch" | "incident";

function candidateSyncMode(raw: string | undefined): CandidateSyncMode {
  const value = raw?.trim() || "normal";
  if (value === "normal" || value === "launch_watch" || value === "incident") return value;
  throw new Error("MARKET_CANDIDATE_SYNC_MODE is invalid");
}

function modeInterval(mode: CandidateSyncMode): number {
  if (mode === "launch_watch") return 15_000;
  if (mode === "incident") return 60_000;
  return 600_000;
}

function backoffInterval(base: number, failures: number): number {
  if (failures <= 0) return base;
  return Math.min(base * 2 ** Math.min(failures, 5), 30 * 60_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, milliseconds);
    wake = finish;
    function finish() {
      clearTimeout(timeout);
      wake = undefined;
      resolve();
    }
  });
}

function stop(): void {
  stopping = true;
  wake?.();
}

function parseReferenceTokenAddresses(raw: string | undefined): readonly string[] {
  if (!raw?.trim()) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(item))) {
    throw new Error("MARKET_CANDIDATE_REFERENCE_TOKEN_ADDRESSES_JSON is invalid");
  }
  return [...new Set(value.map((item) => (item as string).toLowerCase()))];
}

function optionalHttpsUrl(key: string): URL | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;
  const value = new URL(raw);
  if (value.protocol !== "https:") throw new Error(`${key} must use HTTPS`);
  return value;
}

async function scanImpostorsWithoutBlockingLaunch(
  config: Parameters<typeof scanMarketCandidateImpostors>[0],
): Promise<number | null> {
  try {
    return await scanMarketCandidateImpostors(config);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "candidate_impostor_scan_unavailable",
      environment: config.environment,
      chainId: config.chainId,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    return null;
  }
}
