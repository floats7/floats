import type { NavPoint } from "@/data/types";

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
  /** Value range the vertical axis covers, padded so the line never touches the edges. */
  domain: { min: number; max: number };
}

interface Frame {
  width: number;
  height: number;
}

const DOMAIN_PADDING = 0.12;

export function buildChartGeometry(series: readonly NavPoint[], { width, height }: Frame): ChartGeometry {
  const values = series.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || 1) * DOMAIN_PADDING;
  const domain = { min: low - pad, max: high + pad };
  const stepX = width / Math.max(series.length - 1, 1);

  const points = values.map((value, index) => ({
    x: index * stepX,
    y: (1 - (value - domain.min) / (domain.max - domain.min)) * height,
  }));

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width} ${height} L0 ${height} Z`;

  return { points, linePath, areaPath, domain };
}
