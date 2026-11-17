import { CONSTITUENTS } from "./constituents";
import { buildRangeSeries } from "./series";
import type { Constituent, NavPoint, NavRange } from "./types";

const TREND_WINDOW_DAYS = 120;

const seedFor = (ticker: string) => [...ticker].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);

function buildFor(item: Constituent): Record<NavRange, readonly NavPoint[]> {
  return buildRangeSeries({
    seed: seedFor(item.ticker),
    start: item.price,
    drift: Math.log(1 + item.returnSinceEntry / 100) / TREND_WINDOW_DAYS,
    volatility: 0.018,
    endValue: item.price,
  });
}

const BY_TICKER = new Map(CONSTITUENTS.map((item) => [item.ticker, buildFor(item)]));

export function getPriceSeries(ticker: string): Record<NavRange, readonly NavPoint[]> | undefined {
  return BY_TICKER.get(ticker);
}
