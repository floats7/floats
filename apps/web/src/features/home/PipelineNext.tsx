"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDate } from "@/lib/format";
import { marketCandidatePresentationLabel, marketCandidatePublicSymbol } from "@/lib/market-candidate";
import { useMarketCandidates } from "@/features/pipeline/useMarketCandidates";
import styles from "./PipelineNext.module.css";

const COUNT = 3;

export function PipelineNext() {
  const { candidates } = useMarketCandidates();
  return (
    <div className={styles.block}>
      <h3 className={styles.title}>Next in line</h3>
      <ul className={styles.list}>
        {candidates.slice(0, COUNT).map((item) => (
          <li key={item.id}>
            <Link href={`/pipeline/${item.id}`} className={styles.row}>
              <AssetLogo name={item.name} symbol={marketCandidatePublicSymbol(item)} src={item.logoUrl ?? undefined} size="sm" />
              <span className={styles.name}>{item.name}</span>
              <span className={styles.symbol}>{marketCandidatePublicSymbol(item)}</span>
              <StatusChip tone="muted">{marketCandidatePresentationLabel(item.status, item.listingDate, new Date(), item.ipoStage)}</StatusChip>
              <span className={`${styles.date} tabular`}>{item.eligibleFrom ? `Eligible ${formatDate(item.eligibleFrom)}` : "Eligibility TBA"}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/pipeline" className={styles.more}>
        Full pipeline <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}
