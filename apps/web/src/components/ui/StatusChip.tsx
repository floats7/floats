import type { ReactNode } from "react";
import styles from "./StatusChip.module.css";

interface StatusChipProps {
  tone?: "solid" | "outline" | "muted";
  children: ReactNode;
}

export function StatusChip({ tone = "outline", children }: StatusChipProps) {
  return (
    <span className={styles.chip} data-tone={tone}>
      {children}
    </span>
  );
}
