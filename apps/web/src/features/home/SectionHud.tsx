"use client";

import { useEffect, useState } from "react";
import styles from "./SectionHud.module.css";

interface HudState {
  index: string;
  title: string;
  meta: string;
}

const HIDDEN_ON = "001";
const CENTER_BAND = "-45% 0px -45% 0px";

/** Fixed readout under the header that follows whichever numbered section crosses the middle of the screen. */
export function SectionHud() {
  const [state, setState] = useState<HudState | null>(null);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("[data-hud-index]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const { hudIndex, hudTitle, hudMeta } = (entry.target as HTMLElement).dataset;
          setState({ index: hudIndex ?? "", title: hudTitle ?? "", meta: hudMeta ?? "" });
        }
      },
      { rootMargin: CENTER_BAND },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const visible = state !== null && state.index !== HIDDEN_ON;

  return (
    <div className={styles.hud} data-visible={visible} aria-hidden="true">
      <p className={styles.left}>
        <span className={styles.item}>{state?.index}</span>
        <span className={styles.item}>{state?.title}</span>
      </p>
      <p className={styles.right}>{state?.meta}</p>
    </div>
  );
}
