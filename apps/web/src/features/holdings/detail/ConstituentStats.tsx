import { Reveal } from "@/components/ui/Reveal";
import { exitDateFor } from "@/data/constituents";
import type { Constituent } from "@/data/types";
import { AS_OF, daysBetween } from "@/lib/dates";
import { formatDate, formatPercent } from "@/lib/format";
import styles from "./ConstituentStats.module.css";

export function ConstituentStats({ item }: { item: Constituent }) {
  const exitDate = exitDateFor(item.ipoDate);
  const drift = item.actualWeight - item.targetWeight;

  const stats = [
    { label: "Target weight", value: formatPercent(item.targetWeight, 1) },
    { label: "Actual weight", value: formatPercent(item.actualWeight, 1), hint: `${drift >= 0 ? "+" : "-"}${Math.abs(drift).toFixed(1)} pt vs target` },
    { label: "IPO date", value: formatDate(item.ipoDate), hint: `${daysBetween(item.ipoDate, AS_OF)} days ago` },
    { label: "Index entry", value: formatDate(item.entryDate) },
    { label: "Scheduled exit", value: formatDate(exitDate), hint: `in ${daysBetween(AS_OF, exitDate)} days` },
  ];

  return (
    <Reveal className="container">
      <dl className={styles.grid}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.cell}>
            <dt className="eyebrow">{stat.label}</dt>
            <dd className={`${styles.value} tabular`}>{stat.value}</dd>
            {stat.hint && <dd className={styles.hint}>{stat.hint}</dd>}
          </div>
        ))}
      </dl>
    </Reveal>
  );
}
