"use client";

import Link from "next/link";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatPercent, formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import { marketCandidatePresentationLabel, marketCandidatePublicSymbol } from "@/lib/market-candidate";
import { MarketSparkline } from "./MarketSparkline";
import { useMarkets } from "./useMarkets";
import styles from "./markets.module.css";

export function MarketsView() {
  const { markets, candidates: allCandidates, historyByMarketId, loading, error, refresh } = useMarkets();
  const finalizedAddresses = new Set(markets.map((market) => market.address.toLowerCase()));
  const candidates = allCandidates.filter(
    (candidate) => !candidate.tokenAddress
      || !finalizedAddresses.has(candidate.tokenAddress.toLowerCase()),
  );
  const indexMarkets = markets.filter((market) => market.kind === "index");
  const executableCandidateMarkets = markets.filter((market) => market.kind === "candidate");
  const constituentMarkets = markets.filter((market) => market.kind === "constituent");
  const [newestCandidate, ...remainingCandidates] = [...candidates].sort(compareCandidateRecency);
  return (
    <>
      <PageHeader
        eyebrow="Markets"
        title="One asset flow. Every available product."
        description="Explore the complete recent-IPO Stock Token universe. Finalized markets are transactional; candidates remain visible with their eligibility status."
      />
      <section className={`container ${styles.grid}`} aria-label="Available markets">
        {indexMarkets.map((market) => marketCard(market, allCandidates, historyByMarketId))}
        {executableCandidateMarkets.map((market) => marketCard(market, allCandidates, historyByMarketId))}
        {newestCandidate && candidateCard(newestCandidate, historyByMarketId)}
        {constituentMarkets.map((market) => marketCard(market, allCandidates, historyByMarketId))}
        {remainingCandidates.map((candidate) => candidateCard(candidate, historyByMarketId))}
      </section>
      {loading && <p className="container" role="status">Loading finalized markets…</p>}
      {!loading && error && <p className="container" role="alert">Markets are unavailable. <button type="button" onClick={refresh}>Try again</button></p>}
    </>
  );
}

function marketCard(
  market: import("./types").MarketAsset,
  candidates: readonly import("@/lib/api-client").MarketCandidateDto[],
  histories: Readonly<Record<string, readonly import("@/lib/api-client").MarketHistoryPointDto[]>>,
) {
  const history = preferredMarketHistory(market, candidates, histories);
  return (
    <Link key={market.id} href={`/markets/${encodeURIComponent(market.id)}`} className={styles.card}>
      <div className={styles.identity}>
        <AssetLogo name={market.name} symbol={market.symbol} src={market.kind === "index" ? "/brand/floats-logo.png" : market.logoUrl ?? undefined} size="md" />
        <div><strong>{market.symbol}</strong><span>{market.name}</span></div>
        <StatusChip tone={market.status === "active" ? "solid" : "outline"}>{market.status}</StatusChip>
      </div>
      <div className={styles.price}><span>Reference value</span><strong>{marketReferenceValue(market, history)}</strong></div>
      <MarketSparkline history={history} label={market.name} />
      <dl className={styles.meta}>
        <div><dt>Index weight</dt><dd>{marketWeightLabel(market)}</dd></div>
        <div><dt>Products</dt><dd>{market.products.filter((product) => product.enabled).map((product) => product.label).join(", ") || "View status"}</dd></div>
      </dl>
    </Link>
  );
}

function marketReferenceValue(
  market: import("./types").MarketAsset,
  history: readonly import("@/lib/api-client").MarketHistoryPointDto[] | undefined,
): string {
  if (market.priceUsd18) return formatUsd(decimalUnitsToNumber(market.priceUsd18, 18));
  const latest = history?.at(-1);
  return latest ? formatUsd(decimalUnitsToNumber(latest.valueUsd18, 18)) : "Unavailable";
}

function marketWeightLabel(market: import("./types").MarketAsset): string {
  if (market.kind === "index") return "Index";
  return market.targetWeightBps === null
    ? "Awaiting activation"
    : formatPercent(market.targetWeightBps / 100, 2);
}

function candidateCard(
  candidate: import("@/lib/api-client").MarketCandidateDto,
  histories: Readonly<Record<string, readonly import("@/lib/api-client").MarketHistoryPointDto[]>>,
) {
  return (
    <Link key={candidate.id} href={`/pipeline/${candidate.id}`} className={styles.card}>
      <div className={styles.identity}>
        <AssetLogo name={candidate.name} symbol={marketCandidatePublicSymbol(candidate)} src={candidate.logoUrl ?? undefined} size="md" />
        <div><strong>{marketCandidatePublicSymbol(candidate)}</strong><span>{candidate.name}</span></div>
        <StatusChip tone={candidate.status === "active" ? "solid" : "outline"}>{marketCandidatePresentationLabel(candidate.status, candidate.listingDate, new Date(), candidate.ipoStage)}</StatusChip>
      </div>
      <div className={styles.price}><span>Reference value</span><strong>{candidateReferenceValue(histories[candidate.id])}</strong></div>
      <MarketSparkline history={histories[candidate.id]} label={candidate.name} />
      <dl className={styles.meta}>
        <div><dt>Index weight</dt><dd>Awaiting activation</dd></div>
        <div><dt>Products</dt><dd>View eligibility</dd></div>
      </dl>
    </Link>
  );
}

function compareCandidateRecency(
  left: import("@/lib/api-client").MarketCandidateDto,
  right: import("@/lib/api-client").MarketCandidateDto,
): number {
  const listingDifference = Date.parse(right.listingDate ?? "") - Date.parse(left.listingDate ?? "");
  if (Number.isFinite(listingDifference) && listingDifference !== 0) return listingDifference;
  return right.id.localeCompare(left.id);
}

function candidateReferenceValue(history: readonly import("@/lib/api-client").MarketHistoryPointDto[] | undefined): string {
  const latest = history?.at(-1);
  return latest ? formatUsd(decimalUnitsToNumber(latest.valueUsd18, 18)) : "Not active";
}

function preferredMarketHistory(
  market: import("./types").MarketAsset,
  candidates: readonly import("@/lib/api-client").MarketCandidateDto[],
  histories: Readonly<Record<string, readonly import("@/lib/api-client").MarketHistoryPointDto[]>>,
): readonly import("@/lib/api-client").MarketHistoryPointDto[] | undefined {
  if (market.kind === "index") return histories[market.id];
  const candidate = candidates.find((item) => item.tokenAddress?.toLowerCase() === market.address.toLowerCase())
    ?? candidates.find((item) => item.symbol.toUpperCase() === market.symbol.toUpperCase());
  return candidate ? histories[candidate.id] : histories[market.id];
}
