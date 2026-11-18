"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { SummaryList, type SummaryRow } from "@/components/ui/SummaryList";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { formatDate, formatPercent, formatUsd } from "@/lib/format";
import { decimalUnitsToNumber } from "@/lib/units";
import styles from "./detail.module.css";

export function ConstituentDetailView({ ticker }: { readonly ticker: string }) {
  const { assets, data, loading, error, refresh } = useIndexState();
  const asset = assets.find((candidate) => candidate.symbol.toUpperCase() === ticker);

  if (loading) return <StateMessage message="Loading finalized constituent state…" />;
  if (error) return <StateMessage message="Constituent state is unavailable." retry={refresh} />;
  if (!asset) return <StateMessage message="This token is not in the indexed registry." />;

  const holding = data?.holdings.find(
    (candidate) => candidate.tokenAddress.toLowerCase() === asset.tokenAddress.toLowerCase(),
  );
  const totalValue = data?.holdings.reduce(
    (sum, candidate) => sum + BigInt(candidate.valueUsd18 ?? "0"),
    0n,
  ) ?? 0n;
  const value = BigInt(holding?.valueUsd18 ?? "0");
  const actualWeight = totalValue === 0n ? 0 : Number(value * 10_000n / totalValue) / 100;
  const rows: SummaryRow[] = [
    { label: "Token address", value: asset.tokenAddress },
    { label: "Asset UID", value: asset.assetUid },
    { label: "Price feed", value: asset.feedAddress ?? "Not configured" },
    { label: "Decimals", value: asset.decimals.toString() },
    { label: "Registry version", value: asset.registryVersion.toString() },
    { label: "Target weight", value: formatPercent(asset.targetWeightBps / 100, 2) },
    { label: "Actual weight", value: formatPercent(actualWeight, 2), strong: true },
    { label: "Eligible from", value: formatTimestamp(asset.eligibleFrom) },
    { label: "Exit after", value: formatTimestamp(asset.exitAfter) },
    { label: "Raw vault balance", value: holding?.rawBalance ?? "0" },
    {
      label: "Normalized price",
      value: holding?.normalizedPriceUsd18
        ? formatUsd(decimalUnitsToNumber(holding.normalizedPriceUsd18, 18))
        : "Unavailable",
    },
    {
      label: "Holding value",
      value: holding?.valueUsd18
        ? formatUsd(decimalUnitsToNumber(holding.valueUsd18, 18))
        : "Unavailable",
      strong: true,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Indexed constituent"
        title={asset.symbol}
        description="Finalized onchain metadata and vault exposure. No issuer name or market-return estimate is inferred."
        aside={(
          <div>
            <StatusChip tone={asset.registryStatus === "active" ? "solid" : "muted"}>
              {asset.registryStatus}
            </StatusChip>{" "}
            <StatusChip tone={holding?.oracleHealth === "live" ? "solid" : "outline"}>
              Oracle: {holding?.oracleHealth ?? "unknown"}
            </StatusChip>
          </div>
        )}
      />
      <Reveal className={`container ${styles.chart}`}>
        <SummaryList rows={rows} />
      </Reveal>
      <nav className="container" aria-label="Holdings navigation">
        <Link href="/holdings">
          <Icon name="arrow-left" size={14} /> Back to all holdings
        </Link>
      </nav>
    </>
  );
}

function StateMessage({ message, retry }: { readonly message: string; readonly retry?: () => void }) {
  return (
    <PageHeader
      eyebrow="Indexed constituent"
      title="Holding details"
      description={message}
      aside={retry ? <button type="button" onClick={retry}>Try again</button> : undefined}
    />
  );
}

function formatTimestamp(timestamp: number): string {
  return formatDate(new Date(timestamp * 1_000).toISOString().slice(0, 10));
}
