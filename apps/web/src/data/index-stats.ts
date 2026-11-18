import { CURRENT_NAV } from "./nav-series";

const DEX_DISCOUNT = 0.0012;

export const INDEX_STATS = {
  nav: CURRENT_NAV,
  dexPrice: Number((CURRENT_NAV * (1 - DEX_DISCOUNT)).toFixed(2)),
  tvl: 184_250,
  tvlCap: 250_000,
  constituentCount: 8,
} as const;

export const premiumPercent = ((INDEX_STATS.dexPrice - INDEX_STATS.nav) / INDEX_STATS.nav) * 100;

export const FEES = {
  cashRate: 0.1,
  inKindRate: 0.02,
  managementRate: 0.75,
  maxSlippage: 0.5,
} as const;
