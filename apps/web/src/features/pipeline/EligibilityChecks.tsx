import type { EligibilityChecks as Checks } from "@/data/types";
import styles from "./EligibilityChecks.module.css";

const LABELS: Record<keyof Checks, string> = {
  tokenLive: "Stock Token live",
  priceFeed: "Chainlink feed",
  liquidity: "Liquidity depth",
};

/** Each check pairs an icon with a text state so meaning never relies on color. */
export function EligibilityChecks({ checks }: { checks: Checks }) {
  return (
    <ul className={styles.list} aria-label="Eligibility checks">
      {(Object.keys(LABELS) as (keyof Checks)[]).map((key) => {
        const passed = checks[key];
        return (
          <li key={key} className={styles.item} data-passed={passed}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              {passed ? (
                <path d="m3 8.5 3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
              )}
            </svg>
            {LABELS[key]}
            <span className="visually-hidden">{passed ? ": ready" : ": pending"}</span>
          </li>
        );
      })}
    </ul>
  );
}
