import { addMonths } from "@/lib/dates";
import { fifthUsTradingDay } from "../../../../packages/database/src/us-equity-calendar.ts";
import type { Constituent } from "./types";

type Seed = Omit<Constituent, "entryDate">;

const SEEDS: readonly Seed[] = [
  { ticker: "CRWV", name: "CoreWeave", ipoDate: "2025-03-28", targetWeight: 12.5, actualWeight: 12.9, returnSinceEntry: 38.4, price: 142.18 },
  { ticker: "ETOR", name: "eToro", ipoDate: "2025-05-14", targetWeight: 12.5, actualWeight: 11.7, returnSinceEntry: -6.2, price: 41.07 },
  { ticker: "CRCL", name: "Circle", ipoDate: "2025-06-05", targetWeight: 12.5, actualWeight: 13.6, returnSinceEntry: 52.9, price: 118.6 },
  { ticker: "CHYM", name: "Chime", ipoDate: "2025-06-12", targetWeight: 12.5, actualWeight: 12.2, returnSinceEntry: 4.8, price: 27.35 },
  { ticker: "FIG", name: "Figma", ipoDate: "2025-07-31", targetWeight: 12.5, actualWeight: 12.8, returnSinceEntry: 21.3, price: 63.9 },
  { ticker: "KLAR", name: "Klarna", ipoDate: "2025-09-10", targetWeight: 12.5, actualWeight: 11.9, returnSinceEntry: -12.7, price: 33.44 },
  { ticker: "FIGR", name: "Figure Technology", ipoDate: "2025-09-11", targetWeight: 12.5, actualWeight: 12.6, returnSinceEntry: 9.1, price: 29.8 },
  { ticker: "NTSK", name: "Netskope", ipoDate: "2025-09-18", targetWeight: 12.5, actualWeight: 12.3, returnSinceEntry: 15.6, price: 24.12 },
];

export const CONSTITUENTS: readonly Constituent[] = SEEDS.map((seed) => ({
  ...seed,
  entryDate: fifthUsTradingDay(seed.ipoDate),
}));

export const EXIT_WINDOW_MONTHS = 24;

export const exitDateFor = (ipoDate: string) => addMonths(ipoDate, EXIT_WINDOW_MONTHS);
