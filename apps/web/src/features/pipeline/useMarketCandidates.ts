"use client";

import { useCallback, useEffect, useState } from "react";
import { floatApi, type MarketCandidateDto } from "@/lib/api-client";

export function useMarketCandidates() {
  const [candidates, setCandidates] = useState<readonly MarketCandidateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    floatApi.getMarketCandidates(controller.signal)
      .then(setCandidates)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return { candidates, loading, error, refresh: useCallback(() => setAttempt((value) => value + 1), []) };
}
