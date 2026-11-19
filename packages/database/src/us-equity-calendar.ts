const DAY_MS = 86_400_000;

export type UsEquitySession =
  | { readonly state: "closed"; readonly closeEt: null }
  | { readonly state: "regular"; readonly closeEt: "16:00" }
  | { readonly state: "early_close"; readonly closeEt: "13:00" };

export function fifthUsTradingDay(listingDate: string): string {
  if (!isUsTradingDay(listingDate)) throw new Error("Listing date must be a US trading day");
  return addUsTradingDays(listingDate, 4);
}

export function addUsTradingDays(date: string, count: number): string {
  assertIsoDate(date);
  if (!Number.isSafeInteger(count)) throw new Error("Trading-day count must be an integer");
  if (count === 0) return date;
  const direction = count > 0 ? 1 : -1;
  let remaining = Math.abs(count);
  let cursor = date;
  while (remaining > 0) {
    cursor = shiftDate(cursor, direction);
    if (isUsTradingDay(cursor)) remaining -= 1;
  }
  return cursor;
}

export function isUsTradingDay(date: string): boolean {
  return usEquitySession(date).state !== "closed";
}

export function usEquitySession(date: string): UsEquitySession {
  const parsed = parseIsoDate(date);
  const weekday = parsed.getUTCDay();
  if (weekday === 0 || weekday === 6 || closedDates(parsed.getUTCFullYear()).has(date)) {
    return { state: "closed", closeEt: null };
  }
  if (earlyCloseDates(parsed.getUTCFullYear()).has(date)) {
    return { state: "early_close", closeEt: "13:00" };
  }
  return { state: "regular", closeEt: "16:00" };
}

function closedDates(year: number): ReadonlySet<string> {
  return new Set([
    observedFixedHoliday(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    shiftDate(easterSunday(year), -2),
    lastWeekday(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
    observedFixedHoliday(year + 1, 1, 1),
  ].filter((date) => date.startsWith(`${year}-`)));
}

function earlyCloseDates(year: number): ReadonlySet<string> {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const candidates = [shiftDate(thanksgiving, 1), isoDate(year, 12, 24)];
  return new Set(candidates.filter((date) => {
    const day = parseIsoDate(date).getUTCDay();
    return day !== 0 && day !== 6 && !closedDates(year).has(date);
  }));
}

function observedFixedHoliday(year: number, month: number, day: number): string {
  const date = isoDate(year, month, day);
  const weekday = parseIsoDate(date).getUTCDay();
  if (weekday === 6) return shiftDate(date, -1);
  if (weekday === 0) return shiftDate(date, 1);
  return date;
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day = 1 + ((7 + weekday - first.getUTCDay()) % 7) + (occurrence - 1) * 7;
  return isoDate(year, month, day);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const day = last.getUTCDate() - ((7 + last.getUTCDay() - weekday) % 7);
  return isoDate(year, month, day);
}

function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

function shiftDate(date: string, days: number): string {
  return new Date(parseIsoDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  assertIsoDate(value);
  return new Date(`${value}T00:00:00.000Z`);
}

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must use YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Date is invalid");
  }
}
