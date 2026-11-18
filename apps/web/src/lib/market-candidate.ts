import type { MarketCandidateStatus } from "./api-client";

const STATUS_LABELS: Readonly<Record<MarketCandidateStatus, string>> = {
  upcoming: "Upcoming",
  listing_expected: "Listing expected",
  listed: "Listed",
  token_pending: "Token pending",
  token_live: "Token live",
  oracle_pending: "Oracle pending",
  liquidity_pending: "Liquidity pending",
  governance_pending: "Governance pending",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

export function marketCandidateStatusLabel(status: MarketCandidateStatus): string {
  return STATUS_LABELS[status];
}
