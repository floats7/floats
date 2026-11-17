import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { calculateDeploymentSourceHash } from "./deployment-source.ts";

type Address = `0x${string}`;

const contractAddresses = {
  timelock: "TIMELOCK_ADDRESS",
  indexRegistry: "INDEX_REGISTRY_ADDRESS",
  navOracle: "NAV_ORACLE_ADDRESS",
  swapQuoteOracle: "SWAP_QUOTE_ORACLE_ADDRESS",
  swapAdapter: "SWAP_ADAPTER_ADDRESS",
  floatsVault: "FLOATS_VAULT_ADDRESS",
  feeModule: "FEE_MODULE_ADDRESS",
  rebalancer: "REBALANCER_ADDRESS",
} as const;

const addressPattern = /^0x[0-9a-fA-F]{40}$/;

function fail(message: string): never {
  throw new Error(`Manifest generation failed: ${message}`);
}

function parseEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const [index, rawLine] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail(`invalid assignment at ${path}:${index + 1}`);
    const key = line.slice(0, separator);
    if (values.has(key)) fail(`duplicate variable ${key}`);
    values.set(key, line.slice(separator + 1));
  }
  return values;
}

function requireValue(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) fail(`${key} is required`);
  return value;
}

function requireAddress(values: ReadonlyMap<string, string>, key: string): Address {
  const value = requireValue(values, key);
  if (!addressPattern.test(value) || /^0x0{40}$/i.test(value)) fail(`${key} is invalid`);
  return value as Address;
}

function requireInteger(values: ReadonlyMap<string, string>, key: string): number {
  const value = requireValue(values, key);
  if (!/^\d+$/.test(value)) fail(`${key} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(`${key} exceeds the safe integer range`);
  return parsed;
}

function requirePrivateKey(values: ReadonlyMap<string, string>): `0x${string}` {
  const value = requireValue(values, "DEPLOYER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) fail("DEPLOYER_PRIVATE_KEY is invalid");
  return value as `0x${string}`;
}

function cast(arguments_: readonly string[]): string {
  return execFileSync("cast", arguments_, { encoding: "utf8" }).trim();
}

const [, , environmentPath, outputPath] = process.argv;
if (!environmentPath || !outputPath) {
  fail("usage: generate-deployment-manifest.ts <environment-file> <output-file>");
}

const values = parseEnvironment(environmentPath);
const environment = requireValue(values, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") fail("APP_ENV is invalid");
const chainId = requireInteger(values, "CHAIN_ID");
const expectedChainId = environment === "testnet" ? 46630 : 4663;
if (chainId !== expectedChainId) fail("APP_ENV and CHAIN_ID do not match");

const rpcUrl = requireValue(values, "RPC_URL");
if (Number(cast(["chain-id", "--rpc-url", rpcUrl])) !== chainId) fail("RPC chain ID mismatch");

const addresses = Object.fromEntries(
  Object.entries(contractAddresses).map(([name, key]) => [name, requireAddress(values, key)]),
) as Record<keyof typeof contractAddresses, Address>;

const deployerAddress = privateKeyToAccount(requirePrivateKey(values)).address;

const blockNumber = requireInteger(values, "INDEXER_START_BLOCK");
const blockJson = JSON.parse(cast(["block", String(blockNumber), "--json", "--rpc-url", rpcUrl])) as {
  timestamp?: string;
  data?: { timestamp?: string };
};
const blockTimestamp = blockJson.timestamp ?? blockJson.data?.timestamp;
if (!blockTimestamp) fail("deployment block timestamp is missing");
const deployedAt = new Date(Number(BigInt(blockTimestamp)) * 1000).toISOString();

const constructorArguments: Record<keyof typeof contractAddresses, readonly unknown[]> = {
  timelock: [
    300,
    [requireAddress(values, "ADMIN_ADDRESS"), deployerAddress],
    [requireAddress(values, "ADMIN_ADDRESS"), deployerAddress],
    "0x0000000000000000000000000000000000000000",
  ],
  indexRegistry: [addresses.timelock, 300],
  navOracle: [addresses.timelock],
  swapQuoteOracle: [requireAddress(values, "USDG_ADDRESS"), addresses.navOracle],
  swapAdapter: [addresses.timelock, addresses.swapQuoteOracle],
  floatsVault: [
    requireAddress(values, "USDG_ADDRESS"),
    addresses.timelock,
    requireAddress(values, "GUARDIAN_ADDRESS"),
    addresses.indexRegistry,
    addresses.navOracle,
    requireValue(values, "INITIAL_TVL_CAP"),
    "Floats IPO Index",
    "fIPO",
  ],
  feeModule: [
    addresses.timelock,
    addresses.floatsVault,
    requireAddress(values, "TREASURY_ADDRESS"),
    {
      managementBps: requireInteger(values, "MANAGEMENT_FEE_BPS"),
      cashBps: requireInteger(values, "CASH_FEE_BPS"),
      inKindBps: requireInteger(values, "IN_KIND_FEE_BPS"),
      offHoursBps: requireInteger(values, "OFF_HOURS_FEE_BPS"),
    },
  ],
  rebalancer: [addresses.timelock, addresses.floatsVault, addresses.swapAdapter],
};

const contracts = Object.fromEntries(
  Object.entries(addresses).map(([name, address]) => [
    name,
    {
      address,
      codeHash: cast(["codehash", address, "--rpc-url", rpcUrl]),
      constructorArguments: constructorArguments[name as keyof typeof contractAddresses],
    },
  ]),
);

const manifest = {
  environment,
  chainId,
  version: requireValue(values, "DEPLOYMENT_VERSION"),
  sourceHash: calculateDeploymentSourceHash(),
  deployedAt,
  deploymentBlock: blockNumber,
  contracts,
  roles: {
    admin: requireAddress(values, "ADMIN_ADDRESS"),
    timelock: addresses.timelock,
    guardian: requireAddress(values, "GUARDIAN_ADDRESS"),
    keeper: requireAddress(values, "KEEPER_ADDRESS"),
    treasury: requireAddress(values, "TREASURY_ADDRESS"),
    timelockDelaySeconds: 300,
  },
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(`Generated ${environment} deployment manifest at ${outputPath}`);
