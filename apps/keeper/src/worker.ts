import { Pool, type QueryResultRow } from "pg";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  OptionsSeriesCreationJob,
  OptionsSeriesCloseJob,
  OptionsSettlementJob,
  OptionsWithdrawalEpochJob,
} from "./jobs.ts";
import { OptionsKeeperCycle } from "./options-cycle.ts";
import {
  JsonRpcOptionsContractReader,
  OptionsActionDiscovery,
  type OptionsSeriesTerms,
} from "./options-discovery.ts";
import { PostgresKeeperStateDatabase } from "./postgres-state-database.ts";
import { SupabaseKeeperState } from "./state.ts";
import { TransactionCoordinator } from "./transaction-coordinator.ts";
import type { Alert, Hex } from "./types.ts";
import { createViemTransactionClient } from "./viem-transaction-client.ts";

interface CandidateRow extends QueryResultRow {
  readonly id: string;
}

const config = loadConfig(process.env);
const account = privateKeyToAccount(config.privateKey);
if (account.address.toLowerCase() !== config.keeperAddress.toLowerCase()) {
  throw new Error("KEEPER_PRIVATE_KEY does not match KEEPER_ADDRESS");
}

const database = new Pool({
  connectionString: config.databaseUrl,
  max: 3,
  ssl: { rejectUnauthorized: true },
});
const state = new SupabaseKeeperState(
  new PostgresKeeperStateDatabase(database),
  config.environment,
  config.chainId,
);
const coordinator = new TransactionCoordinator(
  state,
  createViemTransactionClient({ rpcUrl: config.rpcUrl, account }),
  {
    async publish(alert: Alert): Promise<void> {
      console.error(JSON.stringify({ event: "keeper_alert", ...alert }));
    },
  },
  { maximumAttempts: 3, retryDelayMs: 30_000 },
);
const cycle = new OptionsKeeperCycle(
  new OptionsActionDiscovery(
    new JsonRpcOptionsContractReader(new URL(config.rpcUrl)),
    {
      registry: config.registry,
      settlementEngine: config.settlementEngine,
      vault: config.vault,
    },
  ),
  new OptionsSeriesCreationJob(coordinator),
  new OptionsSeriesCloseJob(coordinator),
  new OptionsSettlementJob(coordinator),
  new OptionsWithdrawalEpochJob(coordinator),
);

let stopping = false;
process.once("SIGTERM", () => { stopping = true; });
process.once("SIGINT", () => { stopping = true; });

console.log(JSON.stringify({
  event: "options_keeper_started",
  environment: config.environment,
  keeper: account.address,
}));

while (!stopping) {
  const startedAt = Date.now();
  try {
    const observedAtSeconds = Math.floor(startedAt / 1_000);
    const [tradingCloseCandidates, settlementCandidates, withdrawalCandidates] = await Promise.all([
      loadTradingCloseCandidates(observedAtSeconds),
      loadSettlementCandidates(observedAtSeconds),
      loadWithdrawalCandidates(observedAtSeconds),
    ]);
    const result = await cycle.run({
      observedAtSeconds,
      desiredSeries: config.desiredSeries,
      tradingCloseCandidates,
      settlementCandidates,
      withdrawalCandidates,
    });
    console.log(JSON.stringify({ event: "options_keeper_cycle", ...result }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "options_keeper_cycle_failed",
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }));
  }
  const remaining = Math.max(0, config.pollIntervalMs - (Date.now() - startedAt));
  if (!stopping) await delay(remaining);
}

await database.end();
console.log(JSON.stringify({ event: "options_keeper_stopped" }));

async function loadSettlementCandidates(nowSeconds: number): Promise<readonly Hex[]> {
  const result = await database.query<CandidateRow>(
    `select series_id as id
       from public.api_options_series
      where environment = $1 and chain_id = $2 and state = '1'
        and expiry::numeric <= $3
      order by expiry asc
      limit 100`,
    [config.environment, config.chainId, nowSeconds],
  );
  return result.rows.map((row) => bytes32(row.id, "settlement series"));
}

async function loadTradingCloseCandidates(nowSeconds: number): Promise<readonly Hex[]> {
  const result = await database.query<CandidateRow>(
    `select series_id as id
       from public.api_options_series
      where environment = $1 and chain_id = $2 and state in ('0', '2')
        and expiry::numeric <= $3
      order by expiry asc
      limit 100`,
    [config.environment, config.chainId, nowSeconds],
  );
  return result.rows.map((row) => bytes32(row.id, "trading-close series"));
}

