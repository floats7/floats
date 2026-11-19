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
  ipoStage?: import("./api-client").MarketCandidateDto["ipoStage"],
): string {
  if (ipoStage === "confidential_filed") return "Filed · no date";
  if (ipoStage === "public_s1") return "Public filing";
  if (ipoStage === "roadshow") return "Roadshow";
  if (ipoStage === "priced") return "Priced";
  if (ipoStage === "withdrawn") return "Withdrawn";
  if (status === "listing_expected" && isDebutingToday(listingDate, now)) return "Debuts today";
  return marketCandidateStatusLabel(status);
}

export function marketCandidatePublicSymbol(item: Pick<import("./api-client").MarketCandidateDto, "symbol" | "tickerAnnounced">): string {
  return item.tickerAnnounced === false ? "Ticker TBA" : item.symbol;
}
