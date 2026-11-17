import { FEES } from "@/data/index-stats";
import { formatPercent } from "@/lib/format";
import styles from "./TradeNotes.module.css";

const NOTES = [
  {
    title: "Cash settlement",
    body: `Deposit or receive USDG. The vault swaps into constituents on your behalf, protected by a ${formatPercent(FEES.maxSlippage)} oracle-based slippage limit. Fee ${formatPercent(FEES.cashRate)}.`,
  },
  {
    title: "In-kind settlement",
    body: `Move the Stock Tokens themselves, in the vault's actual proportions. No swaps, no price oracle, and a lower ${formatPercent(FEES.inKindRate)} fee. This path keeps the DEX price anchored to NAV.`,
  },
  {
    title: "When prices go stale",
    body: "If a price feed ages past its heartbeat, cash flows pause automatically. In-kind stays open so you can always exit.",
  },
] as const;

export function TradeNotes() {
  return (
    <ul className={styles.list}>
      {NOTES.map((note) => (
        <li key={note.title} className={styles.item}>
          <h2 className={styles.title}>{note.title}</h2>
          <p className={styles.body}>{note.body}</p>
        </li>
      ))}
    </ul>
  );
}
