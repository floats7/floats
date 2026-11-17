import type { NavPoint, NavRange } from "./types";

export const RANGES: readonly NavRange[] = ["1D", "1W", "1M", "ALL"];

const DAILY_POINTS = 120;
const HOURLY_POINTS = 24;

export interface SeriesConfig {
  seed: number;
  start: number;
  drift: number;
  volatility: number;
  /** When set, the whole series is scaled so it finishes on this value. */
  endValue?: number;
}

/** Deterministic PRNG so simulated series are stable between renders. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function walk(count: number, seed: number, start: number, drift: number, volatility: number): number[] {
  const random = mulberry32(seed);
  let value = start;
  return Array.from({ length: count }, () => {
    value *= 1 + drift + (random() - 0.5) * 2 * volatility;
    return value;
  });
}

const round = (value: number) => Number(value.toFixed(2));

/** Builds one price path and slices it into every chart range. All ranges end on the same value. */
export function buildRangeSeries({ seed, start, drift, volatility, endValue }: SeriesConfig): Record<NavRange, readonly NavPoint[]> {
  const daily = walk(DAILY_POINTS, seed, start, drift, volatility);
  const last = daily.at(-1) ?? start;
  const scale = endValue ? endValue / last : 1;

  const hourly = walk(HOURLY_POINTS, seed + 1, daily.at(-2) ?? start, drift / 8, volatility / 7);
  hourly[hourly.length - 1] = last;

  const dailyPoints: NavPoint[] = daily.map((value, index) => ({ label: `Day ${index + 1}`, value: round(value * scale) }));
  const hourlyPoints: NavPoint[] = hourly.map((value, index) => ({ label: `${String(index).padStart(2, "0")}:00 UTC`, value: round(value * scale) }));

  return { "1D": hourlyPoints, "1W": dailyPoints.slice(-7), "1M": dailyPoints.slice(-30), ALL: dailyPoints };
}

/** Percentage change from the first to the last point. */
export function changeOver(series: readonly NavPoint[]): number {
  const first = series[0]?.value ?? 0;
  const last = series.at(-1)?.value ?? first;
  return first === 0 ? 0 : ((last - first) / first) * 100;
}
