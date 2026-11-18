"use client";

import { FEES } from "@/data/index-stats";
import { useFeeRates } from "@/hooks/useFeeRates";
import { formatPercent } from "@/lib/format";
import styles from "./TradeNotes.module.css";

export function TradeNotes() {
  const { data } = useFeeRates();
  const cashFee = data ? formatPercent(data.cashBps / 100) : "Reading live rate";
  const inKindFee = data ? formatPercent(data.inKindBps / 100) : "Reading live rate";
  const notes = [
    {
      title: "Cash settlement",
      body: `Deposit or receive USDG while US markets and every required oracle are live. Keeper rebalancing is protected by a ${formatPercent(FEES.maxSlippage)} oracle-based slippage cap. Current fee: ${cashFee}.`,
    },
    {
      title: "In-kind settlement",
      body: `Move the Stock Tokens themselves in the vault's finalized proportions. There is no swap or price-oracle dependency. Current fee: ${inKindFee}.`,
    },
    {
      title: "Fail-closed availability",
      body: "Cash flows stop outside regular US market hours or when a price feed is unhealthy. In-kind redemption stays open so holders retain an oracle-independent exit.",
    },
  ] as const;

  return (
    <ul className={styles.list}>
      {notes.map((note) => (
        <li key={note.title} className={styles.item}>
          <h2 className={styles.title}>{note.title}</h2>
          <p className={styles.body}>{note.body}</p>
        </li>
      ))}
    </ul>
  );
}
