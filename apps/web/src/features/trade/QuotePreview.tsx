import { SummaryList } from "@/components/ui/SummaryList";
import { formatNumber } from "@/lib/format";
import type { InKindQuote } from "@/lib/quote";
import { cashSummaryRows } from "./trade-summary";
import styles from "./QuotePreview.module.css";
import type { TradeRequest } from "@/lib/trade";

export function CashPreview({ request }: { request: TradeRequest }) {
  return <SummaryList rows={cashSummaryRows(request).filter((row) => row.label !== "You pay")} />;
}

export function InKindPreview({ direction, quote }: { direction: TradeRequest["direction"]; quote: InKindQuote }) {
  const label = direction === "Mint" ? "Deposit these tokens" : "Receive these tokens";

  return (
    <div className={styles.legs}>
      <SummaryList
        rows={[
          { label: "Fee", value: `${formatNumber(quote.feeShares, 4)} fIPO` },
          { label: "Net shares", value: `${formatNumber(quote.netShares, 4)} fIPO`, strong: true },
        ]}
      />
      <p className="eyebrow">{label}</p>
      <ul className={styles.legList}>
        {quote.legs.map((leg) => (
          <li key={leg.ticker} className={styles.leg}>
            <span>{leg.ticker}</span>
            <span className="tabular">{formatNumber(leg.units, 4)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
