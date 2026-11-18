"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RangeChart } from "@/components/charts/RangeChart";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { OptionsChain } from "@/features/options/OptionsChain";
import { OptionsVaultPanel } from "@/features/options/OptionsVaultPanel";
import { OptionsPortfolio } from "@/features/options/OptionsPortfolio";
import { TradePanel } from "@/features/trade/TradePanel";
import { formatPercent, formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import { floatApi, type MarketHistoryPointDto } from "@/lib/api-client";
import { resolveSharePriceUsd18 } from "@/lib/nav-history";
import type { MarketProductId } from "./types";
import { useMarkets } from "./useMarkets";
import { buildMarketSeries } from "./market-history";
import { MarketPublicInfo } from "./MarketPublicInfo";
import { SpotTradePanel } from "./SpotTradePanel";
import styles from "./markets.module.css";

export function MarketDetailView({ assetId }: { readonly assetId: string }) {
  const { markets, loading, error, refresh } = useMarkets();
  const { data: indexState } = useIndexState();
  const normalizedAssetId = assetId.toLowerCase();
  const market = normalizedAssetId === "index"
    ? markets.find((candidate) => candidate.kind === "index")
    : markets.find((candidate) => candidate.id.toLowerCase() === normalizedAssetId);
  const enabled = useMemo(() => market?.products.filter((product) => product.enabled) ?? [], [market]);
  const [product, setProduct] = useState<MarketProductId>();
  const [history, setHistory] = useState<readonly MarketHistoryPointDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedOptionsSeriesId, setSelectedOptionsSeriesId] = useState<string>();
  const [informationTab, setInformationTab] = useState<"series" | "positions" | "activity">("activity");

  useEffect(() => {
    if (!enabled.length) return setProduct(undefined);
    if (!product || !enabled.some((candidate) => candidate.id === product)) setProduct(enabled[0]?.id);
  }, [enabled, product]);

  useEffect(() => {
    if (!market) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    floatApi.getMarketHistory(market.id, 500, controller.signal)
      .then(setHistory)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setHistory([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [market]);

  if (loading) return <PageHeader eyebrow="Market" title="Loading market…" description="Reading finalized market capabilities." />;
  if (error) return <PageHeader eyebrow="Market" title="Market unavailable" description="Finalized market state could not be loaded." aside={<button type="button" onClick={refresh}>Try again</button>} />;
  if (!market) return <PageHeader eyebrow="Market" title="Asset not found" description="This asset is not present in the canonical market registry." />;

  const marketSeries = buildMarketSeries(history);
  const priceUsd18 = market.kind === "index"
    ? (indexState ? resolveSharePriceUsd18(indexState) : null) ?? market.priceUsd18
    : market.priceUsd18;
  return (
    <>
      <nav className={`container ${styles.topBack}`} aria-label="Markets navigation">
        <Link href="/markets"><Icon name="arrow-left" />Back to Markets</Link>
      </nav>
      <PageHeader
        eyebrow="Market detail"
        title={<span className={styles.assetTitle}><AssetLogo name={market.name} symbol={market.symbol} src={market.kind === "index" ? "/brand/floats-logo.png" : market.logoUrl ?? undefined} size="lg" /><span>{market.symbol}</span></span>}
        description={market.name}
        aside={<StatusChip tone={market.status === "active" ? "solid" : "outline"}>{market.status}</StatusChip>}
      />
      <section className={`container ${styles.marketOverview}`} aria-label="Market overview">
        <dl className={styles.overviewFacts}>
          <div className={styles.contractFact}><dt>Contract</dt><dd className="tabular">{market.address}</dd></div>
          <div><dt>Index weight</dt><dd>{market.targetWeightBps === null ? "Index asset" : formatPercent(market.targetWeightBps / 100, 2)}</dd></div>
          <div><dt>Asset type</dt><dd>{market.kind === "index" ? "Index" : "Constituent"}</dd></div>
          <div><dt>Oracle / NAV</dt><dd>{market.oracleHealth ?? "Unavailable"}</dd></div>
          <div><dt>Active option series</dt><dd className="tabular">{market.activeOptionSeries}</dd></div>
          <div><dt>Token decimals</dt><dd className="tabular">{market.decimals}</dd></div>
          <div><dt>Available products</dt><dd>{enabled.map((candidate) => candidate.label).join(", ") || "None"}</dd></div>
        </dl>
      </section>
      <main className={`container ${styles.detailGrid}`}>
        <div className={styles.marketColumn}>
          <section className={styles.chartPanel} aria-labelledby="market-chart-title">
            <div className={styles.sectionTitle}><div><p className="eyebrow">Market data</p><h2 id="market-chart-title">{market.chartKind === "nav" ? "NAV history" : "Price history"}</h2></div><strong>{priceUsd18 ? formatUsd(decimalUnitsToNumber(priceUsd18, 18)) : "Unavailable"}</strong></div>
            {marketSeries.ALL.length >= 2 ? <RangeChart seriesByRange={marketSeries} /> : (
              <EmptyState title="Historical chart is not available yet" description="The chart will appear after this asset has at least two canonical finalized observations." />
            )}
            {historyLoading && <p role="status">Loading canonical price history…</p>}
          </section>
          <section className={styles.informationPanel} aria-labelledby="market-information-title">
            <div className={styles.informationHeader}>
              <div><p className="eyebrow">Market records</p><h2 id="market-information-title">Market information</h2></div>
              <div className={styles.informationTabs} role="tablist" aria-label="Market information">
                <button type="button" role="tab" aria-selected={informationTab === "series"} onClick={() => setInformationTab("series")}>Canonical Series</button>
                <button type="button" role="tab" aria-selected={informationTab === "positions"} onClick={() => setInformationTab("positions")}>My Positions</button>
                <button type="button" role="tab" aria-selected={informationTab === "activity"} onClick={() => setInformationTab("activity")}>Public Activity</button>
              </div>
            </div>
            <div role="tabpanel" hidden={informationTab !== "series"}><OptionsChain underlying={market.address} embedded view="chain" selectedSeriesId={selectedOptionsSeriesId} onSelectedSeriesChange={setSelectedOptionsSeriesId} /></div>
            <div role="tabpanel" hidden={informationTab !== "positions"}><OptionsPortfolio embedded /></div>
            <div role="tabpanel" hidden={informationTab !== "activity"}><MarketPublicInfo embedded kind={market.kind} symbol={market.symbol} spotEnabled={market.products.some((candidate) => candidate.id === "spot" && candidate.enabled)} /></div>
          </section>
        </div>
        <section className={styles.transactionPanel} aria-labelledby="market-transaction-title">
          <p className="eyebrow">Transaction panel</p>
          <h2 id="market-transaction-title">Available products</h2>
          <div className={styles.productTabs} role="tablist" aria-label="Market products">
            {market.products.map((candidate) => (
              <button key={candidate.id} type="button" role="tab" aria-selected={product === candidate.id} disabled={!candidate.enabled} title={candidate.disabledReason} onClick={() => setProduct(candidate.id)}>{candidate.label}</button>
            ))}
          </div>
          {market.products.filter((candidate) => !candidate.enabled).map((candidate) => <p key={candidate.id} className={styles.disabledReason}>{candidate.label}: {candidate.disabledReason}</p>)}
          <div className={styles.transactionContent} aria-live="polite">
            {product === "mint-redeem" && <TradePanel />}
            {product === "options" && <OptionsChain underlying={market.address} embedded view="ticket" selectedSeriesId={selectedOptionsSeriesId} onSelectedSeriesChange={setSelectedOptionsSeriesId} />}
            {product === "liquidity" && <OptionsVaultPanel embedded />}
            {product === "spot" && <SpotTradePanel market={market} />}
          </div>
        </section>
      </main>
    </>
  );
}
