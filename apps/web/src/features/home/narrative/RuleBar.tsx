"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { RULES } from "@/data/methodology";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./RuleBar.module.css";

interface RuleBarProps {
  activeRule: number;
  /** Progress through the six rules only, 0 to 1. */
  ruleProgress: MotionValue<number>;
  onJump: (rule: number) => void;
}

/** Bottom strip that lists the six rules, with a segmented meter tracking how far through them you are. */
export function RuleBar({ activeRule, ruleProgress, onJump }: RuleBarProps) {
  const clip = useTransform(ruleProgress, (value) => `inset(0 ${(1 - value) * 100}% 0 0)`);

  return (
    <motion.div
      className={styles.bar}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      <div className={styles.header}>
        <p className={styles.title}>The next great index must be great at the following</p>
        <div className={styles.status}>
          <span className={styles.meter} aria-hidden="true">
            <motion.span className={styles.fill} style={{ clipPath: clip }} />
          </span>
          <span>{RULES[activeRule]?.title}</span>
        </div>
      </div>

      <ol className={styles.items}>
        {RULES.map((rule, index) => (
          <li key={rule.title}>
            <button type="button" className={styles.item} aria-current={index === activeRule} onClick={() => onJump(index)}>
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className={styles.icon}>
                <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span className="tabular">{String(index + 1).padStart(2, "0")}</span>
              {rule.title}
            </button>
          </li>
        ))}
      </ol>
    </motion.div>
  );
}
