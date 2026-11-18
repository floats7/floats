export function parseUnits(value: string, decimals: number): string | null {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) return null;
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  const normalized = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return BigInt(normalized || "0") > 0n ? normalized : null;
}

export function formatUnits(value: string, decimals: number, displayDecimals = 4): string {
  if (!/^[0-9]+$/.test(value)) throw new Error("Invalid unit value");
  const padded = value.padStart(decimals + 1, "0");
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction = decimals === 0
    ? ""
    : padded.slice(-decimals).slice(0, Math.min(displayDecimals, decimals));
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function unitsToNumber(value: string, decimals: number): number {
  return Number(formatUnits(value, decimals, decimals));
}

export function decimalUnitsToNumber(value: string, decimals: number): number {
  return unitsToNumber(value, decimals);
}
