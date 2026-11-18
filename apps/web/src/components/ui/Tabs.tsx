"use client";

import { LayoutGroup, motion } from "motion/react";
import { useId, type KeyboardEvent } from "react";
import { SPRING } from "@/lib/motion";
import styles from "./Tabs.module.css";

interface TabsProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  optionLabel?: (value: T) => string;
}

/** Segmented control. A shared indicator glides between the options. */
export function Tabs<T extends string>({ label, options, value, onChange, optionLabel = String }: TabsProps<T>) {
  const groupId = useId();

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = options[(index + step + options.length) % options.length];
    if (next) onChange(next);
  };

  return (
    <LayoutGroup id={groupId}>
      <div className={styles.tabs} role="radiogroup" aria-label={label}>
        {options.map((option, index) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              data-selected={selected}
              data-option={option.toLowerCase()}
              onClick={() => onChange(option)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {selected && <motion.span layoutId="tab-indicator" className={styles.indicator} transition={SPRING.snappy} />}
              <span className={styles.text}>{optionLabel(option)}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
