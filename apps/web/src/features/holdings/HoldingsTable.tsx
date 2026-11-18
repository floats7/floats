"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { formatDate, formatPercent } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import styles from "./HoldingsTable.module.css";

type SortKey = "symbol" | "actualWeight" | "targetWeight" | "eligibleFrom";
type SortDirection = "ascending" | "descending";

const COLUMNS: readonly { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "symbol", label: "Token", numeric: false },
  { key: "eligibleFrom", label: "Eligible from", numeric: false },
  { key: "actualWeight", label: "Actual weight", numeric: true },
  { key: "targetWeight", label: "Target weight", numeric: true },
];

interface HoldingRow {
  readonly tokenAddress: string;
  readonly symbol: string;
  readonly actualWeight: number;
  readonly targetWeight: number;
  readonly eligibleFrom: number;
  readonly exitAfter: number;
  readonly registryStatus: "none" | "active" | "removed";
  readonly oracleHealth: string | null;
}

function compare(a: HoldingRow, b: HoldingRow, key: SortKey): number {
  return a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
}

export function HoldingsTable() {
  const { data, assets, loading, error, refresh } = useIndexState();
  const [sortKey, setSortKey] = useState<SortKey>("actualWeight");
  const [direction, setDirection] = useState<SortDirection>("descending");

  const rows = useMemo(() => {
    const total = data?.holdings.reduce((sum, item) => sum + BigInt(item.valueUsd18 ?? "0"), 0n) ?? 0n;
    const holdingByAddress = new Map(data?.holdings.map((item) => [item.tokenAddress.toLowerCase(), item]));
    const joined: HoldingRow[] = assets.map((asset) => {
      const holding = holdingByAddress.get(asset.tokenAddress.toLowerCase());
      const value = BigInt(holding?.valueUsd18 ?? "0");
      return {
        tokenAddress: asset.tokenAddress,
        symbol: asset.symbol,
        actualWeight: total === 0n ? 0 : Number(value * 10_000n / total) / 100,
        targetWeight: asset.targetWeightBps / 100,
        eligibleFrom: asset.eligibleFrom,
        exitAfter: asset.exitAfter,
        registryStatus: asset.registryStatus,
        oracleHealth: holding?.oracleHealth ?? null,
      };
    });
    const sorted = joined.sort((a, b) => compare(a, b, sortKey));
    return direction === "ascending" ? sorted : sorted.reverse();
  }, [assets, data, sortKey, direction]);

  const sortBy = (key: SortKey) => {
    const flip = key === sortKey && direction === "descending";
    setSortKey(key);
    setDirection(flip ? "ascending" : "descending");
  };

  return (
    <Reveal className={`container ${styles.wrapper}`}>
      <div className={styles.scroller} role="region" aria-label="Index constituents" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  data-numeric={column.numeric}
                  aria-sort={column.key === sortKey ? direction : "none"}
                >
                  <button type="button" className={styles.sort} onClick={() => sortBy(column.key)}>
                    {column.label}
                    <span aria-hidden="true" className={styles.caret} data-active={column.key === sortKey} data-direction={direction}>
                      <Icon name="arrow-down" size={12} />
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col">Registry</th>
              <th scope="col">Oracle</th>
              <th scope="col">Exit after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <motion.tr key={item.tokenAddress} layout transition={SPRING.soft}>
                <th scope="row" className={styles.company}>
                  <Link href={`/markets/${encodeURIComponent(item.tokenAddress.toLowerCase())}`} className={styles.rowLink}>
                    <span className={styles.ticker}>{item.symbol}</span>
                    <span className={styles.name}>{item.tokenAddress.slice(0, 6)}…{item.tokenAddress.slice(-4)}</span>
                  </Link>
                </th>
                <td className="tabular">{formatTimestamp(item.eligibleFrom)}</td>
                <td data-numeric="true" className="tabular">{formatPercent(item.actualWeight, 1)}</td>
                <td data-numeric="true" className="tabular">{formatPercent(item.targetWeight, 1)}</td>
                <td><StatusChip tone={item.registryStatus === "active" ? "solid" : "muted"}>{item.registryStatus}</StatusChip></td>
                <td><StatusChip tone={item.oracleHealth === "live" ? "solid" : "outline"}>{item.oracleHealth ?? "unknown"}</StatusChip></td>
                <td className="tabular">{formatTimestamp(item.exitAfter)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <p role="status">Loading finalized holdings…</p>}
      {!loading && error && <p role="alert">Holdings unavailable. <button type="button" onClick={refresh}>Try again</button></p>}
      {!loading && !error && rows.length === 0 && <p>No active indexed holdings yet.</p>}
    </Reveal>
  );
}

function formatTimestamp(timestamp: number): string {
  return formatDate(new Date(timestamp * 1_000).toISOString().slice(0, 10));
}
