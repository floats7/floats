import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import type { EligibilityChecks as Checks, PipelineItem } from "@/data/types";
import { AS_OF, addDays, daysBetween } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { EligibilityChecks } from "./EligibilityChecks";
import styles from "./PipelineDetail.module.css";

const CHECK_EXPLANATIONS: Record<keyof Checks, { title: string; body: string }> = {
  tokenLive: { title: "Stock Token is live", body: "The issuer has deployed the token on Robinhood Chain and it can be transferred." },
  priceFeed: { title: "Chainlink price feed", body: "A feed exists for the token, so NAV can be computed and stale prices can be detected." },
  liquidity: { title: "Liquidity depth", body: "The DEX pool is deep enough to trade within the slippage limit, so rebalancing stays cheap." },
};

const ELIGIBILITY_WINDOW_DAYS = 90;

const STAGES = (item: PipelineItem) => [
  { label: "IPO", date: item.ipoDate },
  { label: "Fifth trading day", date: item.entryDate },
  { label: "Eligibility window closes", date: addDays(item.entryDate, ELIGIBILITY_WINDOW_DAYS) },
];

export function PipelineDetail({ item }: { item: PipelineItem }) {
  const daysToEntry = daysBetween(AS_OF, item.entryDate);
  const ready = Object.values(item.checks).every(Boolean);

  return (
    <div className={`container ${styles.page}`}>
      <Reveal className={styles.header}>
        <Link href="/pipeline" className={styles.back}>
          <Icon name="arrow-left" size={14} />
          Pipeline
        </Link>
        <div className={styles.titleRow}>
          <AssetLogo name={item.name} symbol={item.ticker} src={item.logoUrl} size="lg" />
          <div className={styles.identityCopy}>
            <p className="eyebrow">{item.ticker}</p>
            <h1 className={styles.title}>{item.name}</h1>
          </div>
          <StatusChip tone={item.status === "queued" ? "solid" : "outline"}>{item.status}</StatusChip>
        </div>
        <p className={styles.lede}>
          {ready
            ? "All eligibility checks pass. The listing joins the index on its fifth trading day."
            : daysToEntry > 0
              ? `Earliest entry is in ${daysToEntry} days, once every check below passes.`
              : "Past its fifth trading day. Waiting for the remaining checks to pass."}
        </p>
      </Reveal>

      <Reveal delay={0.08} className={styles.block}>
        <h2 className={styles.heading}>Schedule</h2>
        <ol className={styles.stages}>
          {STAGES(item).map((stage) => (
            <li key={stage.label} className={styles.stage}>
              <span className="eyebrow">{stage.label}</span>
              <span className={`${styles.date} tabular`}>{formatDate(stage.date)}</span>
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
        </dl>
      </Reveal>

      <Reveal delay={0.16}>
        <LinkButton href="/methodology" variant="outline">
          Read the entry rules
        </LinkButton>
      </Reveal>
    </div>
  );
}
