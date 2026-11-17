"use client";

import { Button, LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/Skeleton";
import { INDEX_STATS } from "@/data/index-stats";
import type { Constituent } from "@/data/types";
import { usePortfolio } from "@/features/portfolio/PortfolioProvider";
import { useWallet } from "@/features/wallet/WalletProvider";
import { formatNumber, formatUsd } from "@/lib/format";
import styles from "./ExposureCard.module.css";

/** Shows how much of the connected wallet's fIPO position is exposed to this constituent. */
export function ExposureCard({ item }: { item: Constituent }) {
  const { status, position } = usePortfolio();
  const { openConnect } = useWallet();

  return (
    <Reveal className={`container ${styles.section}`}>
      <div className={styles.card}>
        <h2 className={styles.title}>Your exposure to {item.ticker}</h2>

        {status === "disconnected" && (
          <>
            <p className={styles.copy}>Connect a wallet to see how much of your fIPO position sits in {item.name}.</p>
            <Button onClick={openConnect}>Connect wallet</Button>
          </>
        )}

        {status === "loading" && <Skeleton width="12rem" height="2.5rem" />}

        {status === "error" && <p className={styles.copy}>Wallet exposure is unavailable on the active network.</p>}

        {status === "ready" && position.shares > 0 && (
          <>
            <p className={`${styles.value} tabular`}>{formatUsd((position.shares * INDEX_STATS.nav * item.actualWeight) / 100)}</p>
            <p className={styles.copy}>
              {formatNumber(position.shares, 2)} fIPO at {formatNumber(item.actualWeight, 1)}% weight.
            </p>
          </>
        )}

        {status === "ready" && position.shares === 0 && (
          <>
            <p className={styles.copy}>You do not hold fIPO yet. Mint to gain exposure to every constituent at once.</p>
            <LinkButton href="/trade">Mint fIPO</LinkButton>
          </>
        )}
      </div>
    </Reveal>
  );
}
