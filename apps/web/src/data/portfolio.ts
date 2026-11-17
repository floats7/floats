import type { Position, Transaction } from "./types";

export const POSITION: Position = { shares: 42.5, costBasis: 4_105.4 };

export const TRANSACTIONS: readonly Transaction[] = [
  { id: "t1", date: "2026-11-03", type: "Cash mint", shares: 25, usdg: 2_450 },
  { id: "t2", date: "2026-10-21", type: "In-kind mint", shares: 12.5, usdg: 1_201.25 },
  { id: "t3", date: "2026-10-09", type: "Cash mint", shares: 5, usdg: 454.15 },
];
