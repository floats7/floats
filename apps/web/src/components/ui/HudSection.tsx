import type { ReactNode } from "react";
import styles from "./HudSection.module.css";

interface HudSectionProps {
  /** Three-digit section number shown in the label row and the HUD bar. */
  index: string;
  title: string;
  /** Right-hand context line in the HUD bar. */
  meta: string;
  tone?: "dark" | "paper";
  id?: string;
  /** Removes the label row and padding, for sections that manage their own layout. */
  flush?: boolean;
  children: ReactNode;
}

/** A numbered landing section. A label row opens it, and the HUD bar reads its data attributes while it is in view. */
export function HudSection({ index, title, meta, tone = "dark", id, flush = false, children }: HudSectionProps) {
  return (
    <section id={id} className={styles.section} data-tone={tone} data-flush={flush} data-hud-index={index} data-hud-title={title} data-hud-meta={meta}>
      {!flush && (
        <div className={styles.row} aria-hidden="true">
          {(["first", "second"] as const).map((position) => (
            <span key={position} className={`${styles.group} ${styles[position]}`}>
              <span className={styles.number}>{index}</span>
              <span className={styles.title}>{title}</span>
            </span>
          ))}
        </div>
      )}
      {children}
    </section>
  );
}
