"use client";

import Link from "next/link";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatPercent, formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import { marketCandidateStatusLabel } from "@/lib/market-candidate";
import { MarketSparkline } from "./MarketSparkline";
import { useMarkets } from "./useMarkets";
import styles from "./markets.module.css";

export function MarketsView() {
  const { markets, candidates: allCandidates, historyByMarketId, loading, error, refresh } = useMarkets();
  const finalizedAddresses = new Set(markets.map((market) => market.address.toLowerCase()));
  const candidates = allCandidates.filter(
    (candidate) => !candidate.tokenAddress
      || !finalizedAddresses.has(candidate.tokenAddress.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Markets"
        title="One asset flow. Every available product."
        description="Explore the complete recent-IPO Stock Token universe. Finalized markets are transactional; candidates remain visible with their eligibility status."
      />
      <section className={`container ${styles.grid}`} aria-label="Available markets">
        {markets.map((market) => (
          <Link key={market.id} href={`/markets/${encodeURIComponent(market.id)}`} className={styles.card}>
            <div className={styles.identity}>
              <AssetLogo
                name={market.name}
                symbol={market.symbol}
                src={market.kind === "index" ? "/brand/floats-logo.png" : market.logoUrl ?? undefined}
                size="md"
              />
              <div><strong>{market.symbol}</strong><span>{market.name}</span></div>
              <StatusChip tone={market.status === "active" ? "solid" : "outline"}>{market.status}</StatusChip>
            </div>
            <div className={styles.price}>
              <span>Reference value</span>
              <strong>{market.priceUsd18 ? formatUsd(decimalUnitsToNumber(market.priceUsd18, 18)) : "Unavailable"}</strong>
            </div>
            <MarketSparkline history={historyByMarketId[market.id]} label={market.name} />
            <dl className={styles.meta}>
              <div><dt>Index weight</dt><dd>{market.targetWeightBps === null ? "Index" : formatPercent(market.targetWeightBps / 100, 2)}</dd></div>
              <div><dt>Products</dt><dd>{market.products.filter((product) => product.enabled).map((product) => product.label).join(", ") || "View status"}</dd></div>
            </dl>
          </Link>
        ))}
        {candidates.map((candidate) => (
          <Link key={candidate.id} href={`/pipeline/${candidate.id}`} className={styles.card}>
            <div className={styles.identity}>
              <AssetLogo name={candidate.name} symbol={candidate.symbol} src={candidate.logoUrl ?? undefined} size="md" />
              <div><strong>{candidate.symbol}</strong><span>{candidate.name}</span></div>
              <StatusChip tone={candidate.status === "active" ? "solid" : "outline"}>{marketCandidateStatusLabel(candidate.status)}</StatusChip>
            </div>
            <div className={styles.price}>
              <span>Reference value</span>
              <strong>Not active</strong>
            </div>
            <MarketSparkline label={candidate.name} />
            <dl className={styles.meta}>
              <div><dt>Index weight</dt><dd>Awaiting activation</dd></div>
              <div><dt>Products</dt><dd>View eligibility</dd></div>
            </dl>
          </Link>
        ))}
      </section>
      {loading && <p className="container" role="status">Loading finalized markets…</p>}
      {!loading && error && <p className="container" role="alert">Markets are unavailable. <button type="button" onClick={refresh}>Try again</button></p>}
    </>
  );
}
