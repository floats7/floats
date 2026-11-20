import { readFileSync } from "node:fs";
import { createPublicClient, formatUnits, getAddress, http, parseAbi, type Address } from "viem";

const vaultAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function tvlCap() view returns (uint256)",
  "function targetBufferBps() view returns (uint256)",
  "function depositsPaused() view returns (bool)",
]);
const strategyAbi = parseAbi(["function morphoVault() view returns (address)"]);
const morphoVaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function maxDeposit(address receiver) view returns (uint256)",
]);

const DEFAULT_INTERVAL_MS = 600_000;
const BPS = 10_000n;

function fail(message: string): never {
  throw new Error(`fUSD capacity monitor failed: ${message}`);
}

function readEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) fail(`${key} is required`);
  return value;
}

function address(values: ReadonlyMap<string, string>, key: string): Address {
  try { return getAddress(required(values, key)); } catch { fail(`${key} is not a valid address`); }
}

function positiveInteger(rawValue: string, label: string): number {
  if (!/^\d+$/.test(rawValue)) fail(`${label} must be a positive integer`);
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer`);
  return value;
}

const args = process.argv.slice(2);
const environmentPath = args.find((arg) => !arg.startsWith("--"));
const watch = args.includes("--watch");
if (!environmentPath) fail("usage: monitor-fusd-capacity.ts <environment-file> [--watch]");

const values = readEnvironment(environmentPath);
if (required(values, "APP_ENV") !== "mainnet" || required(values, "CHAIN_ID") !== "4663") {
  fail("Robinhood Chain mainnet is required");
}

const rpcUrl = required(values, "RPC_URL");
const usdg = address(values, "USDG_ADDRESS");
const vault = address(values, "FUSD_VAULT_ADDRESS");
const strategy = address(values, "FUSD_STRATEGY_ADDRESS");
const configuredMorphoVault = address(values, "FUSD_MORPHO_VAULT_ADDRESS");
const intervalMs = positiveInteger(values.get("FUSD_CAPACITY_MONITOR_INTERVAL_MS") ?? String(DEFAULT_INTERVAL_MS), "FUSD_CAPACITY_MONITOR_INTERVAL_MS");
if (intervalMs < DEFAULT_INTERVAL_MS) fail("monitor interval must not be shorter than 600000 ms");

const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8_000 }) });
let previousReady: boolean | undefined;

async function observe(): Promise<void> {
  const [blockNumber, totalAssets, tvlCap, targetBufferBps, depositsPaused, observedMorphoVault] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "tvlCap" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "targetBufferBps" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "depositsPaused" }),
    client.readContract({ address: strategy, abi: strategyAbi, functionName: "morphoVault" }),
  ]);
  if (getAddress(observedMorphoVault) !== configuredMorphoVault) fail("strategy Morpho vault does not match configuration");

  const [morphoAsset, externalCapacity] = await Promise.all([
    client.readContract({ address: configuredMorphoVault, abi: morphoVaultAbi, functionName: "asset" }),
    client.readContract({ address: configuredMorphoVault, abi: morphoVaultAbi, functionName: "maxDeposit", args: [strategy] }),
  ]);
  if (getAddress(morphoAsset) !== usdg) fail("Morpho vault asset is not canonical USDG");

  const remainingInternalCapacity = tvlCap > totalAssets ? tvlCap - totalAssets : 0n;
  const strategyAllocationBps = BPS - targetBufferBps;
  const externalCapacityRequired = remainingInternalCapacity * strategyAllocationBps / BPS;
  const ready = externalCapacityRequired === 0n
    || (externalCapacity > 0n && externalCapacity >= externalCapacityRequired);
  const changed = previousReady !== undefined && previousReady !== ready;
  previousReady = ready;

  console.log(JSON.stringify({
    observedAt: new Date().toISOString(),
    blockNumber: blockNumber.toString(),
    vault,
    strategy,
    morphoVault: configuredMorphoVault,
    depositsPaused,
    totalAssets6: totalAssets.toString(),
    tvlCap6: tvlCap.toString(),
    remainingInternalCapacity6: remainingInternalCapacity.toString(),
    targetBufferBps: targetBufferBps.toString(),
    externalCapacity6: externalCapacity.toString(),
    externalCapacityRequired6: externalCapacityRequired.toString(),
    externalCapacity: `${formatUnits(externalCapacity, 6)} USDG`,
    readyForCanary: ready,
    stateChanged: changed,
  }));
}

await observe();
if (watch) {
  setInterval(() => {
    void observe().catch((error: unknown) => {
      console.error(JSON.stringify({ observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
    });
  }, intervalMs);
}
