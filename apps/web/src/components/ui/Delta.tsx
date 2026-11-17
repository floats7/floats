import { formatSignedPercent } from "@/lib/format";
import styles from "./Delta.module.css";

interface DeltaProps {
  value: number;
  digits?: number;
}

/** Signed change. Direction is carried by arrow and sign, never by color alone. */
export function Delta({ value, digits = 2 }: DeltaProps) {
  const direction = value < 0 ? "down" : "up";
  return (
    <span className={`${styles.delta} tabular`} data-direction={direction}>
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className={styles.arrow}>
        <path d="M5 1.5 9 8H1z" fill="currentColor" />
      </svg>
      {formatSignedPercent(value, digits)}
    </span>
  );
}
