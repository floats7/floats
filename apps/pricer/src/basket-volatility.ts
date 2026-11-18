export interface BasketCloseObservation {
  readonly sessionDate: string;
  readonly sharePriceUsd18: bigint;
}

export interface BasketVolatilityResult {
  readonly annualizedVolatility: number;
  readonly sampleSize: number;
  readonly firstSessionDate: string;
  readonly lastSessionDate: string;
}

const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRADING_SESSIONS_PER_YEAR = 252;

export function calculateBasketRealizedVolatility(
  observations: readonly BasketCloseObservation[],
  minimumReturns = 20,
): BasketVolatilityResult {
  if (!Number.isSafeInteger(minimumReturns) || minimumReturns < 2) {
    throw new Error("Invalid minimum return count");
  }
  if (observations.length < minimumReturns + 1) throw new Error("INSUFFICIENT_NAV_HISTORY");

  const returns: number[] = [];
  let previousDate = "";
  let previousPrice = 0;
  for (const observation of observations) {
    if (!SESSION_DATE.test(observation.sessionDate) || observation.sessionDate <= previousDate) {
      throw new Error("NAV_SESSIONS_NOT_STRICTLY_ORDERED");
    }
    if (observation.sharePriceUsd18 <= 0n) throw new Error("INVALID_NAV_CLOSE");
    const price = decimal18ToNumber(observation.sharePriceUsd18);
    if (previousPrice > 0) returns.push(Math.log(price / previousPrice));
    previousDate = observation.sessionDate;
    previousPrice = price;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  const annualizedVolatility = Math.sqrt(variance * TRADING_SESSIONS_PER_YEAR);
  if (!Number.isFinite(annualizedVolatility) || annualizedVolatility <= 0) {
    throw new Error("INVALID_REALIZED_VOLATILITY");
  }
  return {
    annualizedVolatility,
    sampleSize: returns.length,
    firstSessionDate: observations[0]!.sessionDate,
    lastSessionDate: observations.at(-1)!.sessionDate,
  };
}

function decimal18ToNumber(value: bigint): number {
  const whole = value / 10n ** 18n;
  const fraction = value % 10n ** 18n;
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("NAV_CLOSE_OUT_OF_RANGE");
  return Number(whole) + Number(fraction) / 1e18;
}
