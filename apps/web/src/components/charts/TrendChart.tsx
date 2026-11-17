"use client";

import { motion } from "motion/react";
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { changeOver } from "@/data/series";
import type { NavPoint } from "@/data/types";
import { buildChartGeometry } from "@/lib/chart";
import { formatUsd } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";
import styles from "./TrendChart.module.css";

const FRAME = { width: 800, height: 320 } as const;
const TICK_COUNT = 5;

interface TrendChartProps {
  series: readonly NavPoint[];
}

const clampIndex = (index: number, last: number) => Math.min(last, Math.max(0, index));

/** Price chart with labelled axes. The line draws itself in, tinted by direction, and can be scrubbed by pointer or arrow keys. */
export function TrendChart({ series }: TrendChartProps) {
  const gradientId = useId();
  const geometry = useMemo(() => buildChartGeometry(series, FRAME), [series]);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const lastIndex = series.length - 1;
  const activeIndex = scrubIndex ?? lastIndex;
  const active = series[activeIndex];
  const activePoint = geometry.points[activeIndex];
  const direction = changeOver(series) < 0 ? "down" : "up";

  const { min, max } = geometry.domain;
  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => max - ((max - min) * index) / (TICK_COUNT - 1));
  const xLabels = [series[0], series[Math.floor(lastIndex / 2)], series[lastIndex]];

  const scrubTo = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setScrubIndex(clampIndex(Math.round(((event.clientX - bounds.left) / bounds.width) * lastIndex), lastIndex));
  };

  const scrubWithKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step) setScrubIndex(clampIndex(activeIndex + step, lastIndex));
  };

  if (!active || !activePoint) return null;

  const left = (activePoint.x / FRAME.width) * 100;
  const top = (activePoint.y / FRAME.height) * 100;

  return (
    <figure className={styles.figure} data-direction={direction}>
      <figcaption className={styles.readout} aria-live="polite">
        <span className={`${styles.value} tabular`}>{formatUsd(active.value)}</span>
        <span className="eyebrow">{active.label}</span>
      </figcaption>

      <div className={styles.frame}>
        <ul className={styles.yAxis} aria-hidden="true">
          {ticks.map((tick, index) => (
            <li key={index} className="tabular" style={{ top: `${(index / (TICK_COUNT - 1)) * 100}%` }}>
              {formatUsd(tick)}
            </li>
          ))}
        </ul>

        <div
          className={styles.plot}
          tabIndex={0}
          role="group"
          aria-label="Price chart. Use left and right arrow keys to inspect values."
          onPointerMove={scrubTo}
          onPointerLeave={() => setScrubIndex(null)}
          onKeyDown={scrubWithKeys}
          onBlur={() => setScrubIndex(null)}
        >
          {ticks.map((_, index) => (
            <span key={index} className={styles.gridline} style={{ top: `${(index / (TICK_COUNT - 1)) * 100}%` }} aria-hidden="true" />
          ))}

          <svg viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} preserveAspectRatio="none" className={styles.svg} aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={geometry.areaPath}
              fill={`url(#${gradientId})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.slow, delay: 0.5 }}
            />
            <motion.path
              d={geometry.linePath}
              className={styles.line}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: EASE_OUT }}
            />
          </svg>

          {scrubIndex !== null && (
            <>
              <span className={styles.cursor} style={{ left: `${left}%` }} aria-hidden="true" />
              <span className={styles.marker} style={{ left: `${left}%`, top: `${top}%` }} aria-hidden="true" />
              <span className={`${styles.tooltip} tabular`} data-edge={left > 70 ? "right" : "left"} style={{ left: `${left}%`, top: `${top}%` }} aria-hidden="true">
                {formatUsd(active.value)}
              </span>
            </>
          )}
        </div>

        <ul className={styles.xAxis} aria-hidden="true">
          {xLabels.map((point, index) => (
            <li key={index}>{point?.label}</li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