async function loadWithdrawalCandidates(nowSeconds: number): Promise<readonly bigint[]> {
  const result = await database.query<CandidateRow>(
    `select request_id as id
       from public.api_options_withdrawals
      where environment = $1 and chain_id = $2 and state = 'WithdrawalRequested'
        and extract(epoch from unlock_at)::bigint <= $3
      order by unlock_at asc
      limit 100`,
    [config.environment, config.chainId, nowSeconds],
  );
  return result.rows.map((row) => unsigned(row.id, "withdrawal request"));
}

function loadConfig(env: NodeJS.ProcessEnv) {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const environment = required("APP_ENV");
  if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
  const chainId = exactPositiveInteger(required("CHAIN_ID"), "CHAIN_ID");
  const pollIntervalMs = exactPositiveInteger(env.KEEPER_POLL_INTERVAL_MS ?? "15000", "KEEPER_POLL_INTERVAL_MS");
  if (pollIntervalMs < 5_000 || pollIntervalMs > 300_000) throw new Error("KEEPER_POLL_INTERVAL_MS is out of range");
  const privateKey = required("KEEPER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("KEEPER_PRIVATE_KEY is invalid");
  return {
    environment,
    chainId,
    pollIntervalMs,
    privateKey: privateKey as Hex,
    keeperAddress: address(required("KEEPER_ADDRESS"), "KEEPER_ADDRESS"),
    rpcUrl: secureUrl(required("RPC_URL")),
    databaseUrl: required("SUPABASE_DB_URL"),
    registry: address(required("OPTIONS_SERIES_REGISTRY_ADDRESS"), "OPTIONS_SERIES_REGISTRY_ADDRESS"),
    settlementEngine: address(required("OPTIONS_SETTLEMENT_ENGINE_ADDRESS"), "OPTIONS_SETTLEMENT_ENGINE_ADDRESS"),
    vault: address(required("OPTIONS_VAULT_ADDRESS"), "OPTIONS_VAULT_ADDRESS"),
    desiredSeries: parseDesiredSeries(env.OPTIONS_DESIRED_SERIES_JSON ?? "[]"),
  } as const;
}

function parseDesiredSeries(value: string): readonly OptionsSeriesTerms[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 100) throw new Error("OPTIONS_DESIRED_SERIES_JSON is invalid");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Desired series ${index} is invalid`);
    const row = item as Record<string, unknown>;
    const kind = exactIntegerValue(row.kind, `desired series ${index} kind`);
    if (kind !== 0 && kind !== 1) throw new Error(`Desired series ${index} kind is invalid`);
    return {
      underlying: addressValue(row.underlying, `desired series ${index} underlying`),
      underlyingUid: bytes32Value(row.underlyingUid, `desired series ${index} UID`),
      priceSource: addressValue(row.priceSource, `desired series ${index} price source`),
      kind,
      strikeUsd18: unsignedValue(row.strikeUsd18, `desired series ${index} strike`),
      capUsd18: unsignedValue(row.capUsd18, `desired series ${index} cap`),
      expiry: exactPositiveIntegerValue(row.expiry, `desired series ${index} expiry`),
      contractSize18: unsignedValue(row.contractSize18, `desired series ${index} contract size`),
      corporateActionPolicyVersion: exactPositiveIntegerValue(row.corporateActionPolicyVersion, `desired series ${index} policy version`),
    };
  });
}

function address(value: string, label: string): Hex {
  try { return getAddress(value).toLowerCase() as Hex; } catch { throw new Error(`${label} is invalid`); }
}
function addressValue(value: unknown, label: string): Hex {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  return address(value, label);
}
function bytes32(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is invalid`);
  return value.toLowerCase() as Hex;
}
function bytes32Value(value: unknown, label: string): Hex {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  return bytes32(value, label);
}
function unsigned(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} is invalid`);
  return BigInt(value);
}
function unsignedValue(value: unknown, label: string): bigint {
  if (typeof value !== "string") throw new Error(`${label} must be a decimal string`);
  return unsigned(value, label);
}
function exactIntegerValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`);
  return value;
}
function exactPositiveIntegerValue(value: unknown, label: string): number {
  const result = exactIntegerValue(value, label);
  if (result === 0) throw new Error(`${label} must be positive`);
  return result;
}
function exactPositiveInteger(value: string, label: string): number {
  const parsed = unsigned(value, label);
  if (parsed === 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} is invalid`);
  return Number(parsed);
}
function secureUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("RPC_URL must use HTTPS");
  return url.toString();
}
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
