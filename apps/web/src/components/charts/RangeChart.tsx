"use client";

import { useState } from "react";
import { Delta } from "@/components/ui/Delta";
import { Tabs } from "@/components/ui/Tabs";
import { RANGES, changeOver } from "@/data/series";
import type { NavPoint, NavRange } from "@/data/types";
import { TrendChart } from "./TrendChart";
import styles from "./RangeChart.module.css";

interface RangeChartProps {
  seriesByRange: Record<NavRange, readonly NavPoint[]>;
  initialRange?: NavRange;
}

/** Range tabs, change badge and chart in one panel. Remounts the chart per range so the line redraws. */
export function RangeChart({ seriesByRange, initialRange = "1M" }: RangeChartProps) {
  const [range, setRange] = useState<NavRange>(initialRange);
  const series = seriesByRange[range];

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <Delta value={changeOver(series)} />
        <Tabs label="Chart range" options={RANGES} value={range} onChange={setRange} />
      </div>
      <TrendChart key={range} series={series} />
    </div>
  );
}
