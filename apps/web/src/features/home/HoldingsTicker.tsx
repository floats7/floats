"use client";

import { Delta } from "@/components/ui/Delta";
import { Marquee } from "@/components/ui/Marquee";
import { formatUsd } from "@/lib/format";
import { useHomeMarketUniverse } from "./HomeMarketUniverse";
import styles from "./HoldingsTicker.module.css";

function TickerItems({ items }: { readonly items: ReturnType<typeof useHomeMarketUniverse> }) {
  return items.map((item) => (
    <li key={item.id} className={styles.item}>
      <span className={styles.ticker}>{item.symbol}</span>
      <span className={`${styles.price} tabular`}>{item.price === null ? "Pending" : formatUsd(item.price)}</span>
      {item.dailyChange === null ? <span className={styles.pending}>24H pending</span> : <Delta value={item.dailyChange} digits={1} />}
    </li>
  ));
}

export function HoldingsTicker() {
  const items = useHomeMarketUniverse();
  if (items.length === 0) return null;
  return (
    <div className={styles.universe}>
      <p className={styles.context}>Market universe · live values and 24H trends</p>
      <Marquee label="Floats market universe">
        <TickerItems items={items} />
      </Marquee>
    </div>
  );
}
