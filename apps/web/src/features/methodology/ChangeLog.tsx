"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";
import type { ChangeKind } from "@/data/types";
import { useRegistryChanges } from "@/hooks/useRegistryChanges";
import { formatDate } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./ChangeLog.module.css";

type Filter = "All" | "Add" | "Remove" | "Weights";

const FILTERS: readonly Filter[] = ["All", "Add", "Remove", "Weights"];

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
          <p className={styles.sub}>Every registry change passes a 48-hour timelock.</p>
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
              <time className={`${styles.date} tabular`} dateTime={change.date}>
                {formatDate(change.date)}
              </time>
              <StatusChip tone="muted">{change.kind}</StatusChip>
              <div>
                <h3 className={styles.itemTitle}>{change.title}</h3>
                <p className={styles.detail}>{change.detail}</p>
              </div>
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
