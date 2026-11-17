import { FEES } from "./index-stats";

export interface Rule {
  title: string;
  headline: string;
  body: string;
}

export const RULES: readonly Rule[] = [
  { title: "Universe", headline: "Only fresh listings qualify.", body: "Stock Tokens on Robinhood Chain whose underlying company listed on a US exchange through an IPO." },
  { title: "Entry", headline: "In on the fifth trading day.", body: "A listing joins on its fifth trading day. The token must be live, have a Chainlink feed, and clear a liquidity depth floor. Eligibility is re-checked daily for up to 90 days." },
  { title: "Exit", headline: "Out after twenty-four months.", body: "Constituents leave 24 months after their IPO date. A feed outage beyond 72 hours, an issuer pause, or a delisting forces an earlier exit." },
  { title: "Weights", headline: "Sized by market cap, capped.", body: "Market-cap weighted, capped at the larger of 10% or 1/N per constituent. Excess weight is redistributed pro rata." },
  { title: "Rebalance", headline: "Quarterly, by rule.", body: "Quarterly on the third Friday of March, June, September and December. Large listings can fast-enter, and drift above 5% allows a partial rebalance." },
  { title: "Oracle", headline: "Prices checked, or trading pauses.", body: "NAV reads Chainlink prices. If a feed goes stale, cash mint and redeem pause automatically while in-kind stays open." },
];

export const FEE_ROWS: readonly { label: string; value: string; note: string }[] = [
  { label: "Management fee", value: `${FEES.managementRate}% / year`, note: "Streams per second through share dilution." },
  { label: "Cash mint & redeem", value: `${FEES.cashRate}%`, note: "Charged on each cash mint or redeem." },
  { label: "In-kind mint & redeem", value: `${FEES.inKindRate}%`, note: "No swaps, so the fee is lower." },
  { label: "Off-hours surcharge", value: `+${FEES.offHoursSurcharge}%`, note: "Applies to cash flows outside US market hours." },
];

