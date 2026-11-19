import type { QueryResultRow } from "pg";

import type { IvObservation, IvSource } from "./quote-policy.ts";
import type {
  Hex,
  PricingContextSource,
  RuntimePricingContext,
  RuntimeQuoteRequest,
} from "./runtime.ts";
import { addUsTradingDays, isUsTradingDay } from "../../../packages/database/src/us-equity-calendar.ts";
import { normalizeTradingCapabilities } from "../../../packages/database/src/trading-capabilities.ts";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface PricingSqlClient {
  query(
    text: string,
    values: readonly unknown[],
  ): Promise<{ readonly rows: readonly QueryResultRow[] }>;
}

export interface OptionsChainPricingReader {
  spot(priceSource: Hex, underlying: Hex): Promise<{ priceUsd18: bigint; healthy: boolean }>;
  vaultAccounting(): Promise<{ totalAssets6: bigint; reservedCollateral6: bigint }>;
}

interface SeriesRow extends QueryResultRow {
  readonly underlying: string;
  readonly price_source: string;
  readonly kind: string;
  readonly strike_usd_18: string;
  readonly cap_usd_18: string;
  readonly expiry: string;
  readonly contract_size_18: string;
  readonly state: string;
  readonly listing_date: string | null;
  readonly candidate_id: string | null;
  readonly identity_approval_status: string | null;
  readonly token_live: boolean | null;
  readonly oracle_ready: boolean | null;
  readonly trading_halted: boolean | null;
  readonly trading_capabilities: unknown;
  readonly options_paused: boolean | null;
  readonly options_exposure_warning: boolean | null;
}

interface VolatilityRow extends QueryResultRow {
  readonly source: IvSource;
  readonly annualized_volatility: number;
  readonly observed_at_seconds: string;
}

export class AuthoritativePricingContextSource implements PricingContextSource {
  constructor(
    private readonly database: PricingSqlClient,
    private readonly chain: OptionsChainPricingReader,
    private readonly environment: "testnet" | "mainnet",
    private readonly chainId: number,
    private readonly riskFreeRate: number,
  ) {}

