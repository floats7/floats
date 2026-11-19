"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { RangeChart } from "@/components/charts/RangeChart";
import { floatApi, type MarketCandidateDto, type MarketHistoryPointDto } from "@/lib/api-client";
import { formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import { buildMarketSeries } from "@/features/markets/market-history";
import styles from "./PipelineDetail.module.css";

export function CandidateMarketChart({ item }: { readonly item: MarketCandidateDto }) {
  const [history, setHistory] = useState<readonly MarketHistoryPointDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    floatApi.getMarketCandidateHistory(item.id, 500, controller.signal)
      .then(setHistory)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setHistory([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [item.id]);

  const series = buildMarketSeries(history);
  const latest = history.at(-1);
  const opening = history.at(0);
  return (
    <section className={styles.marketBlock} aria-labelledby="candidate-market-title">
      <div className={styles.marketHeading}>
        <div><p className="eyebrow">Public equity market</p><h2 id="candidate-market-title">{item.symbol} price history</h2></div>
        <strong>{latest ? formatUsd(decimalUnitsToNumber(latest.valueUsd18, 18)) : "Awaiting first trade"}</strong>
      </div>
      {series.ALL.length >= 2 ? <RangeChart seriesByRange={series} /> : (
        <EmptyState
          title="Public trading data is not available yet"
          description="This chart activates automatically after the listing begins and the market-data source publishes valid observations."
        />
      )}
      {loading && <p role="status">Checking public market data…</p>}
      {opening && <p className={styles.marketNote}>{item.symbol} opened at {formatUsd(decimalUnitsToNumber(opening.valueUsd18, 18))} on Nasdaq. Source: Nasdaq public market data.</p>}
      <p className={styles.marketNote}>Reference equity data is informational. Onchain trading remains unavailable until the official Robinhood Stock Token, oracle and executable liquidity route are verified.</p>
    </section>
  );
}
