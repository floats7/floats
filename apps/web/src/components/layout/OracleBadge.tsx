"use client";

import { useOracleStatus, type OracleStatus } from "@/hooks/useOracleStatus";
import styles from "./OracleBadge.module.css";

const LABELS: Record<OracleStatus, string> = {
  live: "Oracle live",
  "off-hours": "Off-hours",
  stale: "Oracle stale",
};

export function OracleBadge() {
  const status = useOracleStatus();

  return (
    <span className={styles.badge} data-status={status ?? "pending"} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {status ? LABELS[status] : "Oracle"}
    </span>
  );
}
