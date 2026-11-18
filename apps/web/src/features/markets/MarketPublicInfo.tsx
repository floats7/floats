"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { floatApi, type PublicActivityDto } from "@/lib/api-client";
import { formatUnits } from "@/lib/units";
import styles from "./MarketPublicInfo.module.css";

interface MarketPublicInfoProps {
  readonly kind: "index" | "constituent";
  readonly symbol: string;
  readonly spotEnabled?: boolean;
  readonly embedded?: boolean;
}

export function MarketPublicInfo({ kind, symbol, spotEnabled = false, embedded = false }: MarketPublicInfoProps) {
  const [actions, setActions] = useState<readonly PublicActivityDto[]>([]);
  const [explorerUrl, setExplorerUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    Promise.all([
      floatApi.getPublicActivity(25, controller.signal),
      floatApi.getPublicConfig(controller.signal),
    ]).then(([nextActions, config]) => {
      if (!controller.signal.aborted) {
        setActions(nextActions);
        setExplorerUrl(config.blockExplorerUrl.replace(/\/$/, ""));
      }
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section className={`${embedded ? styles.embedded : "container"} ${styles.section}`} aria-labelledby="public-market-data-title">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">Public market data</p>
          <h2 id="public-market-data-title">How this market executes</h2>
        </div>
        <StatusChip tone="muted">Onchain indexed</StatusChip>
      </div>

      <div className={styles.structure}>
        <MarketFact
          title="Execution"
          value={kind === "index" ? "NAV-based" : spotEnabled ? "Uniswap V3" : "Reference asset"}
          detail={kind === "index" ? "Buy and Sell settle through the fIPO vault at finalized NAV." : spotEnabled ? `${symbol} Buy and Sell execute through an approved USDG pool with a wallet-defined recipient.` : `${symbol} is available as an options underlying without an approved direct spot route.`}
        />
        <MarketFact
          title="Order book"
          value={spotEnabled ? "AMM liquidity" : "Not applicable"}
          detail={kind === "index" ? "The vault uses mint/redeem settlement rather than resting limit orders." : spotEnabled ? "Execution uses the approved onchain pool rather than a Floats-operated limit-order book." : "No direct spot order route is enabled for this constituent."}
        />
        <MarketFact
          title="Settlement"
          value={kind === "index" ? "Cash or in-kind" : spotEnabled ? "Token delivery" : "Options in USDG"}
          detail={kind === "index" ? "Cash uses USDG. In-kind selling transfers proportional vault assets." : spotEnabled ? `Spot output is delivered directly to the connected wallet. ${symbol} options remain USDG cash-settled.` : "Available option series are cash-settled; the underlying Stock Token is not delivered."}
        />
      </div>

      <div className={styles.activityHeader}>
        <div>
          <p className="eyebrow">Recent activity</p>
          <h3>Onchain trades and positions</h3>
        </div>
        <p>Confirmed Buy, Sell, Options and liquidity activity from public onchain events.</p>
      </div>

      {loading && <p className={styles.state} role="status">Loading finalized activity…</p>}
      {!loading && error && <p className={styles.state} role="alert">Activity is temporarily unavailable. <button type="button" onClick={retry}>Try again</button></p>}
      {!loading && !error && actions.length === 0 && <p className={styles.state}>No indexed user activity yet.</p>}
      {!loading && !error && actions.length > 0 && (
        <ul className={styles.activityList}>
          {actions.map((action) => (
            <li key={`${action.transactionHash}:${action.action}`}>
              <div>
                <strong>{activityLabel(action.action)}</strong>
                <span>{shortAddress(action.walletAddress)} · {formatTimestamp(action.observedAt)}</span>
              </div>
              <span className="tabular">{activityAmount(action)}</span>
              <a href={`${explorerUrl}/tx/${action.transactionHash}`} target="_blank" rel="noreferrer">
                Explorer <Icon name="external-link" size={13} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MarketFact({ title, value, detail }: { readonly title: string; readonly value: string; readonly detail: string }) {
  return <article><span>{title}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function activityLabel(value: string): string {
  const labels: Record<string, string> = { cash_mint: "Deposit / Buy fIPO", cash_redeem: "Sell fIPO", in_kind_redeem: "Sell fIPO in-kind", OptionBought: "Buy option", OptionSoldBack: "Sell option", OptionClaimed: "Claim option", WithdrawalRequested: "Request Earn withdrawal", WithdrawalCancelled: "Cancel Earn withdrawal", WithdrawalFinalized: "Finalize Earn withdrawal", WithdrawalClaimed: "Claim Earn withdrawal" };
  return labels[value] ?? value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function activityAmount(action: PublicActivityDto): string {
  if (action.assetAmount) return `${formatUnits(action.assetAmount, 6, 4)} USDG`;
  if (action.shareAmount) return `${formatUnits(action.shareAmount, 18, 4)} units`;
  return action.blockNumber === null ? "Confirmed" : `Block ${action.blockNumber.toLocaleString("en-US")}`;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date(value));
}
