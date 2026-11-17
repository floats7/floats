"use client";

import { CountUp } from "@/components/ui/CountUp";
import { Reveal } from "@/components/ui/Reveal";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { decimalUnitsToNumber } from "@/lib/units";
import { usePortfolio } from "./PortfolioProvider";
import styles from "./PortfolioSummary.module.css";

export function PortfolioSummary() {
  const { position } = usePortfolio();
  const { data } = useIndexState();
  const sharePrice = data?.sharePriceUsd18 ? decimalUnitsToNumber(data.sharePriceUsd18, 18) : 0;
  const marketValue = position.shares * sharePrice;

  return (
    <Reveal className="container">
      <dl className={styles.grid}>
        <div className={styles.cell}>
          <dt className="eyebrow">Position</dt>
          <dd className={`${styles.value} tabular`}>
            <CountUp value={position.shares} format="fipo" />
          </dd>
        </div>
        <div className={styles.cell}>
          <dt className="eyebrow">Market value</dt>
          <dd className={`${styles.value} tabular`}>
            <CountUp value={marketValue} format="usd" />
          </dd>
        </div>
      </dl>
    </Reveal>
  );
}
