const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 16 * 60;
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

const newYorkClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Regular US session only; exchange holidays are not modelled. */
export function isUsMarketOpen(now: Date): boolean {
  const parts = Object.fromEntries(
    newYorkClock.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return WEEKDAYS.has(String(parts.weekday)) && minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE;
}
