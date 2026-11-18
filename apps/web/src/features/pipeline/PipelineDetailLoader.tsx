"use client";

import { PipelineDetail } from "./PipelineDetail";
import { useMarketCandidates } from "./useMarketCandidates";

export function PipelineDetailLoader({ id }: { readonly id: string }) {
  const { candidates, loading, error, refresh } = useMarketCandidates();
  const item = candidates.find((candidate) => candidate.id === id);
  if (loading) return <p className="container" role="status">Loading candidate…</p>;
  if (error) return <p className="container" role="alert">Candidate unavailable. <button type="button" onClick={refresh}>Try again</button></p>;
  if (!item) return <p className="container">Candidate not found.</p>;
  return <PipelineDetail item={item} />;
}
