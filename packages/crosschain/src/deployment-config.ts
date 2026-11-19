import type { Address } from "./message.ts";

export type CrossChainEnvironment = "testnet" | "mainnet";

export interface LayerZeroNetworkConfig {
  readonly name: string;
  readonly chainId: number;
  readonly eid: number;
  readonly rpcUrl: URL;
  readonly explorerUrl: URL;
  readonly endpointV2: Address;
}

export interface OftPathConfig {
  readonly tokenSymbol: string;
  readonly hubContract: Address;
  readonly spokeContract: Address;
}

export interface CrossChainDeploymentConfig {
  readonly environment: CrossChainEnvironment;
  readonly hub: LayerZeroNetworkConfig;
  readonly spoke: LayerZeroNetworkConfig;
  readonly paths: readonly OftPathConfig[];
}

export function parseCrossChainDeploymentConfig(
  raw: string,
  expectedEnvironment: CrossChainEnvironment,
): CrossChainDeploymentConfig {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("CROSSCHAIN_DEPLOYMENT_CONFIG_JSON_INVALID");
  }
  const record = object(input, "CONFIG");
  const environment = text(record.environment, "ENVIRONMENT");
  if (environment !== "testnet" && environment !== "mainnet") {
    throw new Error("CROSSCHAIN_ENVIRONMENT_INVALID");
  }
  if (environment !== expectedEnvironment) {
    throw new Error("CROSSCHAIN_ENVIRONMENT_MISMATCH");
  }

  const hub = network(record.hub, "HUB");
  const spoke = network(record.spoke, "SPOKE");
  if (hub.chainId === spoke.chainId || hub.eid === spoke.eid) {
    throw new Error("CROSSCHAIN_NETWORK_IDENTITY_COLLISION");
  }

  if (!Array.isArray(record.paths) || record.paths.length === 0) {
    throw new Error("CROSSCHAIN_PATHS_REQUIRED");
  }
  const symbols = new Set<string>();
  const contracts = new Set<string>();
  const paths = record.paths.map((value, index) => {
    const path = object(value, `PATH_${index}`);
    const tokenSymbol = text(path.tokenSymbol, `PATH_${index}_TOKEN_SYMBOL`);
    if (!/^[A-Z][A-Z0-9]{0,15}$/.test(tokenSymbol)) {
      throw new Error(`CROSSCHAIN_PATH_${index}_TOKEN_SYMBOL_INVALID`);
    }
    if (symbols.has(tokenSymbol)) throw new Error(`CROSSCHAIN_PATH_DUPLICATE:${tokenSymbol}`);
    symbols.add(tokenSymbol);
    const hubContract = address(path.hubContract, `PATH_${index}_HUB_CONTRACT`);
    const spokeContract = address(path.spokeContract, `PATH_${index}_SPOKE_CONTRACT`);
    for (const contract of [hubContract, spokeContract]) {
      if (contracts.has(contract)) throw new Error(`CROSSCHAIN_CONTRACT_DUPLICATE:${contract}`);
      contracts.add(contract);
    }
    return { tokenSymbol, hubContract, spokeContract };
  });
  return { environment, hub, spoke, paths };
}

function network(value: unknown, label: string): LayerZeroNetworkConfig {
  const input = object(value, label);
  return {
    name: named(input.name, `${label}_NAME`),
    chainId: positiveInteger(input.chainId, `${label}_CHAIN_ID`),
    eid: positiveInteger(input.eid, `${label}_EID`),
    rpcUrl: httpsUrl(input.rpcUrl, `${label}_RPC_URL`),
    explorerUrl: httpsUrl(input.explorerUrl, `${label}_EXPLORER_URL`),
    endpointV2: address(input.endpointV2, `${label}_ENDPOINT_V2`),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CROSSCHAIN_${label}_INVALID`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`CROSSCHAIN_${label}_INVALID`);
  return value.trim();
}

function named(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(result)) {
    throw new Error(`CROSSCHAIN_${label}_INVALID`);
  }
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`CROSSCHAIN_${label}_INVALID`);
  }
  return value as number;
}

function httpsUrl(value: unknown, label: string): URL {
  let result: URL;
  try {
    result = new URL(text(value, label));
  } catch {
    throw new Error(`CROSSCHAIN_${label}_INVALID`);
  }
  if (result.protocol !== "https:") throw new Error(`CROSSCHAIN_${label}_HTTPS_REQUIRED`);
  return result;
}

function address(value: unknown, label: string): Address {
  const result = text(value, label).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(result) || /^0x0{40}$/.test(result)) {
    throw new Error(`CROSSCHAIN_${label}_INVALID`);
  }
  return result as Address;
}
