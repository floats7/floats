import {
  blackScholesPremium,
  intrinsicValue,
  maximumPayoff,
  type PricingInput,
} from "./black-scholes.ts";

const BPS = 10_000;

export type IvSource = "external-implied" | "sector-peer" | "basket-realized";

export interface IvObservation {
  readonly source: IvSource;
  readonly annualizedVolatility: number;
  readonly observedAtSeconds: number;
}

export interface QuotePolicyInput {
  readonly pricing: Omit<PricingInput, "volatility">;
  readonly ivObservations: readonly IvObservation[];
  readonly nowSeconds: number;
  readonly maximumIvAgeSeconds: number;
  readonly minimumVolatility: number;
  readonly baseSpreadBps: number;
  readonly oracleHealthy: boolean;
  readonly utilizationBps: number;
  readonly side: "buy" | "sell-back";
  readonly sectorPeerMultiplier: number;
  readonly basketPremium: number;
  readonly utilizationWideningBpsAtMaximum: number;
}

export interface QuotePolicyResult {
  readonly premiumUsd: number;
  readonly premiumPerUnit6: bigint;
  readonly fairValueUsd: number;
  readonly volatility: number;
  readonly ivSource: IvSource;
  readonly spreadBps: number;
}

export function priceQuote(input: QuotePolicyInput): QuotePolicyResult {
  validatePolicy(input);
  if (!input.oracleHealthy) throw new Error("ORACLE_UNAVAILABLE");
  const resolved = resolveVolatility(input);
  const pricing = { ...input.pricing, volatility: resolved.volatility };
  const fairValueUsd = blackScholesPremium(pricing);
  const spreadBps = resolveSpreadBps(input);
  const multiplier = input.side === "buy" ? BPS + spreadBps : BPS - spreadBps;
  const premiumUsd = clamp(
    fairValueUsd * multiplier / BPS,
    intrinsicValue(pricing),
    maximumPayoff(pricing),
  );
  return {
    premiumUsd,
    premiumPerUnit6: toUsdg6(premiumUsd, input.side),
    fairValueUsd,
    volatility: resolved.volatility,
    ivSource: resolved.source,
    spreadBps,
  };
}

function toUsdg6(value: number, side: "buy" | "sell-back"): bigint {
  const scaled = value * 1_000_000;
  if (!Number.isFinite(scaled) || scaled < 0 || scaled > Number.MAX_SAFE_INTEGER) {
    throw new Error("Premium cannot be represented safely as USDG-6");
  }
  return BigInt(side === "buy" ? Math.ceil(scaled) : Math.floor(scaled));
}

function resolveVolatility(input: QuotePolicyInput): {
  volatility: number;
  source: IvSource;
} {
  const fresh = input.ivObservations.filter(
    (item) =>
      item.observedAtSeconds <= input.nowSeconds &&
      input.nowSeconds - item.observedAtSeconds <= input.maximumIvAgeSeconds &&
      Number.isFinite(item.annualizedVolatility) &&
      item.annualizedVolatility > 0,
  );
  const external = fresh.find((item) => item.source === "external-implied");
  const peer = fresh.find((item) => item.source === "sector-peer");
  const basket = fresh.find((item) => item.source === "basket-realized");
  const selected = external ?? peer ?? basket;
  if (!selected) throw new Error("IV_UNAVAILABLE");

  let volatility = selected.annualizedVolatility;
  if (selected.source === "sector-peer") volatility *= input.sectorPeerMultiplier;
  if (selected.source === "basket-realized") volatility += input.basketPremium;
  return { volatility: Math.max(volatility, input.minimumVolatility), source: selected.source };
}

function resolveSpreadBps(input: QuotePolicyInput): number {
  const widening = Math.round(
    input.utilizationWideningBpsAtMaximum * input.utilizationBps / BPS,
  );
  return Math.min(input.baseSpreadBps + widening, BPS - 1);
}

function validatePolicy(input: QuotePolicyInput): void {
  if (!Number.isSafeInteger(input.nowSeconds) || input.nowSeconds <= 0) {
    throw new Error("Invalid quote timestamp");
  }
  if (!Number.isSafeInteger(input.maximumIvAgeSeconds) || input.maximumIvAgeSeconds <= 0) {
    throw new Error("Invalid IV age");
  }
  if (!Number.isFinite(input.minimumVolatility) || input.minimumVolatility <= 0 || input.minimumVolatility > 10) {
    throw new Error("Invalid minimum volatility");
  }
  if (!Number.isSafeInteger(input.baseSpreadBps) || input.baseSpreadBps < 0 || input.baseSpreadBps >= BPS) {
    throw new Error("Invalid base spread");
  }
  if (
    !Number.isInteger(input.utilizationBps) ||
    input.utilizationBps < 0 ||
    input.utilizationBps > BPS
  ) {
    throw new Error("Invalid utilization");
  }
  if (
    !Number.isInteger(input.utilizationWideningBpsAtMaximum) ||
    input.utilizationWideningBpsAtMaximum < 0 ||
    input.utilizationWideningBpsAtMaximum >= BPS
  ) {
    throw new Error("Invalid utilization spread");
  }
  if (!Number.isFinite(input.sectorPeerMultiplier) || input.sectorPeerMultiplier < 1) {
    throw new Error("Invalid sector-peer multiplier");
  }
  if (!Number.isFinite(input.basketPremium) || input.basketPremium < 0) {
    throw new Error("Invalid basket premium");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
