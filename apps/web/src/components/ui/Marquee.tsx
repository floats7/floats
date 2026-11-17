"use client";

import { useState, type ReactNode } from "react";
import styles from "./Marquee.module.css";

interface MarqueeProps {
  label: string;
  children: ReactNode;
}

/** Endless horizontal ticker with an always-available pause control. */
export function Marquee({ label, children }: MarqueeProps) {
  const [paused, setPaused] = useState(false);

  return (
    <div className={styles.wrapper} role="group" aria-label={label}>
      <div className={styles.viewport} data-paused={paused}>
        <ul className={styles.track}>{children}</ul>
        <ul className={styles.track} aria-hidden="true">
          {children}
        </ul>
      </div>
      <button type="button" className={styles.toggle} aria-pressed={paused} onClick={() => setPaused((current) => !current)}>
        {paused ? "Play ticker" : "Pause ticker"}
      </button>
    </div>
  );
}
