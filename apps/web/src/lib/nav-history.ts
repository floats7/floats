import type { NavHistoryPointDto } from "@/lib/api-client";
import type { NavPoint, NavRange } from "@/data/types";
import { decimalUnitsToNumber } from "@/lib/units";

const RANGE_MS: Readonly<Partial<Record<NavRange, number>>> = {
  "1D": 24 * 60 * 60 * 1_000,
  "1W": 7 * 24 * 60 * 60 * 1_000,
  "1M": 30 * 24 * 60 * 60 * 1_000,
};

export function buildNavSeries(
  history: readonly NavHistoryPointDto[],
): Record<NavRange, readonly NavPoint[]> {
  const valid = history
    .flatMap((point) => {
      const sharePriceUsd18 = resolveSharePriceUsd18(point);
      return sharePriceUsd18 === null ? [] : [{
        timestamp: Date.parse(point.observedAt),
        value: decimalUnitsToNumber(sharePriceUsd18, 18),
      }];
    })
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value))
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = valid.at(-1)?.timestamp ?? 0;

  const pointsFor = (range: NavRange): NavPoint[] => {
    const window = RANGE_MS[range];
    const selected = window === undefined
      ? valid
      : valid.filter((point) => point.timestamp >= latest - window);
    return selected.map((point) => ({
      label: formatLabel(point.timestamp, range),
      value: point.value,
    }));
  };

  return {
    "1D": pointsFor("1D"),
    "1W": pointsFor("1W"),
    "1M": pointsFor("1M"),
    ALL: pointsFor("ALL"),
  };
}

export function resolveSharePriceUsd18(
  point: Pick<NavHistoryPointDto, "navUsd18" | "totalSupply18" | "sharePriceUsd18">,
): string | null {
  const reported = point.sharePriceUsd18 === null ? 0n : BigInt(point.sharePriceUsd18);
  if (reported > 0n) return reported.toString();

  const nav = BigInt(point.navUsd18);
  const supply = BigInt(point.totalSupply18);
  if (nav === 0n || supply === 0n) return null;
  return (nav * 10n ** 18n / supply).toString();
}

function formatLabel(timestamp: number, range: NavRange): string {
  return new Intl.DateTimeFormat("en-US", range === "1D"
    ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }
    : { month: "short", day: "2-digit", timeZone: "UTC" })
    .format(new Date(timestamp));
}
