import { usEquitySession } from "../../../../packages/database/src/us-equity-calendar.ts";

const OPEN_MINUTE = 9 * 60 + 30;
const DAY_MS = 24 * 60 * 60 * 1_000;

const newYorkClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Official regular US session, including full holidays and scheduled early closes. */
export function isUsMarketOpen(now: Date): boolean {
  const parts = Object.fromEntries(
    newYorkClock.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const session = usEquitySession(date);
  if (session.state === "closed") return false;
  const closeMinute = session.state === "early_close" ? 13 * 60 : 16 * 60;
  return minutes >= OPEN_MINUTE && minutes < closeMinute;
}

/** Next official US regular-session opening, returned as an absolute UTC instant. */
export function nextUsMarketOpen(now: Date): Date {
  const current = newYorkParts(now);
  for (let offset = 0; offset < 15; offset += 1) {
    const calendarDate = new Date(Date.UTC(current.year, current.month - 1, current.day) + offset * DAY_MS);
    const year = calendarDate.getUTCFullYear();
    const month = calendarDate.getUTCMonth() + 1;
    const day = calendarDate.getUTCDate();
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (usEquitySession(date).state === "closed") continue;
    const opening = newYorkTimeToUtc(year, month, day, 9, 30);
    if (opening.getTime() > now.getTime()) return opening;
  }
  throw new Error("NEXT_US_MARKET_OPEN_UNAVAILABLE");
}

export function formatUtcMarketOpen(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(value);
}

function newYorkParts(value: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(newYorkClock.formatToParts(value).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function newYorkTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const approximate = new Date(Date.UTC(year, month - 1, day, 16));
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  }).formatToParts(approximate).find((part) => part.type === "timeZoneName")?.value;
  const match = offsetName?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error("NEW_YORK_OFFSET_UNAVAILABLE");
  const direction = match[1] === "+" ? 1 : -1;
  const offsetMinutes = direction * (Number(match[2]) * 60 + Number(match[3]));
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000);
}
