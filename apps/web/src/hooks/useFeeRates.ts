"use client";

import { useCallback, useEffect, useState } from "react";
import { floatApi, type FeeRatesDto } from "@/lib/api-client";

interface FeeRatesState {
  readonly data: FeeRatesDto | null;
  readonly loading: boolean;
  readonly error: boolean;
  readonly retry: () => void;
}

export function useFeeRates(): FeeRatesState {
  const [data, setData] = useState<FeeRatesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    floatApi.getFeeRates(controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  return { data, loading, error, retry };
}
