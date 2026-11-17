import { Reveal } from "@/components/ui/Reveal";
import { FEE_ROWS } from "@/data/methodology";
import styles from "./FeeTable.module.css";

export function FeeTable() {
  return (
    <section className={`container ${styles.section}`} aria-labelledby="fees-title">
      <Reveal>
        <h2 id="fees-title" className={styles.title}>
          Fees
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <dl className={styles.list}>
          {FEE_ROWS.map((row) => (
            <div key={row.label} className={styles.row}>
              <dt className={styles.label}>{row.label}</dt>
              <dd className={`${styles.value} tabular`}>{row.value}</dd>
              <dd className={styles.note}>{row.note}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
