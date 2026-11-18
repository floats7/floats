"use client";

import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, LinkButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi, type WalletTransactionDto } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { formatUnits } from "@/lib/units";
import styles from "./TransactionTable.module.css";

export function TransactionTable() {
  const { address, provider } = useWallet();
  const { notify } = useToast();
  const [transactions, setTransactions] = useState<readonly WalletTransactionDto[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (!address || !provider) return;
    setLoading(true);
    try {
      const challenge = await floatApi.getWalletChallenge(address);
      const signature = await provider.request<unknown>({
        method: "personal_sign",
        params: [challenge.message, address],
      });
      if (typeof signature !== "string") throw new Error("Invalid wallet signature");
      setTransactions(await floatApi.getWalletHistory(challenge.message, signature));
    } catch {
      notify("Transaction history authorization failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`container ${styles.section}`} aria-labelledby="history-title">
      <Reveal>
        <h2 id="history-title" className={styles.title}>
          History
        </h2>
      </Reveal>

      {transactions === null ? (
        <EmptyState
          title="Authorize transaction history"
          description="Sign a read-only message to prove wallet ownership. This does not submit a transaction or grant token permissions."
          action={<Button onClick={loadHistory} loading={loading}>Authorize wallet</Button>}
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
