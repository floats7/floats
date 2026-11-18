"use client";

import Link from "next/link";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatPercent, formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import { useMarkets } from "./useMarkets";
import styles from "./markets.module.css";

export function MarketsView() {
  const { markets, loading, error, refresh } = useMarkets();
  return (
    <>
      <PageHeader
        eyebrow="Markets"
        title="One asset flow. Every available product."
        description="Explore finalized market assets, inspect their onchain state, and transact only through products that are active for that asset."
      />
      <section className={`container ${styles.grid}`} aria-label="Available markets">
        {markets.map((market) => (
          <Link key={market.id} href={`/markets/${encodeURIComponent(market.id)}`} className={styles.card}>
            <div className={styles.identity}>
              <AssetLogo name={market.name} symbol={market.symbol} size="md" />
              <div><strong>{market.symbol}</strong><span>{market.name}</span></div>
              <StatusChip tone={market.status === "active" ? "solid" : "outline"}>{market.status}</StatusChip>
            </div>
            <div className={styles.price}>
              <span>Reference value</span>
              <strong>{market.priceUsd18 ? formatUsd(decimalUnitsToNumber(market.priceUsd18, 18)) : "Unavailable"}</strong>
            </div>
            <dl className={styles.meta}>
              <div><dt>Index weight</dt><dd>{market.targetWeightBps === null ? "Index" : formatPercent(market.targetWeightBps / 100, 2)}</dd></div>
              <div><dt>Products</dt><dd>{market.products.filter((product) => product.enabled).map((product) => product.label).join(", ") || "View status"}</dd></div>
            </dl>
          </Link>
        ))}
      </section>
      {loading && <p className="container" role="status">Loading finalized markets…</p>}
      {!loading && error && <p className="container" role="alert">Markets are unavailable. <button type="button" onClick={refresh}>Try again</button></p>}
    </>
  );
}
