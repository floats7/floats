"use client";

import { useCallback, useEffect, useState } from "react";
import { floatApi } from "@/lib/api-client";
import type { MarketAsset } from "./types";
import type { MarketCandidateDto, MarketHistoryPointDto } from "@/lib/api-client";

interface MarketState {
  readonly markets: readonly MarketAsset[];
  readonly candidates: readonly MarketCandidateDto[];
  readonly historyByMarketId: Readonly<Record<string, readonly MarketHistoryPointDto[]>>;
  readonly loading: boolean;
  readonly error: boolean;
  readonly refresh: () => void;
}

export function useMarkets(): MarketState {
  const [markets, setMarkets] = useState<readonly MarketAsset[]>([]);
  const [candidates, setCandidates] = useState<readonly MarketCandidateDto[]>([]);
  const [historyByMarketId, setHistoryByMarketId] = useState<Readonly<Record<string, readonly MarketHistoryPointDto[]>>>({});
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setMarketError(false);
    setMarketLoading(true);
    Promise.all([floatApi.getMarkets(controller.signal), floatApi.getMarketCandidates(controller.signal)]).then(async ([nextMarkets, nextCandidates]) => {
      setMarkets(nextMarkets);
      setCandidates(nextCandidates);
      const marketHistories = nextMarkets.map(async (market) => {
        try {
          return [market.id, await floatApi.getMarketHistory(market.id, 500, controller.signal)] as const;
        } catch (reason: unknown) {
          if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
          return [market.id, []] as const;
        }
      });
      const candidateHistories = nextCandidates.map(async (candidate) => {
        try {
          return [candidate.id, await floatApi.getMarketCandidateHistory(candidate.id, 500, controller.signal)] as const;
        } catch (reason: unknown) {
          if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
          return [candidate.id, []] as const;
        }
      });
      const histories = await Promise.all([...marketHistories, ...candidateHistories]);
      if (!controller.signal.aborted) setHistoryByMarketId(Object.fromEntries(histories));
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setMarketError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setMarketLoading(false);
    });
    return () => controller.abort();
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
