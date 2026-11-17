"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/ui/Reveal";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { formatPercent } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./AllocationBar.module.css";

const SEGMENT_STAGGER = 0.06;
const SHADE_STEP = 7;
const SHADE_BASE = 92;

const shadeFor = (index: number) => `hsl(220 6% ${SHADE_BASE - index * SHADE_STEP}%)`;

export function AllocationBar() {
  const { data, assets, loading, error, refresh } = useIndexState();
  const symbols = new Map(assets.map((asset) => [asset.tokenAddress.toLowerCase(), asset.symbol]));
  const totalValue = data?.holdings.reduce((sum, item) => sum + BigInt(item.valueUsd18 ?? "0"), 0n) ?? 0n;
  const allocations = data?.holdings.map((item) => ({
    tokenAddress: item.tokenAddress,
    label: symbols.get(item.tokenAddress.toLowerCase()) ?? `${item.tokenAddress.slice(0, 6)}…${item.tokenAddress.slice(-4)}`,
    weight: totalValue === 0n ? 0 : Number(BigInt(item.valueUsd18 ?? "0") * 10_000n / totalValue) / 100,
  })) ?? [];
  return (
    <Reveal className="container">
      <div className={styles.panel}>
        <p className="eyebrow">Actual allocation</p>
        <div className={styles.bar} role="img" aria-label="Stacked bar of actual constituent weights">
          {allocations.map((item, index) => (
            <motion.span
              key={item.tokenAddress}
              className={styles.segment}
              style={{ flexGrow: item.weight, background: shadeFor(index) }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: index * SEGMENT_STAGGER }}
            />
          ))}
        </div>
        <ul className={styles.legend}>
          {allocations.map((item, index) => (
            <li key={item.tokenAddress} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: shadeFor(index) }} aria-hidden="true" />
              <span className={styles.ticker}>{item.label}</span>
              <span className={`${styles.weight} tabular`}>{formatPercent(item.weight, 1)}</span>
            </li>
          ))}
        </ul>
        {loading && <p role="status">Loading finalized allocation…</p>}
        {!loading && error && <p role="alert">Allocation unavailable. <button type="button" onClick={refresh}>Try again</button></p>}
        {!loading && !error && allocations.length === 0 && <p>No finalized holdings yet.</p>}
      </div>
    </Reveal>
  );
}
