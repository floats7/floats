import { usEquitySession } from "../../../../packages/database/src/us-equity-calendar.ts";

const OPEN_MINUTE = 9 * 60 + 30;

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
