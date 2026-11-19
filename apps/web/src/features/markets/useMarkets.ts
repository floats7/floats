"use client";

import { useCallback, useEffect, useState } from "react";
import { floatApi } from "@/lib/api-client";
import type { MarketAsset } from "./types";
import type { MarketCandidateDto, MarketHistoryPointDto } from "@/lib/api-client";

const MARKET_SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

interface MarketSnapshot {
  readonly markets: readonly MarketAsset[];
  readonly candidates: readonly MarketCandidateDto[];
  readonly historyByMarketId: Readonly<Record<string, readonly MarketHistoryPointDto[]>>;
  readonly loadedAt: number;
}

let cachedSnapshot: MarketSnapshot | undefined;
let pendingSnapshot: Promise<MarketSnapshot> | undefined;

interface MarketState {
  readonly markets: readonly MarketAsset[];
  readonly candidates: readonly MarketCandidateDto[];
  readonly historyByMarketId: Readonly<Record<string, readonly MarketHistoryPointDto[]>>;
  readonly loading: boolean;
  readonly error: boolean;
  readonly refresh: () => void;
}

export function useMarkets(): MarketState {
  const [markets, setMarkets] = useState<readonly MarketAsset[]>(cachedSnapshot?.markets ?? []);
  const [candidates, setCandidates] = useState<readonly MarketCandidateDto[]>(cachedSnapshot?.candidates ?? []);
  const [historyByMarketId, setHistoryByMarketId] = useState<Readonly<Record<string, readonly MarketHistoryPointDto[]>>>(cachedSnapshot?.historyByMarketId ?? {});
  const [marketLoading, setMarketLoading] = useState(cachedSnapshot === undefined);
  const [marketError, setMarketError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const snapshotIsFresh = cachedSnapshot !== undefined
      && Date.now() - cachedSnapshot.loadedAt < MARKET_SNAPSHOT_MAX_AGE_MS;

    if (cachedSnapshot) {
      applySnapshot(cachedSnapshot, setMarkets, setCandidates, setHistoryByMarketId);
      setMarketLoading(false);
    }
    setMarketError(false);
    if (snapshotIsFresh && attempt === 0) return () => { active = false; };
    if (!cachedSnapshot) setMarketLoading(true);

    loadSnapshot(attempt > 0).then((snapshot) => {
      if (active) applySnapshot(snapshot, setMarkets, setCandidates, setHistoryByMarketId);
    }).catch(() => {
      if (active) setMarketError(true);
    }).finally(() => {
      if (active) setMarketLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  return {
    markets,
    candidates,
    historyByMarketId,
    loading: marketLoading,
    error: marketError,
    refresh: useCallback(() => setAttempt((value) => value + 1), []),
  };
}

async function loadSnapshot(force: boolean): Promise<MarketSnapshot> {
  if (!force && pendingSnapshot) return pendingSnapshot;
  const request = fetchSnapshot();
  pendingSnapshot = request;
  try {
    const snapshot = await request;
    cachedSnapshot = snapshot;
    return snapshot;
  } finally {
    if (pendingSnapshot === request) pendingSnapshot = undefined;
  }
}

async function fetchSnapshot(): Promise<MarketSnapshot> {
  const [markets, candidates] = await Promise.all([
    floatApi.getMarkets(),
    floatApi.getMarketCandidates(),
  ]);
  const marketHistories = markets.map((market) => historyEntry(
    market.id,
    () => floatApi.getMarketHistory(market.id, 500),
  ));
  const candidateHistories = candidates.map((candidate) => historyEntry(
    candidate.id,
    () => floatApi.getMarketCandidateHistory(candidate.id, 500),
  ));
  const histories = await Promise.all([...marketHistories, ...candidateHistories]);
  return {
    markets,
    candidates,
    historyByMarketId: Object.fromEntries(histories),
    loadedAt: Date.now(),
  };
}

async function historyEntry(
  id: string,
  request: () => Promise<readonly MarketHistoryPointDto[]>,
): Promise<readonly [string, readonly MarketHistoryPointDto[]]> {
  try {
    return [id, await request()] as const;
  } catch {
    return [id, []] as const;
  }
}

function applySnapshot(
  snapshot: MarketSnapshot,
  setMarkets: (value: readonly MarketAsset[]) => void,
  setCandidates: (value: readonly MarketCandidateDto[]) => void,
  setHistory: (value: Readonly<Record<string, readonly MarketHistoryPointDto[]>>) => void,
): void {
  setMarkets(snapshot.markets);
  setCandidates(snapshot.candidates);
  setHistory(snapshot.historyByMarketId);
}
