/** Fixed reference date keeps the sample data deterministic across renders. */
export const AS_OF = "2026-11-17";

const MS_PER_DAY = 86_400_000;

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso).getTime() - toUtc(fromIso).getTime()) / MS_PER_DAY);
}

export function addMonths(iso: string, months: number): string {
  const date = toUtc(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Share of the window between `fromIso` and `toIso` that has elapsed on `nowIso`, clamped to 0..1. */
export function elapsedFraction(fromIso: string, toIso: string, nowIso: string): number {
  const total = daysBetween(fromIso, toIso);
  return total <= 0 ? 1 : Math.min(1, Math.max(0, daysBetween(fromIso, nowIso) / total));
}
