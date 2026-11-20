import { Pool, type QueryResultRow } from "pg";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { postgresTls } from "../../../packages/database/src/postgres-tls.ts";

import {
  OptionsSeriesCreationJob,
  OptionsSeriesCloseJob,
  OptionsSettlementJob,
  OptionsWithdrawalEpochJob,
  PerpsFundingJob,
  PerpsLiquidationJob,
  PerpsRiskAlertJob,
  PerpsSessionJob,
  PerpsWithdrawalJob,
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
import { PerpsActionDiscovery, type PerpsMarketDescriptor, type PerpsPositionCandidate } from "./perps-discovery.ts";
import { PerpsKeeperCycle } from "./perps-cycle.ts";
import { normalizeTradingCapabilities } from "../../../packages/database/src/trading-capabilities.ts";
import { resolvePerpsSession } from "../../../packages/database/src/perps-session.ts";

interface CandidateRow extends QueryResultRow {
  readonly id: string;
}
interface PerpsPositionRow extends QueryResultRow { readonly account_address: string; readonly market_id: string; readonly margin_mode: string; }
interface PerpsSessionRow extends QueryResultRow { readonly market_id: string; readonly trading_capabilities: unknown; readonly trading_halted: boolean | null; }
interface PerpsLiquidationRow extends QueryResultRow { readonly payload: Readonly<Record<string, unknown>>; }

const config = loadConfig(process.env);
const account = privateKeyToAccount(config.privateKey);
if (account.address.toLowerCase() !== config.keeperAddress.toLowerCase()) {
  throw new Error("KEEPER_PRIVATE_KEY does not match KEEPER_ADDRESS");
}

const database = new Pool({
  connectionString: config.databaseUrl,
  max: 3,
  ssl: postgresTls(process.env.SUPABASE_DB_CA_BASE64, config.environment === "mainnet"),
});
const state = new SupabaseKeeperState(
  new PostgresKeeperStateDatabase(database),
  config.environment,
  config.chainId,
);
const recentAlerts = new Map<string, number>();
const alerts = {
  async publish(alert: Alert): Promise<void> {
    const key = `${alert.code}:${JSON.stringify(alert.context)}`;
    const now = Date.now();
    if ((recentAlerts.get(key) ?? 0) > now - 600_000) return;
    recentAlerts.set(key, now);
    console.error(JSON.stringify({ event: "keeper_alert", ...alert }));
  },
};
const coordinator = new TransactionCoordinator(
  state,
  createViemTransactionClient({ rpcUrl: config.rpcUrl, account }),
  alerts,
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
const perpsDiscovery = config.perps ? new PerpsActionDiscovery(new URL(config.rpcUrl), config.perps) : undefined;
const perpsCycle = perpsDiscovery ? new PerpsKeeperCycle(
  perpsDiscovery,
  new PerpsFundingJob(coordinator),
  new PerpsLiquidationJob(coordinator),
  new PerpsSessionJob(coordinator),
  new PerpsWithdrawalJob(coordinator),
) : undefined;
const perpsRiskAlerts = new PerpsRiskAlertJob(alerts);

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
    if (perpsCycle) {
      const marketIds = await loadPerpsMarketIds();
      const [marketDescriptors, positions, withdrawals] = await Promise.all([
        Promise.all(marketIds.map((marketId) => perpsDiscovery!.marketDescriptor(marketId))),
        loadPerpsPositionCandidates(),
        loadPerpsWithdrawalCandidates(observedAtSeconds),
      ]);
      const sessions = await loadPerpsSessions(new Date(startedAt), perpsDiscovery!, marketDescriptors);
      const perpsResult = await perpsCycle.run({ observedAtSeconds, marketIds, positions, withdrawals, sessions });
      console.log(JSON.stringify({ event: "perps_keeper_cycle", ...perpsResult }));
      const riskMetrics = await loadPerpsRiskMetrics(startedAt, perpsDiscovery!, marketDescriptors);
      if (riskMetrics) await perpsRiskAlerts.run({ idempotencyKey: `perps-risk:${Math.floor(observedAtSeconds / 600)}`, ...riskMetrics });
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "options_keeper_cycle_failed",
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }));
  }
  if (config.runOnce) break;
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
    runOnce: booleanValue(env.KEEPER_RUN_ONCE ?? "false", "KEEPER_RUN_ONCE"),
    privateKey: privateKey as Hex,
    keeperAddress: address(required("KEEPER_ADDRESS"), "KEEPER_ADDRESS"),
    rpcUrl: secureUrl(required("RPC_URL")),
    databaseUrl: required("SUPABASE_DB_URL"),
    registry: address(required("OPTIONS_SERIES_REGISTRY_ADDRESS"), "OPTIONS_SERIES_REGISTRY_ADDRESS"),
    settlementEngine: address(required("OPTIONS_SETTLEMENT_ENGINE_ADDRESS"), "OPTIONS_SETTLEMENT_ENGINE_ADDRESS"),
    vault: address(required("OPTIONS_VAULT_ADDRESS"), "OPTIONS_VAULT_ADDRESS"),
    desiredSeries: parseDesiredSeries(env.OPTIONS_DESIRED_SERIES_JSON ?? "[]"),
    perps: readPerpsConfig(env),
    perpsRisk: {
      minimumInsurance6: unsigned(env.PERPS_MINIMUM_INSURANCE_ALERT_6 ?? "0", "PERPS_MINIMUM_INSURANCE_ALERT_6"),
      utilizationWarningBps: unsigned(env.PERPS_UTILIZATION_WARNING_BPS ?? "6000", "PERPS_UTILIZATION_WARNING_BPS"),
      openInterestWarningBps: unsigned(env.PERPS_OPEN_INTEREST_WARNING_BPS ?? "8000", "PERPS_OPEN_INTEREST_WARNING_BPS"),
      largeLiquidationThresholdUsd18: unsigned(env.PERPS_LARGE_LIQUIDATION_ALERT_USD_18 ?? "0", "PERPS_LARGE_LIQUIDATION_ALERT_USD_18"),
    },
  } as const;
}

