"use client";

import type { HTMLAttributes, PointerEvent } from "react";
import styles from "./SpotlightCard.module.css";

/** Metal plate with a light that follows the pointer. Pointer position is written straight to CSS variables to avoid re-renders. */
export function SpotlightCard({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
  };

  return (
    <div className={`${styles.card} ${className ?? ""}`} onPointerMove={handlePointerMove} {...rest}>
      {children}
    </div>
  );
}
