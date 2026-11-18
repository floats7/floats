export type OptionKind = "capped-call" | "put";

export interface PricingInput {
  readonly kind: OptionKind;
  readonly spotUsd: number;
  readonly strikeUsd: number;
  readonly capUsd?: number;
  readonly timeToExpiryYears: number;
  readonly volatility: number;
  readonly riskFreeRate: number;
  readonly contractSize: number;
}

export function blackScholesPremium(input: PricingInput): number {
  validate(input);
  const intrinsic = intrinsicValue(input);
  if (input.timeToExpiryYears === 0 || input.volatility === 0) return intrinsic;

  const vanilla = input.kind === "put"
    ? putPrice(input.spotUsd, input.strikeUsd, input)
    : callPrice(input.spotUsd, input.strikeUsd, input) -
      callPrice(input.spotUsd, requireCap(input), input);
  return clamp(vanilla * input.contractSize, 0, maximumPayoff(input));
}

export function intrinsicValue(input: PricingInput): number {
  const unit = input.kind === "put"
    ? Math.max(input.strikeUsd - input.spotUsd, 0)
    : Math.min(
      Math.max(input.spotUsd - input.strikeUsd, 0),
      requireCap(input) - input.strikeUsd,
    );
  return unit * input.contractSize;
}

export function maximumPayoff(input: PricingInput): number {
  const unit = input.kind === "put" ? input.strikeUsd : requireCap(input) - input.strikeUsd;
  return unit * input.contractSize;
}

function callPrice(spot: number, strike: number, input: PricingInput): number {
  const { d1, d2 } = distributionTerms(spot, strike, input);
  return spot * normalCdf(d1) -
    strike * Math.exp(-input.riskFreeRate * input.timeToExpiryYears) * normalCdf(d2);
}

function putPrice(spot: number, strike: number, input: PricingInput): number {
  const { d1, d2 } = distributionTerms(spot, strike, input);
  return strike * Math.exp(-input.riskFreeRate * input.timeToExpiryYears) * normalCdf(-d2) -
    spot * normalCdf(-d1);
}

function distributionTerms(spot: number, strike: number, input: PricingInput) {
  const rootTime = Math.sqrt(input.timeToExpiryYears);
  const d1 = (
    Math.log(spot / strike) +
    (input.riskFreeRate + input.volatility ** 2 / 2) * input.timeToExpiryYears
  ) / (input.volatility * rootTime);
  return { d1, d2: d1 - input.volatility * rootTime };
}

function normalCdf(value: number): number {
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = Math.exp(-(absolute ** 2) / 2) / Math.sqrt(2 * Math.PI);
  const tail = density * t * (
    0.319381530 +
    t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))
  );
  return value >= 0 ? 1 - tail : tail;
}

function validate(input: PricingInput): void {
  for (const [name, value] of Object.entries(input)) {
    if (name === "kind" || name === "capUsd") continue;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  }
  if (
    input.spotUsd <= 0 ||
    input.strikeUsd <= 0 ||
    input.timeToExpiryYears < 0 ||
    input.volatility < 0 ||
    input.contractSize <= 0
  ) {
    throw new Error("Pricing input is outside its allowed range");
  }
  if (input.kind === "capped-call" && requireCap(input) <= input.strikeUsd) {
    throw new Error("Capped-call cap must exceed strike");
  }
}

function requireCap(input: PricingInput): number {
  if (input.capUsd === undefined || !Number.isFinite(input.capUsd)) {
    throw new Error("Capped-call cap is required");
  }
  return input.capUsd;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
