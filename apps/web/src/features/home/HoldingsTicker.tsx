import { Delta } from "@/components/ui/Delta";
import { Marquee } from "@/components/ui/Marquee";
import { CONSTITUENTS } from "@/data/constituents";
import { formatUsd } from "@/lib/format";
import styles from "./HoldingsTicker.module.css";

function TickerItems() {
  return CONSTITUENTS.map((item) => (
    <li key={item.ticker} className={styles.item}>
      <span className={styles.ticker}>{item.ticker}</span>
      <span className={`${styles.price} tabular`}>{formatUsd(item.price)}</span>
      <Delta value={item.returnSinceEntry} digits={1} />
    </li>
  ));
}

export function HoldingsTicker() {
  return (
    <Marquee label="Index constituents">
      <TickerItems />
    </Marquee>
  );
}
