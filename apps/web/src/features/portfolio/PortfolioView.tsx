"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useWallet } from "@/features/wallet/WalletProvider";
import { usePortfolio } from "./PortfolioProvider";
import { PortfolioSummary } from "./PortfolioSummary";
import { TransactionTable } from "./TransactionTable";
import styles from "./PortfolioView.module.css";

/** Chooses between the disconnected, loading and ready states of the portfolio. */
export function PortfolioView() {
  const { status } = usePortfolio();
  const { openConnect } = useWallet();

  if (status === "disconnected") {
    return (
      <div className="container">
        <EmptyState
          title="Connect a wallet to see your position"
          description="Your fIPO balance, cost basis and transaction history appear here once a wallet is connected."
          action={<Button onClick={openConnect}>Connect wallet</Button>}
        />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className={`container ${styles.loading}`} role="status" aria-label="Loading portfolio">
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} height="5.5rem" />
          ))}
        </div>
        <Skeleton height="14rem" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="container">
        <EmptyState
          title="Portfolio unavailable"
          description="We could not read this wallet on the active network. Check the selected network and try again."
        />
      </div>
    );
  }

  return (
    <>
      <PortfolioSummary />
      <TransactionTable />
    </>
  );
}
