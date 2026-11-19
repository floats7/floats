"use client";

import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, LinkButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { usePortfolio } from "./PortfolioProvider";
import { formatDate } from "@/lib/format";
import { formatUnits } from "@/lib/units";
import styles from "./TransactionTable.module.css";

export function TransactionTable() {
  const { walletData, walletDataStatus, verifyWalletData } = usePortfolio();
  const { notify } = useToast();
  const transactions = walletData?.transactions;

  const loadHistory = async () => {
    try {
      await verifyWalletData();
    } catch {
      notify("Wallet data verification failed", "error");
    }
  };

  return (
    <section className={`container ${styles.section}`} aria-labelledby="history-title">
      <Reveal>
        <h2 id="history-title" className={styles.title}>
          History
        </h2>
      </Reveal>

      {transactions === undefined ? (
        <EmptyState
          title="Verify wallet data"
          description="Your wallet is connected. An optional, five-minute signature proves wallet ownership for private records. It cannot submit transactions, approve tokens or spend funds. Floats will never ask for a seed phrase or private key."
          action={<Button onClick={loadHistory} loading={walletDataStatus === "loading"}>Verify wallet data</Button>}
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="No finalized Floats mints or redemptions were indexed for this wallet."
          action={<LinkButton href="/markets/index">Explore index market</LinkButton>}
        />
      ) : (
        <Reveal delay={0.08} className={styles.scroller}>
          <table className={styles.table}>
            <caption className="visually-hidden">Transaction history</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Type</th>
                <th scope="col" data-numeric="true">fIPO</th>
                <th scope="col" data-numeric="true">Value (USD)</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.transactionHash}>
                  <td className="tabular">{formatDate(transaction.submittedAt)}</td>
                  <td>{actionLabel(transaction.action)}</td>
                  <td data-numeric="true" className="tabular">{formatRaw(transaction.shareAmount, 18)}</td>
                  <td data-numeric="true" className="tabular">{formatRaw(transaction.assetAmount, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      )}
    </section>
  );
}

function actionLabel(action: string): string {
  if (action === "cash_mint") return "Cash mint";
  if (action === "cash_redeem") return "Cash redeem";
  if (action === "in_kind_redeem") return "In-kind redeem";
  return "Floats transaction";
}

function formatRaw(value: string | null, decimals: number): string {
  return value === null ? "—" : formatUnits(value, decimals, 4);
}
