const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MINUS = "-";

export const formatUsd = (value: number) => usd.format(value);

export const formatUsdCompact = (value: number) => usdCompact.format(value);

export const formatDate = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`));

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number, digits = 2): string {
  return `${formatNumber(Math.abs(value), digits)}%`;
}

export function formatSignedPercent(value: number, digits = 2): string {
  const sign = value < 0 ? MINUS : "+";
  return `${sign}${formatPercent(value, digits)}`;
}
