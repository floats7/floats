import type { MarketCandidateDto } from "@/lib/api-client";
import styles from "./PipelineDetail.module.css";

const ORDER: readonly NonNullable<MarketCandidateDto["ipoStage"]>[] = [
  "confidential_filed",
  "public_s1",
  "roadshow",
  "priced",
  "trading",
];
type TimelineStage = NonNullable<MarketCandidateDto["ipoStage"]> | "canonical_stock_token";

const LABELS: Readonly<Record<TimelineStage, string>> = {
  confidential_filed: "Confidential filing",
  public_s1: "Public filing",
  roadshow: "Roadshow and price range",
  priced: "IPO pricing",
  trading: "First public trade",
  withdrawn: "Offering withdrawn",
  canonical_stock_token: "Official Robinhood Stock Token",
};

export function IpoStageTimeline({ item }: { readonly item: MarketCandidateDto }) {
  if (!item.ipoStage) return null;
  const currentIndex = ORDER.indexOf(item.ipoStage);
  const stages: readonly TimelineStage[] = item.ipoStage === "withdrawn"
    ? [...ORDER, "withdrawn"]
    : [...ORDER, "canonical_stock_token"];
  const evidenceStale = item.stageUpdatedAt ? Date.now() - Date.parse(item.stageUpdatedAt) > 7 * 24 * 60 * 60 * 1_000 : false;

  return (
    <section className={styles.ipoTimeline} aria-labelledby="ipo-stage-title">
      <div className={styles.ipoTimelineHeading}>
        <div>
          <p className="eyebrow">Verified IPO lifecycle</p>
          <h2 id="ipo-stage-title" className={styles.heading}>Public milestones</h2>
        </div>
        {item.stageSourceUrl && (
          <a href={item.stageSourceUrl} target="_blank" rel="noreferrer">Primary source</a>
        )}
      </div>
      <ol className={styles.ipoStages}>
        {stages.map((stage, index) => {
          const withdrawn = item.ipoStage === "withdrawn";
          const state = stage === "canonical_stock_token"
            ? item.checks.tokenLive ? "Complete" : "Pending"
            : stage === "withdrawn"
            ? "Current"
            : withdrawn || index < currentIndex
              ? "Complete"
              : index === currentIndex
                ? "Current"
                : "Pending";
          return (
            <li key={stage} className={styles.ipoStage} data-state={state.toLowerCase()}>
              <span className="eyebrow">{state}</span>
              <strong>{LABELS[stage]}</strong>
            </li>
          );
        })}
      </ol>
      {item.stageUpdatedAt && (
        <p className={evidenceStale ? styles.evidenceWarning : styles.marketNote}>
          Stage evidence checked {formatEvidenceTime(item.stageUpdatedAt)}.{evidenceStale ? " Evidence refresh is overdue." : ""}
        </p>
      )}
    </section>
  );
}

function formatEvidenceTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
