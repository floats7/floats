import type { MarketHistoryPointDto } from "@/lib/api-client";
import type { NavPoint, NavRange } from "@/data/types";
import { decimalUnitsToNumber } from "@/lib/units";

const RANGE_MS: Readonly<Partial<Record<NavRange, number>>> = {
  "1D": 86_400_000,
  "1W": 7 * 86_400_000,
  "1M": 30 * 86_400_000,
};

export function buildMarketSeries(
  history: readonly MarketHistoryPointDto[],
): Record<NavRange, readonly NavPoint[]> {
  const valid = history.map((point) => ({
    timestamp: Date.parse(point.observedAt),
    value: decimalUnitsToNumber(point.valueUsd18, 18),
  })).filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value))
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = valid.at(-1)?.timestamp ?? 0;
  const pointsFor = (range: NavRange): NavPoint[] => {
    const window = RANGE_MS[range];
    return (window ? valid.filter((point) => point.timestamp >= latest - window) : valid)
      .map((point) => ({ label: formatLabel(point.timestamp, range), value: point.value }));
  };
  return { "1D": pointsFor("1D"), "1W": pointsFor("1W"), "1M": pointsFor("1M"), ALL: pointsFor("ALL") };
}

function formatLabel(timestamp: number, range: NavRange): string {
  return new Intl.DateTimeFormat("en-US", range === "1D"
    ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }
    : { month: "short", day: "2-digit", timeZone: "UTC" })
    .format(new Date(timestamp));
}
