import styles from "./SummaryList.module.css";

export interface SummaryRow {
  label: string;
  value: string;
  strong?: boolean;
}

export function SummaryList({ rows }: { rows: readonly SummaryRow[] }) {
  return (
    <dl className={styles.list}>
      {rows.map((row) => (
        <div key={row.label} className={styles.row} data-strong={row.strong ?? false}>
          <dt>{row.label}</dt>
          <dd className="tabular">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
