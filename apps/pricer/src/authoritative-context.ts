import type { QueryResultRow } from "pg";

import type { IvObservation, IvSource } from "./quote-policy.ts";
import type {
  Hex,
  PricingContextSource,
  RuntimePricingContext,
  RuntimeQuoteRequest,
} from "./runtime.ts";

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
  readonly eligible_from: string | null;
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
              asset.eligible_from
         from public.api_options_series series
         left join public.assets asset
           on asset.environment = series.environment and asset.chain_id = series.chain_id
          and lower(asset.token_address) = lower(series.underlying)
        where series.environment = $1 and series.chain_id = $2 and series.series_id = $3
        limit 1`,
      [this.environment, this.chainId, request.seriesId.toLowerCase()],
    );
    const series = seriesResult.rows[0] as SeriesRow | undefined;
    if (!series || series.state !== "0") throw new Error("SERIES_NOT_ACTIVE");
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
    const eligibleFrom = series.eligible_from === null ? undefined : exactInteger(series.eligible_from, "eligible from");
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
        ipoDay: eligibleFrom !== undefined && nowSeconds >= eligibleFrom && nowSeconds < eligibleFrom + 86_400,
        offHours: isUsMarketOffHours(nowSeconds),
        oracleHealthy: true,
        utilizationBps,
        sectorPeerMultiplier: 1.25,
        basketPremium: 0.15,
        utilizationWideningBpsAtMaximum: 1_500,
      },
    };
  }
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
