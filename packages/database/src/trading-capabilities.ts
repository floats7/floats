export type TradingCapabilityState = "tradable" | "restricted" | "unavailable" | "unknown";

export interface NormalizedTradingCapabilities {
  readonly market: TradingCapabilityState;
  readonly extended: TradingCapabilityState;
  readonly overnight: TradingCapabilityState;
}

export function normalizeTradingCapabilities(value: unknown): NormalizedTradingCapabilities {
  if (!isObject(value)) return unknownCapabilities();
  if (isObject(value.market) || isObject(value.extended) || isObject(value.overnight)) {
    return {
      market: normalizeSession(value.market),
      extended: normalizeSession(value.extended),
      overnight: normalizeSession(value.overnight),
    };
  }
  return {
    market: normalizeFlatStatus(value.fractionalTradability),
    extended: typeof value.extendedHoursFractionalTradability === "boolean"
      ? value.extendedHoursFractionalTradability ? "tradable" : "unavailable"
      : "unknown",
    overnight: normalizeFlatStatus(value.allDayTradability),
  };
}

function normalizeSession(value: unknown): TradingCapabilityState {
  if (!isObject(value)) return "unknown";
  const statuses = [value.whole, value.fractional].filter((item): item is string => typeof item === "string");
  if (statuses.some(isTradable)) return "tradable";
  if (statuses.some(isRestricted)) return "restricted";
  if (statuses.length > 0) return "unavailable";
  return "unknown";
}

function normalizeFlatStatus(value: unknown): TradingCapabilityState {
  if (typeof value !== "string" || !value) return "unknown";
  if (isTradable(value)) return "tradable";
  if (isRestricted(value)) return "restricted";
  return "unavailable";
}

function isTradable(value: string): boolean {
  return ["tradable", "TRADING_STATUS_TRADABLE"].includes(value);
}

function isRestricted(value: string): boolean {
  return [
    "position_closing_only",
    "position_opening_only",
    "TRADING_STATUS_POSITION_CLOSING_ONLY",
    "TRADING_STATUS_POSITION_OPENING_ONLY",
  ].includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownCapabilities(): NormalizedTradingCapabilities {
  return { market: "unknown", extended: "unknown", overnight: "unknown" };
}
