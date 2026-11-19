"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { floatApi, type OperationalActionDto } from "@/lib/api-client";
import { resolveSharePriceUsd18 } from "@/lib/nav-history";
import { deriveRebalanceProgress } from "@/lib/rebalance-progress";
import styles from "./ProtocolStatus.module.css";

const SNAPSHOT_BUDGET_SECONDS = 90;

type Health = "healthy" | "attention" | "checking";

export function ProtocolStatus() {
  const { data, loading, error, refresh } = useIndexState();
  const [rebalanceActions, setRebalanceActions] = useState<readonly OperationalActionDto[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [activityAttempt, setActivityAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    floatApi.getOperationalActions("rebalance", 50, controller.signal)
      .then((actions) => {
        if (!controller.signal.aborted) {
          setRebalanceActions(actions);
          setActivityError(false);
        }
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setActivityError(true);
      });
    return () => controller.abort();
  }, [activityAttempt]);

  const status = useMemo(() => deriveStatus(data, loading, error), [data, loading, error]);
  const liveOracles = data?.holdings.filter((holding) => holding.oracleHealth === "live").length ?? 0;
  const oracleTotal = data?.holdings.length ?? 0;
  const snapshotAge = data ? Math.max(0, Math.floor((Date.now() - Date.parse(data.observedAt)) / 1_000)) : null;
  const rebalance = rebalanceActions[0] ?? null;
  const rebalanceProgress = deriveRebalanceProgress(rebalanceActions);

  return (
    <section className={`container ${styles.section}`} aria-labelledby="protocol-status-title">
      <Reveal className={styles.header}>
        <div>
          <p className="eyebrow">Live operations</p>
          <h2 id="protocol-status-title">Protocol status</h2>
          <p className={styles.intro}>Finalized public signals for index freshness, oracle availability, NAV calculation, and the latest indexed rebalance.</p>
        </div>
        <StatusChip tone={status.overall === "healthy" ? "solid" : "outline"}>
          {status.overall === "healthy" ? "Within budget" : status.overall === "checking" ? "Checking" : "Attention"}
        </StatusChip>
      </Reveal>

      <div className={styles.grid}>
        <StatusCard
          title="Indexer snapshot"
          health={status.snapshot}
          value={data ? `Block ${data.blockNumber.toLocaleString("en-US")}` : "Unavailable"}
          detail={snapshotAge === null ? "Waiting for finalized data." : `Observed ${formatAge(snapshotAge)} ago. Budget: ${SNAPSHOT_BUDGET_SECONDS} seconds.`}
        />
        <StatusCard
          title="Oracle coverage"
          health={status.oracles}
          value={oracleTotal > 0 ? `${liveOracles} / ${oracleTotal} live` : "Unavailable"}
          detail="Cash flows fail closed if any active constituent feed is unhealthy."
        />
        <StatusCard
          title="NAV calculation"
          health={status.nav}
          value={data && resolveSharePriceUsd18(data) ? "Available" : "Unavailable"}
          detail="Share price is derived from the latest finalized NAV and total supply snapshot."
        />
        <StatusCard
          title="Latest rebalance"
          health={activityError ? "attention" : rebalance ? "healthy" : "checking"}
          value={rebalance ? humanize(rebalance.action) : activityError ? "Unavailable" : "No indexed action"}
          detail={rebalance
            ? `${rebalanceProgress.executed} of ${rebalanceProgress.authorized} authorized chunks executed. Latest confirmation: block ${rebalance.block_number.toLocaleString("en-US")}.`
            : "Waiting for indexed execution activity."}
        />
      </div>

      {(error || activityError) && (
        <button type="button" className={styles.retry} onClick={() => { refresh(); setActivityAttempt((value) => value + 1); }}>
          Refresh status <Icon name="arrow-right" size={14} />
        </button>
      )}
      <p className={styles.note}>Public monitoring is informational and does not replace transaction simulation. Wallet execution always settles against current onchain state.</p>
    </section>
  );
}
function StatusCard({ title, health, value, detail }: { readonly title: string; readonly health: Health; readonly value: string; readonly detail: string }) {
  return (
    <article className={styles.card} data-health={health}>
      <div className={styles.cardHeader}>
        <h3>{title}</h3>
        <span className={styles.healthIcon} aria-hidden="true"><Icon name={health === "healthy" ? "check" : "info"} size={15} /></span>
      </div>
      <strong className={styles.value}>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function deriveStatus(data: ReturnType<typeof useIndexState>["data"], loading: boolean, error: boolean): { overall: Health; snapshot: Health; oracles: Health; nav: Health } {
  if (loading && !data) return { overall: "checking", snapshot: "checking", oracles: "checking", nav: "checking" };
  if (error || !data) return { overall: "attention", snapshot: "attention", oracles: "attention", nav: "attention" };
  const age = Math.max(0, (Date.now() - Date.parse(data.observedAt)) / 1_000);
  const snapshot: Health = age <= SNAPSHOT_BUDGET_SECONDS ? "healthy" : "attention";
  const oracles: Health = data.holdings.length > 0 && data.holdings.every((holding) => holding.oracleHealth === "live") ? "healthy" : "attention";
  const nav: Health = resolveSharePriceUsd18(data) ? "healthy" : "attention";
  return { overall: snapshot === "healthy" && oracles === "healthy" && nav === "healthy" ? "healthy" : "attention", snapshot, oracles, nav };
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3_600)}h`;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
