import { syncOfficialMarketCandidates } from "../../../packages/database/src/market-candidate-sync.ts";

const environment = required("APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = integer("CHAIN_ID", 1);
const intervalMs = integer("MARKET_CANDIDATE_SYNC_INTERVAL_MS", 300_000, 21_600_000);
const config = {
  databaseUrl: new URL(required("SUPABASE_URL")),
  secretKey: required("SUPABASE_SECRET_KEY"),
  environment,
  chainId,
} as const;

let stopping = false;
let wake: (() => void) | undefined;
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log(JSON.stringify({ event: "candidate_sync_started", environment, chainId, intervalMs }));

while (!stopping) {
  try {
    const updated = await syncOfficialMarketCandidates(config);
    console.log(JSON.stringify({ event: "candidate_sync_completed", environment, chainId, updated }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "candidate_sync_failed",
      environment,
      chainId,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }
  if (!stopping) await delay(intervalMs);
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
