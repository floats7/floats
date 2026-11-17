"use client";

import { useSyncExternalStore } from "react";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { isUsMarketOpen } from "@/lib/market-hours";

export type OracleStatus = "live" | "off-hours" | "stale";

const REFRESH_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, REFRESH_MS);
  return () => window.clearInterval(timer);
}

const getClientSnapshot = (): OracleStatus => (isUsMarketOpen(new Date()) ? "live" : "off-hours");

/** Null on the server and during hydration. Staleness arrives with the indexer. */
export function useOracleStatus(): OracleStatus | null {
  const marketStatus = useSyncExternalStore(subscribe, getClientSnapshot, () => null);
  const { data } = useIndexState();
  if (!data || !marketStatus) return null;
  const unhealthy = data.holdings.some((holding) => holding.oracleHealth !== "live");
  return unhealthy ? "stale" : marketStatus;
}
