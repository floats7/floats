"use client";

import { motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./StatusIcon.module.css";

export type Status = "pending" | "success" | "failed";

const STROKE = { duration: DURATION.slow, ease: EASE_OUT, delay: 0.25 } as const;

/** Large result mark: a spinner while pending, then a ring that draws a check or a cross. */
export function StatusIcon({ status }: { status: Status }) {
  if (status === "pending") {
    return <span className={styles.spinner} role="img" aria-label="In progress" />;
  }

  const label = status === "success" ? "Success" : "Failed";
  return (
    <motion.svg
      viewBox="0 0 64 64"
      className={styles.icon}
      data-status={status}
      role="img"
      aria-label={label}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      <circle cx="32" cy="32" r="29" className={styles.ring} />
      {status === "success" ? (
        <motion.path d="m19 33 9 9 18-20" className={styles.mark} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={STROKE} />
      ) : (
        <>
          <motion.path d="m22 22 20 20" className={styles.mark} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={STROKE} />
          <motion.path d="M42 22 22 42" className={styles.mark} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...STROKE, delay: 0.45 }} />
        </>
      )}
    </motion.svg>
  );
}
