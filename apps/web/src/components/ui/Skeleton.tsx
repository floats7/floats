import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string;
  height?: string;
}

/** Shimmering placeholder. Hidden from assistive tech; the owner announces loading. */
export function Skeleton({ width = "100%", height = "1rem" }: SkeletonProps) {
  return <span className={styles.skeleton} style={{ "--width": width, "--height": height } as CSSProperties} aria-hidden="true" />;
}
