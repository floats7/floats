"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";
import type { ChangeKind } from "@/data/types";
import { useRegistryChanges } from "@/hooks/useRegistryChanges";
import { formatDate } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./ChangeLog.module.css";

type Filter = "All" | "Add" | "Remove" | "Weights" | "Scheduled";

const FILTERS: readonly Filter[] = ["All", "Scheduled", "Add", "Remove", "Weights"];

const matches = (filter: Filter, kind: ChangeKind) => filter === "All" || filter.toLowerCase() === kind;

export function ChangeLog() {
  const [filter, setFilter] = useState<Filter>("All");
  const { changes, loading, error, retry } = useRegistryChanges();
  const visible = changes.filter((change) => matches(filter, change.kind));

  return (
    <section className={`container ${styles.section}`} aria-labelledby="changes-title">
      <Reveal className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 id="changes-title" className={styles.title}>
            Changes
          </h2>
          <p className={styles.sub}>Every scheduled, executed, or cancelled registry change is indexed from Robinhood Chain and linked to its transaction evidence.</p>
        </div>
        <Tabs label="Filter changes" options={FILTERS} value={filter} onChange={setFilter} />
      </Reveal>

      <ul className={styles.list}>
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((change) => (
            <motion.li
              key={change.id}
              layout
              className={styles.item}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
            >
              <a
                href={change.explorerUrl}
                className={styles.itemLink}
                target="_blank"
                rel="noreferrer"
                aria-label={`${change.title}. View transaction on Robinhood Chain explorer.`}
              >
                <time className={`${styles.date} tabular`} dateTime={change.date}>
                  {formatDate(change.date)}
                </time>
                <StatusChip tone="muted">{change.kind}</StatusChip>
                <div className={styles.copy}>
                  <h3 className={styles.itemTitle}>{change.title}</h3>
                  <p className={styles.detail}>{change.detail}</p>
                  <dl className={styles.metadata}>
                    <div>
                      <dt>Block</dt>
                      <dd className="tabular">{change.blockNumber.toLocaleString("en-US")}</dd>
                    </div>
                    <div>
                      <dt>Registry version</dt>
                      <dd className="tabular">{change.registryVersion ?? "Not assigned"}</dd>
                    </div>
                    <div>
                      <dt>Transaction</dt>
                      <dd className="tabular">{shortHash(change.transactionHash)}</dd>
                    </div>
                  </dl>
                </div>
                <span className={styles.explorer} aria-hidden="true">
                  Explorer <Icon name="external-link" size={14} />
                </span>
              </a>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {loading && <p className={styles.empty} role="status">Loading confirmed registry changes…</p>}
      {!loading && error && (
        <p className={styles.empty} role="alert">
          Registry history is temporarily unavailable.{" "}
          <button type="button" onClick={retry}>Try again</button>
        </p>
      )}
      {!loading && !error && visible.length === 0 && (
        <p className={styles.empty}>No confirmed changes of this type yet.</p>
      )}
    </section>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}
