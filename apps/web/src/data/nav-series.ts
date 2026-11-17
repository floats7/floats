import { buildRangeSeries, changeOver } from "./series";
import type { NavRange } from "./types";

const INCEPTION_NAV = 100;

export const NAV_SERIES = buildRangeSeries({ seed: 20261117, start: INCEPTION_NAV, drift: 0.0011, volatility: 0.011 });

export const CURRENT_NAV = NAV_SERIES.ALL.at(-1)?.value ?? INCEPTION_NAV;

export const rangeChange = (range: NavRange): number => changeOver(NAV_SERIES[range]);
