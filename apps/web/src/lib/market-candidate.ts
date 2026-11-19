import type { MarketCandidateStatus } from "./api-client";
import { isDebutingToday } from "./us-market-clock";

const STATUS_LABELS: Readonly<Record<MarketCandidateStatus, string>> = {
  upcoming: "Upcoming",
  listing_expected: "Listing expected",
  listed: "Listed",
  token_pending: "Token pending",
  detected: "Detected",
  verification_pending: "Verification pending",
  approval_pending: "Approval pending",
  rejected: "Rejected",
  suspected_fake: "Suspected fake",
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

export function marketCandidatePresentationLabel(
  status: MarketCandidateStatus,
  listingDate: string | null,
  now = new Date(),
): string {
  if (status === "listing_expected" && isDebutingToday(listingDate, now)) return "Debuts today";
  return marketCandidateStatusLabel(status);
}
