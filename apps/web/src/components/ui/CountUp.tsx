"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatNumber, formatUsd, formatUsdCompact } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";

/** Named formatters keep props serializable, so server components can render CountUp. */
const FORMATTERS = {
  usd: (value: number) => formatUsd(Number(value.toFixed(2))),
  usdCompact: formatUsdCompact,
  integer: (value: number) => formatNumber(value, 0),
  fipo: (value: number) => `${formatNumber(value, 2)} fIPO`,
} as const;

export type CountUpFormat = keyof typeof FORMATTERS;

interface CountUpProps {
  value: number;
  format: CountUpFormat;
}

/** Counts from zero to `value` when scrolled into view. */
export function CountUp({ value, format }: CountUpProps) {
  const formatValue = FORMATTERS[format];
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!inView || !node || reducedMotion) return;

    const controls = animate(0, value, {
      duration: DURATION.slow * 2,
      ease: EASE_OUT,
      onUpdate: (current) => {
        node.textContent = formatValue(current);
      },
    });
    return () => controls.stop();
  }, [inView, reducedMotion, value, formatValue]);

  return <span ref={ref}>{formatValue(value)}</span>;
}
