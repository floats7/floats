"use client";

import Link from "next/link";
import { HudSection } from "@/components/ui/HudSection";
import { Icon, Separator } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { useRegistryChanges } from "@/hooks/useRegistryChanges";
import { formatDate } from "@/lib/format";
import { PipelineNext } from "./PipelineNext";
import styles from "./RegistryFeed.module.css";

export function RegistryFeed() {
  const { changes, loading, error, retry } = useRegistryChanges();
  const recentChanges = changes.slice(0, 4);
  return (
    <HudSection index="005" title="Registry & pipeline" meta="Every change, in public" tone="paper">
      <Reveal className={styles.header}>
        <h2 className={styles.title}>
          What&apos;s happening <br />
          in the index
        </h2>
      </Reveal>

      <div className={styles.layout}>
        <Reveal className={styles.feed}>
          <ul className={styles.list}>
            {recentChanges.map((change) => (
              <li key={change.id} className={styles.item}>
                <a href={change.explorerUrl} className={styles.itemLink} target="_blank" rel="noreferrer">
                  <time className={`${styles.date} tabular`} dateTime={change.date}>
                    {formatDate(change.date)}
                  </time>
                  <StatusChip tone="muted">{change.kind}</StatusChip>
                  <p className={styles.text}>
                    <span className={styles.itemTitle}>{change.title}</span>
                    <span className={styles.itemMeta}>
                      Block {change.blockNumber.toLocaleString("en-US")} <Separator /> {change.detail}
                    </span>
                  </p>
                  <Icon name="external-link" size={14} />
                </a>
              </li>
            ))}
          </ul>
          {loading && <p className={styles.text} role="status">Loading confirmed changes…</p>}
          {!loading && error && (
            <p className={styles.text} role="alert">
              Registry feed unavailable. <button type="button" onClick={retry}>Try again</button>
            </p>
          )}
          {!loading && !error && recentChanges.length === 0 && (
            <p className={styles.text}>No confirmed registry changes yet.</p>
          )}
          <Link href="/methodology" className={styles.more}>
            All changes <Icon name="arrow-right" size={14} />
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <PipelineNext />
        </Reveal>
      </div>
    </HudSection>
  );
}
