"use client";

import { motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { CompareCircles } from "./CompareCircles";
import type { NarrativeStep } from "./steps";
import styles from "./StepCopy.module.css";

const WORD_STAGGER = 0.045;

interface StepCopyProps {
  step: NarrativeStep;
  /** Index of the list item currently in focus, driven by scroll inside the step. */
  activeItem: number;
}

/** Copy for one step. Headline words resolve from dim to bright one after another. */
export function StepCopy({ step, activeItem }: StepCopyProps) {
  const words = step.headline.split(" ");

  return (
    <motion.div
      className={styles.copy}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -14, transition: { duration: DURATION.fast } }}
      variants={{ visible: { transition: { staggerChildren: WORD_STAGGER } } }}
    >
      <p className="eyebrow">{step.eyebrow}</p>

      <h2 className={styles.headline}>
        {words.map((word, index) => (
          <motion.span
            key={`${word}-${index}`}
            className={styles.word}
            variants={{ hidden: { opacity: 0.12, y: 10 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT }}
          >
            {word}
          </motion.span>
        ))}
      </h2>

      {step.sub && (
        <motion.p className={styles.sub} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
          {step.sub}
        </motion.p>
      )}

      {step.list && (
        <motion.ol className={styles.list} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
          {step.list.map((item, index) => (
            <li key={item} className={styles.item} data-active={index === activeItem}>
              <span className="tabular">{String(index + 1).padStart(2, "0")}</span>
              {item}
            </li>
          ))}
        </motion.ol>
      )}

      {step.compare && (
        <motion.div variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
          <CompareCircles {...step.compare} />
        </motion.div>
      )}
    </motion.div>
  );
}
