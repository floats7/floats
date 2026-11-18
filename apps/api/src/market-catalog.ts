import type { PublicConfig } from "./config.ts";
import type {
  AssetReadModel,
  HoldingReadModel,
  NavReadModel,
  OptionsSeriesReadModel,
  ReadModelRepository,
} from "./read-model-repository.ts";
import type { TokenMetadataSource } from "./token-metadata-reader.ts";

export type MarketProductId = "mint-redeem" | "options" | "liquidity" | "spot";

export interface MarketProduct {
  readonly id: MarketProductId;
  readonly label: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}

export interface MarketAsset {
  readonly id: string;
  readonly kind: "index" | "constituent";
  readonly address: string;
  readonly uid: string | null;
  readonly symbol: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly decimals: number;
  readonly status: "active" | "removed" | "unavailable";
  readonly priceUsd18: string | null;
  readonly targetWeightBps: number | null;
  readonly oracleHealth: string | null;
  readonly products: readonly MarketProduct[];
  readonly activeOptionSeries: number;
  readonly chartKind: "nav" | "price";
}

export interface MarketHistoryPoint {
  readonly blockNumber: number;
  readonly valueUsd18: string;
  readonly observedAt: string;
}

export class MarketCatalog {
  public constructor(
    private readonly readModels: ReadModelRepository,
    private readonly metadata: TokenMetadataSource,
    private readonly config: PublicConfig,
  ) {}

  public async list(signal?: AbortSignal): Promise<readonly MarketAsset[]> {
    const [assets, navRows, series, candidates] = await Promise.all([
      this.readModels.listActiveAssets(signal),
      this.readModels.latestNav(this.config.vaultAddress, signal),
      this.readModels.listOptionsSeries(signal),
      this.readModels.listMarketCandidates(signal),
    ]);
    const nav = navRows[0];
    const holdings = nav
      ? await this.readModels.listLatestHoldings(this.config.vaultAddress, nav.block_number, signal)
      : [];
    const holdingByAddress = new Map(holdings.map((item) => [item.token_address.toLowerCase(), item]));
    // A holdings snapshot is captured from the configured registry's
    // getTrackedTokens() result. Restrict the catalog to that exact set so
    // rows left behind by an earlier registry deployment cannot surface.
    const currentAssets = assets.filter((asset) => holdingByAddress.has(asset.token_address.toLowerCase()));
    const metadata = await Promise.all([
      this.metadata.read(this.config.vaultAddress),
      ...currentAssets.map((asset) => this.metadata.read(asset.token_address)),
    ]);
    const seriesByUnderlying = groupSeries(series);
    const candidateByAddress = new Map(candidates.flatMap((candidate) => candidate.token_address
      ? [[candidate.token_address.toLowerCase(), candidate] as const]
      : []));
    const candidateBySymbol = new Map(candidates.map((candidate) => [candidate.symbol.toUpperCase(), candidate]));

    const indexMetadata = metadata[0] ?? null;
    const index = this.indexMarket(indexMetadata, nav, seriesByUnderlying);
    const constituents = currentAssets.map((asset, indexPosition) => this.constituentMarket(
      asset,
      metadata[indexPosition + 1] ?? null,
      holdingByAddress.get(asset.token_address.toLowerCase()),
      seriesByUnderlying,
      candidateByAddress.get(asset.token_address.toLowerCase())
        ?? candidateBySymbol.get(asset.symbol.toUpperCase()),
    ));
    return [index, ...constituents];
  }

  public async find(assetId: string, signal?: AbortSignal): Promise<MarketAsset | undefined> {
    const markets = await this.list(signal);
    if (assetId.toLowerCase() === "index") return markets.find((item) => item.kind === "index");
    return markets.find((item) => item.id === assetId.toLowerCase());
  }

