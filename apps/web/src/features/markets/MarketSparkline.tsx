import type { MarketHistoryPointDto } from "@/lib/api-client";
import { decimalUnitsToNumber } from "@/lib/units";
import styles from "./markets.module.css";

interface MarketSparklineProps {
  readonly history?: readonly MarketHistoryPointDto[];
  readonly label: string;
}

const WIDTH = 360;
const HEIGHT = 88;

function buildPath(values: readonly number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * WIDTH;
    const y = HEIGHT - ((value - min) / range) * (HEIGHT - 12) - 6;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function MarketSparkline({ history = [], label }: MarketSparklineProps) {
  const points = history.slice(-48);
  const values = points.map((point) => decimalUnitsToNumber(point.valueUsd18, 18));
  const hasSeries = values.length >= 2;
  const rising = hasSeries && (values.at(-1) ?? 0) >= (values[0] ?? 0);

  return (
    <div className={styles.sparkline} data-direction={rising ? "up" : "down"}>
      <div className={styles.sparklineHeader}>
        <span>Market preview</span>
        <span>{hasSeries ? `${points.length} observations` : "Awaiting price history"}</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${label} market preview`}>
        <path className={styles.sparklineBaseline} d={`M0,${HEIGHT / 2} L${WIDTH},${HEIGHT / 2}`} />
        {hasSeries ? (
          <path className={styles.sparklinePath} d={buildPath(values)} />
        ) : (
          <path className={styles.sparklinePending} d={`M0,${HEIGHT * 0.62} C70,${HEIGHT * 0.62} 92,${HEIGHT * 0.38} 160,${HEIGHT * 0.5} S280,${HEIGHT * 0.5} ${WIDTH},${HEIGHT * 0.5}`} />
        )}
      </svg>
    </div>
  );
}
