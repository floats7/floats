import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import type { EligibilityChecks as Checks } from "@/data/types";
import type { MarketCandidateDto, MarketCandidateReadinessDto } from "@/lib/api-client";
import { addDays } from "@/lib/dates";
import { formatDate, formatMonthDay } from "@/lib/format";
import { marketCandidatePresentationLabel } from "@/lib/market-candidate";
import { isDebutingToday } from "@/lib/us-market-clock";
import { EligibilityChecks } from "./EligibilityChecks";
import { CandidateMarketChart } from "./CandidateMarketChart";
import { CandidateContractIdentity } from "./CandidateContractIdentity";
import { ListingCountdown } from "./ListingCountdown";
import { TradingCapabilities } from "./TradingCapabilities";
import styles from "./PipelineDetail.module.css";

const CHECK_EXPLANATIONS: Record<keyof Checks, { title: string; body: string }> = {
  tokenLive: { title: "Stock Token is live", body: "The issuer has deployed the token on Robinhood Chain and it can be transferred." },
  priceFeed: { title: "Chainlink price feed", body: "A feed exists for the token, so NAV can be computed and stale prices can be detected." },
  liquidity: { title: "Liquidity depth", body: "The DEX pool is deep enough to trade within the slippage limit, so rebalancing stays cheap." },
};

const ELIGIBILITY_WINDOW_DAYS = 90;

const STAGES = (item: MarketCandidateDto) => [
  { label: "IPO", date: item.ipoDate ?? item.listingDate },
  { label: "Fifth trading day", date: item.eligibleFrom },
  { label: "Eligibility window closes", date: item.eligibleFrom ? addDays(item.eligibleFrom, ELIGIBILITY_WINDOW_DAYS) : null },
];

export function PipelineDetail({ item, readiness }: { item: MarketCandidateDto; readiness: MarketCandidateReadinessDto | null }) {
  const ready = Object.values(item.checks).every(Boolean);
  const debutsToday = isDebutingToday(item.listingDate);

  return (
    <div className={`container ${styles.page}`}>
      <Reveal className={styles.header}>
        <Link href="/pipeline" className={styles.back}>
          <Icon name="arrow-left" size={14} />
          Pipeline
        </Link>
        <div className={styles.titleRow}>
          <AssetLogo name={item.name} symbol={item.symbol} src={item.logoUrl ?? undefined} size="lg" />
          <div className={styles.identityCopy}>
            <p className="eyebrow">{item.symbol}</p>
            <h1 className={styles.title}>{item.name}</h1>
          </div>
          <StatusChip tone={item.status === "active" ? "solid" : "outline"}>{marketCandidatePresentationLabel(item.status, item.listingDate)}</StatusChip>
        </div>
        <p className={styles.lede}>
          {ready
            ? item.governanceApproved
              ? "The index governance change is confirmed onchain."
              : "Market checks pass. Index inclusion still requires fifth-trading-day eligibility and confirmed onchain governance execution."
            : item.eligibleFrom
              ? `No earlier than ${formatMonthDay(item.eligibleFrom)}, once every check below passes.`
              : "Past its fifth trading day. Waiting for the remaining checks to pass."}
        </p>
      </Reveal>

      {item.tokenAddress && <CandidateContractIdentity address={item.tokenAddress} />}

      {debutsToday && item.listingDate && (
        <Reveal className={styles.launchNotice}>
          <div>
            <p className="eyebrow">Listing watch active</p>
            <strong>{item.symbol} debuts on Nasdaq today</strong>
          </div>
          <ListingCountdown listingDate={item.listingDate} />
          <p>First-day prices may move sharply. Public-equity data is informational; onchain actions remain gated by canonical token, oracle, and liquidity verification.</p>
        </Reveal>
      )}

      <Reveal delay={0.06} className={styles.block}>
        <CandidateMarketChart item={item} />
      </Reveal>

      <Reveal delay={0.08} className={styles.block}>
        <h2 className={styles.heading}>Schedule</h2>
        <ol className={styles.stages}>
          {STAGES(item).map((stage) => (
            <li key={stage.label} className={styles.stage}>
              <span className="eyebrow">{stage.label}</span>
              <span className={`${styles.date} tabular`}>{stage.date ? formatDate(stage.date) : "TBA"}</span>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal delay={0.12} className={styles.block}>
        <h2 className={styles.heading}>Eligibility</h2>
        <EligibilityChecks checks={item.checks} />
        <dl className={styles.explain}>
          {(Object.keys(CHECK_EXPLANATIONS) as (keyof Checks)[]).map((key) => (
            <div key={key} className={styles.row}>
              <dt>{CHECK_EXPLANATIONS[key].title}</dt>
              <dd>{CHECK_EXPLANATIONS[key].body}</dd>
            </div>
          ))}
          <div className={styles.row}>
            <dt>Options oracle readiness</dt>
            <dd>{oracleReadiness(item)}</dd>
          </div>
          {item.oracle.feedAddress && (
            <div className={styles.row}>
              <dt>Official feed</dt>
              <dd className="tabular">{item.oracle.feedAddress}</dd>
            </div>
          )}
        </dl>
      </Reveal>

      <Reveal delay={0.14} className={styles.block}>
        <TradingCapabilities item={item} />
      </Reveal>

      {readiness && readiness.signoffs.length > 0 && (
        <Reveal delay={0.15} className={styles.block}>
          <div>
            <p className="eyebrow">Public audit record</p>
            <h2 className={styles.heading}>Operator sign-offs</h2>
          </div>
          <div className={styles.signoffTable} role="table" aria-label="Operator sign-offs">
            <div className={styles.signoffHeader} role="row">
              <span role="columnheader">Tier</span>
              <span role="columnheader">Decision</span>
              <span role="columnheader">Reference</span>
              <span role="columnheader">Signed</span>
            </div>
            {readiness.signoffs.map((signoff) => (
              <div className={styles.signoffRow} role="row" key={signoff.id}>
                <span role="cell">{signoff.tier}</span>
                <span role="cell"><StatusChip tone={signoff.decision === "approved" ? "solid" : "outline"}>{signoff.decision}</StatusChip></span>
                <span role="cell" className="tabular">{signoff.governanceOrCanaryReference ?? "Not applicable"}</span>
                <time role="cell" dateTime={signoff.signedAt}>{formatDateTime(signoff.signedAt)}</time>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.16}>
        <LinkButton href="/methodology" variant="outline">
          Read the entry rules
        </LinkButton>
      </Reveal>
    </div>
  );
}

function oracleReadiness(item: MarketCandidateDto): string {
  if (item.checks.priceFeed) {
    return item.oracle.healthySince
      ? `Healthy continuously since ${formatDateTime(item.oracle.healthySince)}.`
      : "Official feed is healthy.";
  }
  const messages: Record<string, string> = {
    FEED_CODE_MISSING: "The configured feed contract is not deployed.",
    FEED_ROUND_INVALID: "The latest feed round is incomplete or invalid.",
    FEED_ANSWER_INVALID: "The latest feed price is not positive.",
    FEED_TIMESTAMP_INVALID: "The latest feed timestamp is invalid.",
    FEED_STALE: "The latest feed observation is stale.",
    FEED_DEVIATION_EXCEEDED: "The latest feed move exceeds the launch safety threshold.",
  };
  return item.oracle.lastFailure
    ? (messages[item.oracle.lastFailure] ?? "Official feed verification has not passed.")
    : "Waiting for 30 minutes of continuous healthy official feed observations.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}
