"use client";

import type { MarketCandidateDto, TradingCapabilityState } from "@/lib/api-client";
import { currentPublicEquitySession } from "@/lib/us-market-clock";
import styles from "./PipelineDetail.module.css";

const LABELS = { market: "Market", extended: "Extended", overnight: "Overnight" } as const;

export function TradingCapabilities({ item }: { readonly item: MarketCandidateDto }) {
  const active = currentPublicEquitySession();
  return (
    <section className={styles.capabilities} aria-labelledby="trading-capabilities-title">
      <div>
        <p className="eyebrow">Official trading capabilities</p>
        <h2 id="trading-capabilities-title" className={styles.heading}>Public-equity sessions</h2>
      </div>
      <dl>
        {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((session) => (
          <div key={session}>
            <dt>{LABELS[session]}{active === session ? " · Current session" : ""}</dt>
            <dd>{capabilityLabel(item.tradingCapabilities[session])}</dd>
          </div>
        ))}
      </dl>
      {active === "closed" && <p>US public-equity markets are closed. Onchain availability remains subject to the official capability and protocol gates.</p>}
      {item.tradingHalted === true && <p role="alert">Official market data reports that trading is halted. Executable actions must remain unavailable.</p>}
      {item.officialMetadataObservedAt && <p className="tabular">Metadata observed {new Date(item.officialMetadataObservedAt).toLocaleString("en-US")}</p>}
    </section>
  );
}

function capabilityLabel(state: TradingCapabilityState): string {
  if (state === "tradable") return "Tradable";
  if (state === "restricted") return "Restricted";
  if (state === "unavailable") return "Unavailable";
  return "Awaiting official metadata";
}
