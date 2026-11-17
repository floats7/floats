"use client";

import { RangeChart } from "@/components/charts/RangeChart";
import { CountUp } from "@/components/ui/CountUp";
import { HudSection } from "@/components/ui/HudSection";
import { Reveal } from "@/components/ui/Reveal";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import styles from "./Numbers.module.css";
import { decimalUnitsToNumber } from "@/lib/units";
import { buildNavSeries } from "@/lib/nav-history";

export function Numbers() {
  const { data, navHistory, loading, error, refresh } = useIndexState();
  const nav = data?.sharePriceUsd18 ? decimalUnitsToNumber(data.sharePriceUsd18, 18) : 0;
  const tvl = data ? decimalUnitsToNumber(data.navUsd18, 18) : 0;
  const constituentCount = data?.holdings.length ?? 0;
  const navSeries = buildNavSeries(navHistory);
  return (
    <HudSection index="004" title="Proof of execution" meta="NAV / TVL / Constituents">
      <div className={styles.intro}>
        <Reveal className={styles.chip}>The index today</Reveal>
        <Reveal delay={0.05}>
          <h2 className={styles.title}>Holding the new class of listings</h2>
        </Reveal>
      </div>

      <Reveal className={styles.stats}>
        <dl className={styles.list}>
          <div className={styles.pair}>
            <dd>{data ? <CountUp value={nav} format="usd" /> : "—"}</dd>
            <dt>NAV per fIPO</dt>
          </div>
          <div className={styles.pair}>
            <dd>—</dd>
            <dt>DEX premium</dt>
          </div>
          <div className={styles.pair}>
            <dd>{data ? <CountUp value={tvl} format="usdCompact" /> : "—"}</dd>
            <dt>TVL</dt>
          </div>
          <div className={styles.pair}>
            <dd>{data ? <CountUp value={constituentCount} format="integer" /> : "—"}</dd>
            <dt>Constituents</dt>
          </div>
          <div className={styles.pair}>
            <dd>—</dd>
            <dt>30 days</dt>
          </div>
        </dl>
      </Reveal>

      <Reveal className={styles.chart}>
        {navSeries.ALL.length >= 2 && <RangeChart seriesByRange={navSeries} />}
        {loading && <p role="status">Loading finalized NAV history…</p>}
        {!loading && error && <p role="alert">NAV history unavailable. <button type="button" onClick={refresh}>Try again</button></p>}
        {!loading && !error && navSeries.ALL.length < 2 && <p>NAV history will appear after two finalized snapshots.</p>}
      </Reveal>
    </HudSection>
  );
}
