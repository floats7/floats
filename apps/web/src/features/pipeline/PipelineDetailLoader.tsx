"use client";

import { useEffect, useState } from "react";
import { PipelineDetail } from "./PipelineDetail";
import { useMarketCandidates } from "./useMarketCandidates";
import { floatApi, type MarketCandidateReadinessDto } from "@/lib/api-client";

export function PipelineDetailLoader({ id }: { readonly id: string }) {
  const { candidates, loading, error, refresh } = useMarketCandidates();
  const [readiness, setReadiness] = useState<MarketCandidateReadinessDto | null>(null);
  const item = candidates.find((candidate) => candidate.id === id);
  useEffect(() => {
    const controller = new AbortController();
    void floatApi.getMarketCandidateReadiness(id, controller.signal)
      .then(setReadiness)
      .catch(() => setReadiness(null));
    return () => controller.abort();
  }, [id]);
  if (loading) return <p className="container" role="status">Loading candidate…</p>;
  if (error) return <p className="container" role="alert">Candidate unavailable. <button type="button" onClick={refresh}>Try again</button></p>;
  if (!item) return <p className="container">Candidate not found.</p>;
  return <PipelineDetail item={item} readiness={readiness} />;
}
