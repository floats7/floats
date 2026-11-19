import type { Address } from "./message.ts";
import type { CrossChainEnvironment } from "./deployment-config.ts";

export interface ActivationContracts {
  readonly eid: number;
  readonly fipo: Address;
  readonly floats: Address;
  readonly nav: Address;
}

export interface TokenRateLimits {
  readonly hubOutbound: bigint;
  readonly hubInbound: bigint;
  readonly spokeOutbound: bigint;
  readonly spokeInbound: bigint;
  readonly windowSeconds: number;
}

export interface CrossChainActivationConfig {
  readonly environment: CrossChainEnvironment;
  readonly hub: ActivationContracts;
  readonly spoke: ActivationContracts;
  readonly fipo: TokenRateLimits;
  readonly floats: TokenRateLimits;
}

export function parseCrossChainActivationConfig(
  raw: string,
  expectedEnvironment: CrossChainEnvironment,
): CrossChainActivationConfig {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("CROSSCHAIN_ACTIVATION_CONFIG_JSON_INVALID");
  }
  const input = record(decoded, "CONFIG");
  const environment = input.environment;
  if (environment !== "testnet" && environment !== "mainnet") {
    throw new Error("CROSSCHAIN_ACTIVATION_ENVIRONMENT_INVALID");
  }
  if (environment !== expectedEnvironment) {
    throw new Error("CROSSCHAIN_ACTIVATION_ENVIRONMENT_MISMATCH");
  }

  const hub = contracts(input.hub, "HUB");
  const spoke = contracts(input.spoke, "SPOKE");
  if (hub.eid === spoke.eid) throw new Error("CROSSCHAIN_ACTIVATION_EID_COLLISION");

  const addresses = [hub.fipo, hub.floats, hub.nav, spoke.fipo, spoke.floats, spoke.nav];
  if (new Set(addresses).size !== addresses.length) {
    throw new Error("CROSSCHAIN_ACTIVATION_CONTRACT_DUPLICATE");
  }
  return {
    environment,
    hub,
    spoke,
    fipo: limits(input.fipo, "FIPO"),
    floats: limits(input.floats, "FLOATS"),
  };
}

function contracts(value: unknown, label: string): ActivationContracts {
  const input = record(value, label);
  return {
    eid: positiveInteger(input.eid, `${label}_EID`),
    fipo: address(input.fipo, `${label}_FIPO`),
    floats: address(input.floats, `${label}_FLOATS`),
    nav: address(input.nav, `${label}_NAV`),
  };
}

function limits(value: unknown, label: string): TokenRateLimits {
  const input = record(value, label);
  return {
    hubOutbound: positiveBigInt(input.hubOutbound, `${label}_HUB_OUTBOUND`),
    hubInbound: positiveBigInt(input.hubInbound, `${label}_HUB_INBOUND`),
    spokeOutbound: positiveBigInt(input.spokeOutbound, `${label}_SPOKE_OUTBOUND`),
    spokeInbound: positiveBigInt(input.spokeInbound, `${label}_SPOKE_INBOUND`),
    windowSeconds: positiveInteger(input.windowSeconds, `${label}_WINDOW_SECONDS`),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CROSSCHAIN_ACTIVATION_${label}_INVALID`);
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > 0xffff_ffff) {
    throw new Error(`CROSSCHAIN_ACTIVATION_${label}_INVALID`);
  }
  return value as number;
}

function positiveBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`CROSSCHAIN_ACTIVATION_${label}_INVALID`);
  }
  const parsed = BigInt(value);
  if (parsed > (1n << 128n) - 1n) {
    throw new Error(`CROSSCHAIN_ACTIVATION_${label}_OVERFLOW`);
  }
  return parsed;
}

function address(value: unknown, label: string): Address {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(value) ||
    /^0x0{40}$/i.test(value)
  ) {
    throw new Error(`CROSSCHAIN_ACTIVATION_${label}_INVALID`);
  }
  return value.toLowerCase() as Address;
}