function readPerpsConfig(env: NodeJS.ProcessEnv) {
  const keys = ["PERPS_REGISTRY_ADDRESS", "PERPS_MARKET_ADDRESS", "PERPS_ORACLE_ADDRESS", "PERPS_FUNDING_ENGINE_ADDRESS", "PERPS_RISK_ENGINE_ADDRESS", "PERPS_LIQUIDATION_ENGINE_ADDRESS", "PERPS_LIQUIDITY_VAULT_ADDRESS", "PERPS_INSURANCE_FUND_ADDRESS"] as const;
  const values = keys.map((key) => env[key]?.trim()).filter((value): value is string => Boolean(value));
  if (values.length === 0) return undefined;
  if (values.length !== keys.length) throw new Error("All Perps keeper addresses must be configured together");
  return { registry: address(values[0]!, keys[0]), market: address(values[1]!, keys[1]), oracle: address(values[2]!, keys[2]), funding: address(values[3]!, keys[3]), risk: address(values[4]!, keys[4]), liquidation: address(values[5]!, keys[5]), vault: address(values[6]!, keys[6]), insurance: address(values[7]!, keys[7]) } as const;
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
function booleanValue(value: string, label: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false`);
}
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadPerpsMarketIds(): Promise<readonly Hex[]> {
  const result = await database.query<CandidateRow>(
    `select distinct market_id as id from public.perps_activity
      where environment = $1 and chain_id = $2 and canonical = true
        and event_name = 'PerpsMarketCreated' and market_id is not null
      order by id asc limit 100`,
    [config.environment, config.chainId],
  );
  return result.rows.map((row) => bytes32(row.id, "Perps market"));
}

async function loadPerpsPositionCandidates(): Promise<readonly PerpsPositionCandidate[]> {
  const result = await database.query<PerpsPositionRow>(
    `with known_positions as (
       select distinct on (account_address, market_id)
              account_address, market_id,
              block_number, log_index
         from public.perps_activity
        where environment = $1 and chain_id = $2 and canonical = true
          and event_name = 'PerpsPositionModified'
          and account_address is not null and market_id is not null
        order by account_address, market_id, block_number desc, log_index desc
     ), latest_status as (
       select distinct on (account_address, market_id)
              account_address, market_id, payload->>'positionOpen' as position_open
         from public.perps_activity
        where environment = $1 and chain_id = $2 and canonical = true
          and event_name = 'PerpsPositionStatusChanged'
          and account_address is not null and market_id is not null
        order by account_address, market_id, block_number desc, log_index desc
     ), latest_modes as (
       select distinct on (account_address, market_id)
              account_address, market_id, payload->>'newMode' as mode
         from public.perps_activity
        where environment = $1 and chain_id = $2 and canonical = true
          and event_name = 'PerpsMarginModeChanged'
          and account_address is not null and market_id is not null
        order by account_address, market_id, block_number desc, log_index desc
     )
     select position.account_address, position.market_id,
            case when mode.mode = '1' then 'cross' else 'isolated' end as margin_mode
       from known_positions position
       join latest_status status using (account_address, market_id)
       left join latest_modes mode using (account_address, market_id)
      where status.position_open = 'true'
      order by position.block_number asc, position.log_index asc limit 500`,
    [config.environment, config.chainId],
  );
  return result.rows.map((row) => ({
    account: address(row.account_address, "Perps account"),
    marketId: bytes32(row.market_id, "Perps position market"),
    mode: row.margin_mode === "cross" ? "cross" : "isolated",
  }));
}

async function loadPerpsWithdrawalCandidates(nowSeconds: number): Promise<readonly bigint[]> {
  const result = await database.query<CandidateRow>(
    `select request_id::text as id from public.perps_lp_withdrawals
      where environment = $1 and chain_id = $2 and state = 'queued'
        and extract(epoch from unlock_at)::bigint <= $3
      order by unlock_at asc limit 100`,
    [config.environment, config.chainId, nowSeconds],
  );
  return result.rows.map((row) => unsigned(row.id, "Perps withdrawal request"));
}

async function loadPerpsSessions(now: Date, discovery: PerpsActionDiscovery, markets: readonly PerpsMarketDescriptor[]): Promise<readonly { readonly marketId: Hex; readonly desired: 0 | 1 | 2 | 3 }[]> {
  return Promise.all(markets.map(async (market) => {
    const result = await database.query<PerpsSessionRow>(
      `select $3::text as market_id, trading_capabilities, trading_halted
         from public.market_candidates
        where environment = $1 and chain_id = $2 and lower(token_address) = $4
        order by updated_at desc limit 1`,
      [config.environment, config.chainId, market.marketId, market.underlying.toLowerCase()],
    );
    const row = result.rows[0];
    const marketId = market.marketId;
    const capabilities = normalizeTradingCapabilities(row?.trading_capabilities);
    const healthy = await discovery.oracleHealthy(marketId);
    if (!healthy) await alerts.publish({ code: "STALE_ORACLE", severity: "critical", message: "Perps oracle is unavailable or stale", context: { marketId } });
    const session = !row || row.trading_halted === true || !healthy ? "closed" : resolvePerpsSession(now, {
      extendedHours: capabilities.extended === "tradable",
      overnight: capabilities.overnight === "tradable",
    });
    const desired = ({ regular: 0, extended: 1, overnight: 2, closed: 3 } as const)[session];
    return { marketId, desired };
  }));
}

async function loadPerpsRiskMetrics(sinceMs: number, discovery: PerpsActionDiscovery, markets: readonly PerpsMarketDescriptor[]) {
  const [lp, liquidationResult, insuranceBalance6] = await Promise.all([
    discovery.lpState(markets.map((market) => market.marketId)),
    database.query<PerpsLiquidationRow>(
      `select payload from public.perps_activity
        where environment = $1 and chain_id = $2 and canonical = true
          and event_name in ('PerpsPositionLiquidated','PerpsIsolatedLiquidationExecuted','PerpsCrossLiquidationExecuted')
          and observed_at >= to_timestamp($3 / 1000.0)
        order by block_number desc, log_index desc limit 100`, [config.environment, config.chainId, sinceMs - config.pollIntervalMs],
    ),
    discovery.insuranceBalance(),
  ]);
  const caps = new Map(markets.map((market) => [market.marketId.toLowerCase(), market.openInterestCapBps]));
  const managedUsd18 = lp.managedAssets6 * 10n ** 12n;
  const openInterest = lp.openInterest.map((row) => ({
    marketId: row.marketId,
    sideOpenInterestUsd18: bigintMax(row.longUsd18, row.shortUsd18),
    capUsd18: managedUsd18 * (caps.get(row.marketId.toLowerCase()) ?? 0n) / 10_000n,
  }));
  await persistPerpsLpState(lp);
  let largestLiquidationUsd18 = 0n;
  for (const row of liquidationResult.rows) {
    const closed = decimalPayload(row.payload.closedSize18);
    const mark = decimalPayload(row.payload.markPriceUsd18);
    if (closed !== undefined && mark !== undefined) largestLiquidationUsd18 = bigintMax(largestLiquidationUsd18, closed * mark / 10n ** 18n);
  }
  return {
    utilizationBps: lp.utilizationBps, utilizationWarningBps: config.perpsRisk.utilizationWarningBps,
    recognizedBadDebt6: lp.recognizedBadDebt6, insuranceBalance6,
    minimumInsurance6: config.perpsRisk.minimumInsurance6, largestLiquidationUsd18,
    largeLiquidationThresholdUsd18: config.perpsRisk.largeLiquidationThresholdUsd18,
    openInterest, openInterestWarningBps: config.perpsRisk.openInterestWarningBps,
  };
}

async function persistPerpsLpState(lp: Awaited<ReturnType<PerpsActionDiscovery["lpState"]>>): Promise<void> {
  const sharePrice18 = lp.totalSupply18 === 0n ? 0n : lp.managedAssets6 * 10n ** 30n / lp.totalSupply18;
  await database.query(
    `insert into public.perps_lp_state (
       environment, chain_id, vault_address, managed_assets_6, available_liquidity_6,
       reserved_trader_liability_6, payable_withdrawal_assets_6, recognized_bad_debt_6,
       total_supply_18, utilization_bps, operations_paused, block_number, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
     on conflict (environment, chain_id, vault_address) do update set
       managed_assets_6 = excluded.managed_assets_6, available_liquidity_6 = excluded.available_liquidity_6,
       reserved_trader_liability_6 = excluded.reserved_trader_liability_6, payable_withdrawal_assets_6 = excluded.payable_withdrawal_assets_6,
       recognized_bad_debt_6 = excluded.recognized_bad_debt_6, total_supply_18 = excluded.total_supply_18,
       utilization_bps = excluded.utilization_bps, operations_paused = excluded.operations_paused,
       block_number = excluded.block_number, updated_at = excluded.updated_at`,
    [config.environment, config.chainId, config.perps!.vault.toLowerCase(), lp.managedAssets6.toString(), lp.availableLiquidity6.toString(), lp.reservedTraderLiability6.toString(), lp.payableWithdrawalAssets6.toString(), lp.recognizedBadDebt6.toString(), lp.totalSupply18.toString(), lp.utilizationBps.toString(), lp.operationsPaused, lp.blockNumber.toString()],
  );
  await database.query(
    `insert into public.perps_lp_snapshots (
       environment, chain_id, vault_address, block_number, managed_assets_6,
       total_supply_18, share_price_18, utilization_bps, observed_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (environment, chain_id, vault_address, block_number) do nothing`,
    [config.environment, config.chainId, config.perps!.vault.toLowerCase(), lp.blockNumber.toString(), lp.managedAssets6.toString(), lp.totalSupply18.toString(), sharePrice18.toString(), lp.utilizationBps.toString()],
  );
}

function decimalPayload(value: unknown): bigint | undefined { return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value) : undefined; }
function bigintMax(left: bigint, right: bigint): bigint { return left > right ? left : right; }
