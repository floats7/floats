import { usEquitySession } from "./us-equity-calendar.ts";

export type PerpsSessionState = "regular" | "extended" | "overnight" | "closed";
export interface PerpsTradingCapabilities { readonly extendedHours: boolean; readonly overnight: boolean; }

const newYorkClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "numeric", minute: "numeric", hourCycle: "h23",
});

/** Resolves the server-authoritative session from the US exchange calendar and official asset capabilities. */
export function resolvePerpsSession(now: Date, capabilities: PerpsTradingCapabilities): PerpsSessionState {
  const parts = Object.fromEntries(newYorkClock.formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const exchange = usEquitySession(date);
  if (exchange.state === "closed") return "closed";
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const regularClose = exchange.state === "early_close" ? 13 * 60 : 16 * 60;
  if (minute >= 9 * 60 + 30 && minute < regularClose) return "regular";
  if (capabilities.extendedHours && minute >= 4 * 60 && minute < 20 * 60) return "extended";
  if (capabilities.overnight) return "overnight";
  return "closed";
}
