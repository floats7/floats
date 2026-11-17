"use client";

import { motion } from "motion/react";
import { Separator } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./LifecycleBar.module.css";

interface LifecycleBarProps {
  /** Fraction of the 24-month window already elapsed, 0..1. */
  progress: number;
  /** Fraction of the window at which the stock joined the index, 0..1. */
  entryFraction: number;
  daysRemaining: number;
}

/** Position of a constituent inside its 24-month stay in the index. */
export function LifecycleBar({ progress, entryFraction, daysRemaining }: LifecycleBarProps) {
  const percent = Math.round(progress * 100);

  return (
    <Reveal className={`container ${styles.section}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Time in the index</h2>
        <p className={styles.summary}>
          {percent}% of the 24-month window elapsed <Separator /> <span className="tabular">{daysRemaining}</span> days to scheduled exit
        </p>
      </div>

      <div className={styles.track} role="img" aria-label={`${percent} percent of the index window has elapsed`}>
        <motion.span
          className={styles.fill}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: progress }}
          viewport={{ once: true }}
          transition={{ duration: DURATION.slow * 2, ease: EASE_OUT }}
        />
        <span className={styles.tick} style={{ left: `${entryFraction * 100}%` }} aria-hidden="true" />
      </div>

      <ul className={styles.legend}>
        <li>IPO</li>
        <li>Index entry (day 5)</li>
        <li>Scheduled exit (24 months)</li>
      </ul>
    </Reveal>
  );
}
