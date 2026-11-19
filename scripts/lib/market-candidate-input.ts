import { fifthUsTradingDay } from "../../packages/database/src/us-equity-calendar.ts";

const LIFECYCLE_STATUSES = new Set([
  "upcoming", "listing_expected", "listed", "token_pending", "detected",
  "verification_pending", "approval_pending", "rejected", "suspected_fake",
  "token_live", "oracle_pending", "liquidity_pending", "governance_pending",
  "active", "suspended", "removed",
]);
const IPO_STAGES = new Set(["confidential_filed", "public_s1", "roadshow", "priced", "trading", "withdrawn"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseMarketCandidates(input: unknown) {
  if (!Array.isArray(input)) throw new Error("Candidate input must be an array");
  const candidates = input.map(parseCandidate);
  assertUnique(candidates.map((item) => item.id), "candidate id");
  assertUnique(candidates.map((item) => item.symbol), "candidate symbol");
  return candidates;
}

export function parseCandidate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid candidate");
  const row = value as Record<string, unknown>;
  const status = text("status");
  if (!LIFECYCLE_STATUSES.has(status)) throw new Error("Invalid candidate status");
  const sourceUrl = httpsUrl("sourceUrl");
  const logoUrl = httpsUrl("logoUrl");
  const tokenAddress = optionalText("tokenAddress", /^0x[0-9a-fA-F]{40}$/)?.toLowerCase() ?? null;
  const tokenLive = boolean("tokenLive", false);
  const oracleReady = boolean("oracleReady", false);
  const liquidityReady = boolean("liquidityReady", false);
  const governanceApproved = boolean("governanceApproved", false);
  const ipoStage = optionalText("ipoStage");
  if (ipoStage && !IPO_STAGES.has(ipoStage)) throw new Error("Invalid candidate ipoStage");
  const tickerAnnounced = boolean("tickerAnnounced", true);
  const exchange = optionalText("exchange");
  const priceRangeLow = optionalPositiveNumber("priceRangeLow");
  const priceRangeHigh = optionalPositiveNumber("priceRangeHigh");
  const ipoPrice = optionalPositiveNumber("ipoPrice");
  const stageSourceUrl = httpsUrl("stageSourceUrl");
  const stageUpdatedAt = optionalText("stageUpdatedAt");
  const listingDate = optionalText("listingDate", DATE);

  if (stageUpdatedAt && !Number.isFinite(Date.parse(stageUpdatedAt))) throw new Error("Invalid candidate stageUpdatedAt");
  if (ipoStage && (!stageSourceUrl || !stageUpdatedAt)) throw new Error("Candidate IPO stage requires source evidence");
  if (isAtLeastRoadshow(ipoStage)
      && (priceRangeLow === null || priceRangeHigh === null || priceRangeHigh < priceRangeLow)) {
    throw new Error("Candidate roadshow stage requires a valid price range");
  }
  if ((ipoStage === "priced" || ipoStage === "trading") && ipoPrice === null) {
    throw new Error("Candidate priced stage requires ipoPrice");
  }
  if (ipoStage && tickerAnnounced && !exchange) {
    throw new Error("An announced candidate ticker requires an official exchange");
  }
  if (ipoStage === "trading" && (!tickerAnnounced || !exchange || !listingDate)) {
    throw new Error("Candidate trading stage requires announced ticker, exchange and listing date");
  }
  if ((status === "token_live" || tokenLive) && !tokenAddress) throw new Error("A live candidate requires a token address");
  if ((oracleReady || liquidityReady || governanceApproved) && !tokenLive) throw new Error("Candidate readiness requires a live token");

  return {
    id: text("id", /^[a-z0-9-]+$/),
    symbol: text("symbol", /^[A-Z0-9.-]{1,16}$/),
    name: text("name"),
    status,
    ipoDate: optionalText("ipoDate", DATE),
    listingDate,
    eligibleFrom: optionalText("eligibleFrom", DATE) ?? (listingDate ? fifthUsTradingDay(listingDate) : null),
    sourceUrl,
    tokenAddress,
    logoUrl,
    tokenLive,
    oracleReady,
    liquidityReady,
    governanceApproved,
    disabledReason: optionalText("disabledReason"),
    ipoStage,
    tickerAnnounced,
    exchange,
    priceRangeLow,
    priceRangeHigh,
    ipoPrice,
    stageSourceUrl,
    stageUpdatedAt,
    impostorAliases: optionalStrings("impostorAliases", 20),
  };

  function text(key: string, pattern?: RegExp): string {
    const item = row[key];
    if (typeof item !== "string" || !item || (pattern && !pattern.test(item))) throw new Error(`Invalid candidate ${key}`);
    return item;
  }

  function optionalText(key: string, pattern?: RegExp): string | null {
    return row[key] == null ? null : text(key, pattern);
  }

  function httpsUrl(key: string): string | null {
    const value = optionalText(key);
    if (value && new URL(value).protocol !== "https:") throw new Error(`Candidate ${key} must use HTTPS`);
    return value;
  }

  function boolean(key: string, fallback: boolean): boolean {
    const value = row[key];
    if (value == null) return fallback;
    if (typeof value !== "boolean") throw new Error(`Invalid candidate ${key}`);
    return value;
  }

  function optionalPositiveNumber(key: string): number | null {
    const value = row[key];
    if (value == null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid candidate ${key}`);
    return value;
  }

  function optionalStrings(key: string, maximum: number): readonly string[] {
    const values = row[key];
    if (values == null) return [];
    if (!Array.isArray(values) || values.length > maximum
        || values.some((item) => typeof item !== "string" || item.trim().length < 2)) {
      throw new Error(`Invalid candidate ${key}`);
    }
    return [...new Set(values.map((item) => (item as string).trim()))];
  }
}

function isAtLeastRoadshow(stage: string | null): boolean {
  return stage === "roadshow" || stage === "priced" || stage === "trading";
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in candidate input`);
}
