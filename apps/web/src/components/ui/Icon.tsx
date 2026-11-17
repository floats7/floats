import type { ReactNode } from "react";
import styles from "./Icon.module.css";

/** Every glyph in the interface comes from this single stroke-based set (16px grid, 1.6 stroke). */
const GLYPHS = {
  "arrow-right": <path d="M3 8h10m-4-4 4 4-4 4" />,
  "arrow-left": <path d="M13 8H3m4-4L3 8l4 4" />,
  "arrow-down": <path d="M8 3v10m-4-4 4 4 4-4" />,
  "chevron-right": <path d="m6 3 5 5-5 5" />,
  menu: <path d="M2 5h12M2 11h12" />,
  check: <path d="m3 8.5 3.2 3.2L13 4.8" />,
  close: <path d="m3 3 10 10M13 3 3 13" />,
  info: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Zm0-7v4m0-6v.01" />,
  dot: <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof GLYPHS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Decorative by default: pair it with visible text or an aria-label on the control. */
export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${styles.icon} ${className ?? ""}`}
    >
      {GLYPHS[name]}
    </svg>
  );
}

/** Inline divider between short pieces of text, replacing typographic bullets. */
export function Separator() {
  return <Icon name="dot" size={10} className={styles.separator} />;
}
