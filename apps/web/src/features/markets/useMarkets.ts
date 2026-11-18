"use client";

import { useCallback, useEffect, useState } from "react";
import { floatApi } from "@/lib/api-client";
import type { MarketAsset } from "./types";

interface MarketState {
  readonly markets: readonly MarketAsset[];
  readonly loading: boolean;
  readonly error: boolean;
  readonly refresh: () => void;
}

export function useMarkets(): MarketState {
  const [markets, setMarkets] = useState<readonly MarketAsset[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setMarketError(false);
    setMarketLoading(true);
    floatApi.getMarkets(controller.signal).then((nextMarkets) => {
      setMarkets(nextMarkets);
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setMarketError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setMarketLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  return {
    markets,
    loading: marketLoading,
    error: marketError,
    refresh: useCallback(() => setAttempt((value) => value + 1), []),
  };
}
