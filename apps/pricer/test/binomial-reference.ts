import type { PricingInput } from "../src/black-scholes.ts";

export function binomialReferencePremium(input: PricingInput, steps = 600): number {
  if (steps < 1 || !Number.isSafeInteger(steps)) throw new Error("Invalid binomial steps");
  if (input.timeToExpiryYears === 0) return payoff(input, input.spotUsd);
  const stepTime = input.timeToExpiryYears / steps;
  const up = Math.exp(input.volatility * Math.sqrt(stepTime));
  const down = 1 / up;
  const growth = Math.exp(input.riskFreeRate * stepTime);
  const probability = (growth - down) / (up - down);
  if (probability < 0 || probability > 1) throw new Error("Invalid risk-neutral probability");
  const discount = Math.exp(-input.riskFreeRate * stepTime);
  const values = Array.from({ length: steps + 1 }, (_, upMoves) => {
    const spot = input.spotUsd * up ** upMoves * down ** (steps - upMoves);
    return payoff(input, spot);
  });

  for (let remaining = steps; remaining > 0; remaining -= 1) {
    for (let index = 0; index < remaining; index += 1) {
      const downValue = values[index];
      const upValue = values[index + 1];
      if (downValue === undefined || upValue === undefined) throw new Error("Invalid tree state");
      values[index] = discount * (probability * upValue + (1 - probability) * downValue);
    }
  }
  const premium = values[0];
  if (premium === undefined) throw new Error("Missing binomial result");
  return premium;
}

function payoff(input: PricingInput, spot: number): number {
  if (input.kind === "put") return Math.max(input.strikeUsd - spot, 0) * input.contractSize;
  if (input.capUsd === undefined) throw new Error("Missing capped-call cap");
  return Math.min(
    Math.max(spot - input.strikeUsd, 0),
    input.capUsd - input.strikeUsd,
  ) * input.contractSize;
}
