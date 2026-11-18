import type { OptionsSeriesDto } from "@/lib/api-client";
import { maximumOptionPayoffUsd18, optionPayoffUsd18 } from "@/lib/options-payoff";
import styles from "./PayoffChart.module.css";

const WIDTH = 360;
const HEIGHT = 150;
const PADDING = 18;

export function PayoffChart({ series }: { series: OptionsSeriesDto }) {
  const terms = {
    kind: series.kind === "0" ? "capped-call" as const : "put" as const,
    strikeUsd18: BigInt(series.strikeUsd18),
    capUsd18: BigInt(series.capUsd18),
    contractSize18: BigInt(series.contractSize18),
  };
  const maximumSpot = terms.kind === "capped-call"
    ? terms.capUsd18 * 3n / 2n
    : terms.strikeUsd18 * 2n;
  const maximumPayoff = maximumOptionPayoffUsd18(terms);
  const points = Array.from({ length: 25 }, (_, index) => {
    const spot = maximumSpot * BigInt(index) / 24n;
    const payoff = optionPayoffUsd18(terms, spot);
    const x = PADDING + (WIDTH - PADDING * 2) * index / 24;
    const y = HEIGHT - PADDING - Number(payoff * 1_000_000n / maximumPayoff) / 1_000_000 * (HEIGHT - PADDING * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const strikeX = PADDING + Number(terms.strikeUsd18 * 1_000_000n / maximumSpot) / 1_000_000 * (WIDTH - PADDING * 2);

  return (
    <figure className={styles.figure} aria-label="Option payoff at expiry">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`payoff-${series.seriesId}`}>
        <title id={`payoff-${series.seriesId}`}>Payoff at expiry before premium</title>
        <line className={styles.axis} x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} />
        <line className={styles.marker} x1={strikeX} y1={PADDING} x2={strikeX} y2={HEIGHT - PADDING} />
        <polyline className={styles.payoff} points={points.join(" ")} />
      </svg>
      <figcaption>Expiry payoff before premium. The vertical marker is the strike.</figcaption>
    </figure>
  );
}
