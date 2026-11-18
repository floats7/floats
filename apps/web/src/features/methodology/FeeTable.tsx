"use client";

import { Reveal } from "@/components/ui/Reveal";
import { useFeeRates } from "@/hooks/useFeeRates";
import { formatPercent } from "@/lib/format";
import styles from "./FeeTable.module.css";

export function FeeTable() {
  const { data, loading, error, retry } = useFeeRates();
  const rate = (bps: number | undefined) => bps === undefined ? "Pending" : formatPercent(bps / 100);
  const rows = [
    { label: "Management fee", value: rate(data?.managementBps), note: "Current deployed annual dilution rate." },
    { label: "Cash mint & redeem", value: rate(data?.cashBps), note: "Current deployed cash transaction rate." },
    { label: "In-kind redemption", value: rate(data?.inKindBps), note: "Current deployed oracle-independent exit rate." },
    { label: "Off-hours access", value: "In-kind only", note: "Cash flows fail closed; no surcharge is used." },
  ] as const;
  return (
    <section className={`container ${styles.section}`} aria-labelledby="fees-title">
      <Reveal>
        <h2 id="fees-title" className={styles.title}>
          Fees
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <dl className={styles.list}>
          {rows.map((row) => (
            <div key={row.label} className={styles.row}>
              <dt className={styles.label}>{row.label}</dt>
              <dd className={`${styles.value} tabular`}>{row.value}</dd>
              <dd className={styles.note}>{row.note}</dd>
            </div>
          ))}
        </dl>
        {loading && <p className={styles.state} role="status">Reading deployed fee configuration…</p>}
        {!loading && error && <p className={styles.state} role="alert">Fee configuration unavailable. <button type="button" onClick={retry}>Try again</button></p>}
        {data && <p className={styles.state}>Confirmed at block <span className="tabular">{data.blockNumber}</span>.</p>}
      </Reveal>
    </section>
  );
}