  public async history(
    assetId: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<readonly MarketHistoryPoint[] | undefined> {
    const market = await this.find(assetId, signal);
    if (!market) return undefined;
    if (market.kind === "index") {
      const descending = await this.readModels.listNavHistory(this.config.vaultAddress, limit, signal);
      return [...descending].reverse().flatMap((item) => item.share_price_usd_18 && item.observed_at
        ? [{ blockNumber: item.block_number, valueUsd18: item.share_price_usd_18, observedAt: item.observed_at }]
        : []);
    }
    const descending = await this.readModels.listHoldingHistory(
      this.config.vaultAddress,
      market.address,
      limit,
      signal,
    );
    return [...descending].reverse().flatMap((item) => item.normalized_price_usd_18 && item.observed_at
      ? [{ blockNumber: item.block_number, valueUsd18: item.normalized_price_usd_18, observedAt: item.observed_at }]
      : []);
  }

  private indexMarket(
    metadata: Awaited<ReturnType<TokenMetadataSource["read"]>>,
    nav: NavReadModel | undefined,
    seriesByUnderlying: ReadonlyMap<string, readonly OptionsSeriesReadModel[]>,
  ): MarketAsset {
    const address = this.config.vaultAddress.toLowerCase();
    const activeSeries = countActive(seriesByUnderlying.get(address));
    return {
      id: address,
      kind: "index",
      address,
      uid: null,
      symbol: metadata?.symbol ?? shortAddress(address),
      name: metadata?.name ?? "Index vault token",
      logoUrl: null,
      decimals: metadata?.decimals ?? 18,
      status: nav ? "active" : "unavailable",
      priceUsd18: nav?.share_price_usd_18 ?? null,
      targetWeightBps: null,
      oracleHealth: nav ? "nav" : null,
      products: [
        capability("mint-redeem", "Mint & Redeem", Boolean(nav), "Index state is unavailable"),
        optionsCapability(activeSeries),
        capability("liquidity", "Earn", Boolean(this.config.optionsVaultAddress), "Liquidity vault is unavailable"),
      ],
      activeOptionSeries: activeSeries,
      chartKind: "nav",
    };
  }

  private constituentMarket(
    asset: AssetReadModel,
    metadata: Awaited<ReturnType<TokenMetadataSource["read"]>>,
    holding: HoldingReadModel | undefined,
    seriesByUnderlying: ReadonlyMap<string, readonly OptionsSeriesReadModel[]>,
    candidate: { readonly logo_url: string | null } | undefined,
  ): MarketAsset {
    const address = asset.token_address.toLowerCase();
    const activeSeries = countActive(seriesByUnderlying.get(address));
    return {
      id: address,
      kind: "constituent",
      address,
      uid: asset.asset_uid,
      symbol: metadata?.symbol ?? asset.symbol,
      name: metadata?.name ?? `${asset.symbol} market asset`,
      logoUrl: candidate?.logo_url ?? null,
      decimals: metadata?.decimals ?? asset.decimals,
      status: asset.registry_status === "active" ? "active" : asset.registry_status === "removed" ? "removed" : "unavailable",
      priceUsd18: holding?.normalized_price_usd_18 ?? null,
      targetWeightBps: asset.target_weight_bps,
      oracleHealth: holding?.oracle_health ?? null,
      products: [optionsCapability(activeSeries)],
      activeOptionSeries: activeSeries,
      chartKind: "price",
    };
  }
}

function groupSeries(series: readonly OptionsSeriesReadModel[]): Map<string, readonly OptionsSeriesReadModel[]> {
  const grouped = new Map<string, OptionsSeriesReadModel[]>();
  for (const item of series) {
    const key = item.underlying.toLowerCase();
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function countActive(series: readonly OptionsSeriesReadModel[] | undefined): number {
  return series?.filter((item) => item.state === "0").length ?? 0;
}

function optionsCapability(activeSeries: number): MarketProduct {
  return capability("options", "Options", activeSeries > 0, "No active option series");
}

function capability(
  id: MarketProductId,
  label: string,
  enabled: boolean,
  disabledReason: string,
): MarketProduct {
  return { id, label, enabled, ...(enabled ? {} : { disabledReason }) };
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
