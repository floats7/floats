"use client";

import { motion, useScroll, useSpring } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { Icon, Separator } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { PIPELINE } from "@/data/pipeline";
import { AS_OF, daysBetween } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { EligibilityChecks } from "./EligibilityChecks";
import styles from "./PipelineTimeline.module.css";

function entryCopy(entryDate: string): string {
  const days = daysBetween(AS_OF, entryDate);
  if (days <= 0) return "Eligible now, awaiting final checks";
  return `Enters the index in ${days} ${days === 1 ? "day" : "days"} if all checks pass`;
}

/** Vertical timeline whose spine fills as the reader scrolls. */
export function PipelineTimeline() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const scaleY = useSpring(scrollYProgress, SPRING.soft);

  return (
    <ol ref={ref} className={`container ${styles.timeline}`}>
      <span className={styles.spine} aria-hidden="true">
        <motion.span className={styles.fill} style={{ scaleY }} />
      </span>

      {PIPELINE.map((item) => (
        <li key={item.id} className={styles.entry}>
          <span className={styles.node} aria-hidden="true" />
          <Reveal className={styles.card}>
            <div className={styles.head}>
              <div>
                <p className="eyebrow">{item.ticker}</p>
                <h2 className={styles.name}>{item.name}</h2>
              </div>
              <StatusChip tone={item.status === "queued" ? "solid" : "outline"}>{item.status}</StatusChip>
            </div>
            <p className={`${styles.dates} tabular`}>
              IPO {formatDate(item.ipoDate)} <Separator /> Day 5 on {formatDate(item.entryDate)}
            </p>
            <p className={styles.copy}>{entryCopy(item.entryDate)}</p>
            <EligibilityChecks checks={item.checks} />
            <Link href={`/pipeline/${item.id}`} className={styles.more}>
              View details
              <Icon name="arrow-right" size={14} />
            </Link>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}