  async load(request: RuntimeQuoteRequest, nowSeconds: number): Promise<RuntimePricingContext> {
    const seriesResult = await this.database.query(
      `select series.underlying, series.price_source, series.kind, series.strike_usd_18,
              series.cap_usd_18, series.expiry, series.contract_size_18, series.state,
              candidate.expected_listing_date::text as listing_date,
              candidate.candidate_id, candidate.identity_approval_status,
              candidate.token_live, candidate.oracle_ready, candidate.trading_halted,
              candidate.trading_capabilities, candidate.options_paused,
              candidate.options_exposure_warning
         from public.api_options_series series
         left join public.market_candidates candidate
           on candidate.environment = series.environment and candidate.chain_id = series.chain_id
          and lower(candidate.token_address) = lower(series.underlying)
        where series.environment = $1 and series.chain_id = $2 and series.series_id = $3
        limit 1`,
      [this.environment, this.chainId, request.seriesId.toLowerCase()],
    );
    const series = seriesResult.rows[0] as SeriesRow | undefined;
    if (!series || series.state !== "0") throw new Error("SERIES_NOT_ACTIVE");
    enforceCandidateOptionsGate(series);
    const expiry = exactInteger(series.expiry, "expiry");
    if (expiry <= nowSeconds) throw new Error("SERIES_EXPIRED");
    const underlying = address(series.underlying, "underlying");
    const priceSource = address(series.price_source, "price source");
    const [spot, vault, volatilityResult] = await Promise.all([
      this.chain.spot(priceSource, underlying),
      this.chain.vaultAccounting(),
      this.database.query(
        `select source, annualized_volatility,
                extract(epoch from observed_at)::bigint::text as observed_at_seconds
           from public.options_volatility_observations
          where environment = $1 and chain_id = $2 and underlying = $3
          order by observed_at desc limit 30`,
        [this.environment, this.chainId, underlying.toLowerCase()],
      ),
    ]);
    if (!spot.healthy || spot.priceUsd18 <= 0n) throw new Error("ORACLE_UNAVAILABLE");
    const capital = vault.totalAssets6 + vault.reservedCollateral6;
    if (capital <= 0n) throw new Error("OPTIONS_CAPITAL_UNAVAILABLE");
    const utilizationBps = Number(vault.reservedCollateral6 * 10_000n / capital);
    const observations = volatilityResult.rows.map((row) => {
      const item = row as VolatilityRow;
      return {
        source: item.source,
        annualizedVolatility: item.annualized_volatility,
        observedAtSeconds: exactInteger(item.observed_at_seconds, "volatility timestamp"),
      } satisfies IvObservation;
    });
    const launchPeriod = isWithinLaunchTradingDays(series.listing_date, nowSeconds, 3);
    const offHours = isUsMarketOffHours(nowSeconds);
    return {
      signedSpotUsd18: spot.priceUsd18,
      policyInput: {
        pricing: {
          kind: series.kind === "0" ? "capped-call" : "put",
          spotUsd: decimal18(spot.priceUsd18),
          strikeUsd: decimal18(BigInt(series.strike_usd_18)),
          ...(series.kind === "0" ? { capUsd: decimal18(BigInt(series.cap_usd_18)) } : {}),
          timeToExpiryYears: (expiry - nowSeconds) / YEAR_SECONDS,
          riskFreeRate: this.riskFreeRate,
          contractSize: decimal18(BigInt(series.contract_size_18)),
        },
        ivObservations: observations,
        maximumIvAgeSeconds: 86_400,
        minimumVolatility: launchPeriod ? 1.2 : 0.4,
        baseSpreadBps: launchPeriod ? 800 : offHours ? 1_000 : 500,
        oracleHealthy: true,
        utilizationBps,
        sectorPeerMultiplier: 1.25,
        basketPremium: 0.15,
        utilizationWideningBpsAtMaximum: 1_500,
      },
    };
  }
}

function enforceCandidateOptionsGate(series: SeriesRow): void {
  if (!series.candidate_id) return;
  if (series.identity_approval_status !== "approved" || series.token_live !== true) throw new Error("CANDIDATE_IDENTITY_NOT_APPROVED");
  if (series.trading_halted === true) throw new Error("OFFICIAL_TRADING_HALTED");
  if (normalizeTradingCapabilities(series.trading_capabilities).market !== "tradable") throw new Error("OFFICIAL_TRADING_RESTRICTED");
  if (series.oracle_ready !== true) throw new Error("CANDIDATE_ORACLE_NOT_READY");
  if (series.options_paused === true) throw new Error("CANDIDATE_OPTIONS_PAUSED");
  if (series.options_exposure_warning === true) throw new Error("OPTIONS_EXPOSURE_WARNING");
}

export function isWithinLaunchTradingDays(listingDate: string | null, nowSeconds: number, tradingDays: number): boolean {
  if (!listingDate || !/^\d{4}-\d{2}-\d{2}$/.test(listingDate) || !isUsTradingDay(listingDate)) return false;
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(nowSeconds * 1_000));
  const lastLaunchDate = addUsTradingDays(listingDate, tradingDays - 1);
  return currentDate >= listingDate && currentDate <= lastLaunchDate;
}

function address(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value.toLowerCase() as Hex;
}

function exactInteger(value: string, label: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`Invalid ${label}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function decimal18(value: bigint): number {
  const result = Number(value) / 1e18;
  if (!Number.isFinite(result) || result <= 0) throw new Error("Invalid decimal-18 value");
  return result;
}

function isUsMarketOffHours(nowSeconds: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(nowSeconds * 1_000));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (value.weekday === "Sat" || value.weekday === "Sun") return true;
  const minutes = Number(value.hour) * 60 + Number(value.minute);
  return minutes < 570 || minutes >= 960;
}
