import type { PipelineItem } from "./types";

export const PIPELINE: readonly PipelineItem[] = [
  { id: "meridian-robotics", name: "Meridian Robotics", ticker: "MRDN", status: "queued", ipoDate: "2026-11-10", entryDate: "2026-11-17", checks: { tokenLive: true, priceFeed: true, liquidity: false } },
  { id: "halcyon-bio", name: "Halcyon Bio", ticker: "HLCN", status: "listed", ipoDate: "2026-11-13", entryDate: "2026-11-20", checks: { tokenLive: true, priceFeed: false, liquidity: false } },
  { id: "orbitline-systems", name: "Orbitline Systems", ticker: "ORBL", status: "upcoming", ipoDate: "2026-11-24", entryDate: "2026-12-01", checks: { tokenLive: false, priceFeed: false, liquidity: false } },
  { id: "vantage-grid", name: "Vantage Grid", ticker: "VGRD", status: "upcoming", ipoDate: "2026-12-04", entryDate: "2026-12-11", checks: { tokenLive: false, priceFeed: false, liquidity: false } },
];
