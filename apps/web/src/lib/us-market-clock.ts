import { usEquitySession } from "../../../../packages/database/src/us-equity-calendar.ts";

const NEW_YORK = "America/New_York";
export type PublicEquitySession = "market" | "extended" | "overnight" | "closed";

export function dateInNewYork(now = new Date()): string {
  return formatParts(now).date;
}

export function isDebutingToday(listingDate: string | null, now = new Date()): boolean {
  return Boolean(listingDate && listingDate === dateInNewYork(now));
}

export function listingOpenAt(listingDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(listingDate)) throw new Error("Listing date is invalid");
  const [year, month, day] = listingDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Listing date is invalid");
  const desiredUtc = Date.UTC(year, month - 1, day, 9, 30);
  let result = new Date(desiredUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = formatParts(result);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    result = new Date(result.getTime() + desiredUtc - represented);
  }
  return result;
}

export function currentPublicEquitySession(now = new Date()): PublicEquitySession {
  const parts = formatParts(now);
  const calendar = usEquitySession(parts.date);
  const minutes = parts.hour * 60 + parts.minute;
  if (calendar.state === "closed") return "closed";
  const closeMinutes = calendar.state === "early_close" ? 13 * 60 : 16 * 60;
  if (minutes >= 9 * 60 + 30 && minutes < closeMinutes) return "market";
  if ((minutes >= 4 * 60 && minutes < 9 * 60 + 30) || (minutes >= closeMinutes && minutes < 20 * 60)) {
    return "extended";
  }
  return "overnight";
}

function formatParts(date: Date): {
  readonly date: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEW_YORK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  return {
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    hour,
    minute,
  };
}
