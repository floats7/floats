"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RangeChart } from "@/components/charts/RangeChart";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { OptionsChain } from "@/features/options/OptionsChain";
import { OptionsVaultPanel } from "@/features/options/OptionsVaultPanel";
import { TradePanel } from "@/features/trade/TradePanel";
import { formatPercent, formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import { floatApi, type MarketHistoryPointDto } from "@/lib/api-client";
import type { MarketProductId } from "./types";
import { useMarkets } from "./useMarkets";
import { buildMarketSeries } from "./market-history";
import styles from "./markets.module.css";

export function MarketDetailView({ assetId }: { readonly assetId: string }) {
  const { markets, loading, error, refresh } = useMarkets();
  const market = markets.find((candidate) => candidate.id.toLowerCase() === assetId.toLowerCase());
  const enabled = useMemo(() => market?.products.filter((product) => product.enabled) ?? [], [market]);
  const [product, setProduct] = useState<MarketProductId>();
  const [history, setHistory] = useState<readonly MarketHistoryPointDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

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
  return (
    <>
      <PageHeader
        eyebrow="Market detail"
        title={market.symbol}
        description={market.name}
        aside={<div className={styles.headerIdentity}><AssetLogo name={market.name} symbol={market.symbol} size="lg" /><StatusChip tone={market.status === "active" ? "solid" : "outline"}>{market.status}</StatusChip></div>}
      />
      <div className={`container ${styles.detailGrid}`}>
        <section className={styles.chartPanel} aria-labelledby="market-chart-title">
          <div className={styles.sectionTitle}><div><p className="eyebrow">Market data</p><h2 id="market-chart-title">{market.chartKind === "nav" ? "NAV history" : "Price history"}</h2></div><strong>{market.priceUsd18 ? formatUsd(decimalUnitsToNumber(market.priceUsd18, 18)) : "Unavailable"}</strong></div>
          {marketSeries.ALL.length >= 2 ? <RangeChart seriesByRange={marketSeries} /> : (
            <EmptyState title="Historical chart is not available yet" description="The chart will appear after this asset has at least two canonical finalized observations." />
          )}
          {historyLoading && <p role="status">Loading canonical price history…</p>}
          <dl className={styles.marketFacts}>
            <div><dt>Contract</dt><dd>{market.address}</dd></div>
            <div><dt>Index weight</dt><dd>{market.targetWeightBps === null ? "Index asset" : formatPercent(market.targetWeightBps / 100, 2)}</dd></div>
            <div><dt>Oracle</dt><dd>{market.oracleHealth ?? "Unavailable"}</dd></div>
            <div><dt>Active option series</dt><dd>{market.activeOptionSeries}</dd></div>
          </dl>
        </section>
        <aside className={styles.transactionPanel} aria-labelledby="market-transaction-title">
          <p className="eyebrow">Transaction panel</p>
          <h2 id="market-transaction-title">Available products</h2>
          <div className={styles.productTabs} role="tablist" aria-label="Market products">
            {market.products.map((candidate) => (
              <button key={candidate.id} type="button" role="tab" aria-selected={product === candidate.id} disabled={!candidate.enabled} title={candidate.disabledReason} onClick={() => setProduct(candidate.id)}>{candidate.label}</button>
            ))}
          </div>
          {market.products.filter((candidate) => !candidate.enabled).map((candidate) => <p key={candidate.id} className={styles.disabledReason}>{candidate.label}: {candidate.disabledReason}</p>)}
        </aside>
      </div>
      <section className={styles.productContent} aria-live="polite">
        {product === "mint-redeem" && <TradePanel />}
        {product === "options" && <OptionsChain underlying={market.address} />}
        {product === "liquidity" && <OptionsVaultPanel />}
      </section>
      <nav className={`container ${styles.back}`} aria-label="Markets navigation"><Link href="/markets">Back to all markets</Link></nav>
    </>
  );
}
