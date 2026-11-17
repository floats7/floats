"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./MaskedHeading.module.css";

interface MaskedHeadingProps {
  as?: "h1" | "h2";
  id?: string;
  lines: readonly ReactNode[];
  className?: string;
}

const LINE_STAGGER = 0.09;

/** Heading whose lines rise out of a clipping mask, one after another. */
export function MaskedHeading({ as: Tag = "h1", id, lines, className }: MaskedHeadingProps) {
  return (
    <Tag id={id} className={`${styles.heading} ${className ?? ""}`}>
      {lines.map((line, index) => (
        <span key={index} className={styles.mask}>
          <motion.span
            className={styles.line}
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.1 + index * LINE_STAGGER }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
