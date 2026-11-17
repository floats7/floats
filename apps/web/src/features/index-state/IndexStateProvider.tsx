"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { floatApi, type AssetDto, type IndexStateDto, type NavHistoryPointDto } from "@/lib/api-client";

const REFRESH_INTERVAL_MS = 30_000;

interface IndexStateContextValue {
  readonly data: IndexStateDto | null;
  readonly assets: readonly AssetDto[];
  readonly navHistory: readonly NavHistoryPointDto[];
  readonly loading: boolean;
  readonly error: boolean;
  readonly refresh: () => void;
}

const IndexStateContext = createContext<IndexStateContextValue | undefined>(undefined);

export function IndexStateProvider({ children }: { readonly children: ReactNode }) {
  const [data, setData] = useState<IndexStateDto | null>(null);
  const [assets, setAssets] = useState<readonly AssetDto[]>([]);
  const [navHistory, setNavHistory] = useState<readonly NavHistoryPointDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [next, nextAssets, nextHistory] = await Promise.all([
          floatApi.getIndexState(controller.signal),
          floatApi.getAssets(controller.signal),
          floatApi.getNavHistory(500, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setData(next);
          setAssets(nextAssets);
          setNavHistory(nextHistory);
          setError(false);
        }
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [attempt]);

  const value = useMemo(
    () => ({ data, assets, navHistory, loading, error, refresh }),
    [data, assets, navHistory, loading, error, refresh],
  );
  return <IndexStateContext.Provider value={value}>{children}</IndexStateContext.Provider>;
}

export function useIndexState(): IndexStateContextValue {
  const context = useContext(IndexStateContext);
  if (!context) throw new Error("useIndexState must be used within IndexStateProvider");
  return context;
}
