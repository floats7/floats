"use client";

import { motion, useScroll, useSpring } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { Icon, Separator } from "@/components/ui/Icon";
import { AssetLogo } from "@/components/ui/AssetLogo";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDate, formatMonthDay } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { marketCandidatePresentationLabel } from "@/lib/market-candidate";
import { EligibilityChecks } from "./EligibilityChecks";
import styles from "./PipelineTimeline.module.css";
import { useMarketCandidates } from "./useMarketCandidates";

function entryCopy(entryDate: string | null): string {
  if (!entryDate) return "Listing schedule is awaiting confirmation";
  return `No earlier than ${formatMonthDay(entryDate)}, subject to all eligibility checks`;
}

/** Vertical timeline whose spine fills as the reader scrolls. */
export function PipelineTimeline() {
  const { candidates, loading, error, refresh } = useMarketCandidates();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const scaleY = useSpring(scrollYProgress, SPRING.soft);

  return (
    <ol ref={ref} className={`container ${styles.timeline}`}>
      <span className={styles.spine} aria-hidden="true">
        <motion.span className={styles.fill} style={{ scaleY }} />
      </span>

      {candidates.map((item) => (
        <li key={item.id} className={styles.entry}>
          <span className={styles.node} aria-hidden="true" />
          <Reveal className={styles.card}>
            <div className={styles.head}>
              <div className={styles.identity}>
                <AssetLogo name={item.name} symbol={item.symbol} src={item.logoUrl ?? undefined} size="md" />
                <div>
                <p className="eyebrow">{item.symbol}</p>
                <h2 className={styles.name}>{item.name}</h2>
                </div>
              </div>
              <StatusChip tone={item.status === "active" ? "solid" : "outline"}>{marketCandidatePresentationLabel(item.status, item.listingDate)}</StatusChip>
            </div>
            <p className={`${styles.dates} tabular`}>
              IPO {item.ipoDate ? formatDate(item.ipoDate) : "TBA"} <Separator /> Day 5 {item.eligibleFrom ? formatDate(item.eligibleFrom) : "TBA"}
            </p>
            <p className={styles.copy}>{entryCopy(item.eligibleFrom)}</p>
            <EligibilityChecks checks={item.checks} />
            <Link href={`/pipeline/${item.id}`} className={styles.more}>
              View details
              <Icon name="arrow-right" size={14} />
            </Link>
          </Reveal>
        </li>
      ))}
      {loading && <li className={styles.entry}>Loading pipeline…</li>}
      {!loading && error && <li className={styles.entry}>Pipeline unavailable. <button type="button" onClick={refresh}>Try again</button></li>}
    </ol>
  );
}
