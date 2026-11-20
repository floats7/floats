import { readFileSync } from "node:fs";
import { createPublicClient, formatEther, formatUnits, getAddress, http, parseAbi, type Address } from "viem";

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);
const vaultAbi = parseAbi([
  "function depositsPaused() view returns (bool)",
  "function strategyActive() view returns (bool)",
  "function maxDeposit(address receiver) view returns (uint256)",
  "function previewDeposit(uint256 assets) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function tvlCap() view returns (uint256)",
  "function targetBufferBps() view returns (uint256)",
  "function queuedWithdrawalAssets() view returns (uint256)",
]);
const strategyAbi = parseAbi([
  "function morphoVault() view returns (address)",
]);
const morphoVaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function maxDeposit(address receiver) view returns (uint256)",
]);
const BPS = 10_000n;
const MINIMUM_ADMIN_GAS_WEI = 100_000_000_000_000n; // 0.0001 ETH; over 2x the measured lifecycle cost.
const MINIMUM_GUARDIAN_GAS_WEI = 50_000_000_000_000n; // 0.00005 ETH emergency-pause reserve.

function fail(message: string): never {
  throw new Error(`fUSD canary preflight failed: ${message}`);
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
  try {
    return getAddress(required(values, key));
  } catch {
    fail(`${key} is not a valid address`);
  }
}

function integer(values: ReadonlyMap<string, string>, key: string): bigint {
  const value = required(values, key);
  if (!/^\d+$/.test(value)) fail(`${key} must be an unsigned integer`);
  return BigInt(value);
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: preflight-fusd-canary.ts <environment-file>");
const values = readEnvironment(environmentPath);
if (required(values, "APP_ENV") !== "mainnet" || integer(values, "CHAIN_ID") !== 4663n) {
  fail("Robinhood Chain mainnet is required");
}

const account = address(values, "ADMIN_ADDRESS");
const guardian = address(values, "GUARDIAN_ADDRESS");
const usdg = address(values, "USDG_ADDRESS");
const vault = address(values, "FUSD_VAULT_ADDRESS");
const strategy = address(values, "FUSD_STRATEGY_ADDRESS");
const configuredMorphoVault = address(values, "FUSD_MORPHO_VAULT_ADDRESS");
const amount = integer(values, "FUSD_CANARY_USDG_AMOUNT");
if (amount === 0n) fail("FUSD_CANARY_USDG_AMOUNT must be greater than zero");

const client = createPublicClient({ transport: http(required(values, "RPC_URL"), { timeout: 8_000 }) });
const [nativeBalance, guardianNativeBalance, usdgBalance, vaultUsdgBalance, depositsPaused, strategyActive, totalAssets, tvlCap, targetBufferBps, queuedWithdrawalAssets, previewShares, observedMorphoVault] = await Promise.all([
  client.getBalance({ address: account }),
  client.getBalance({ address: guardian }),
  client.readContract({ address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
  client.readContract({ address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "depositsPaused" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "strategyActive" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "tvlCap" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "targetBufferBps" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "queuedWithdrawalAssets" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "previewDeposit", args: [amount] }),
  client.readContract({ address: strategy, abi: strategyAbi, functionName: "morphoVault" }),
]);

if (getAddress(observedMorphoVault) !== configuredMorphoVault) {
  fail(`strategy Morpho vault ${observedMorphoVault} does not match FUSD_MORPHO_VAULT_ADDRESS`);
}

const [morphoAsset, externalDepositCapacity] = await Promise.all([
  client.readContract({ address: configuredMorphoVault, abi: morphoVaultAbi, functionName: "asset" }),
  client.readContract({ address: configuredMorphoVault, abi: morphoVaultAbi, functionName: "maxDeposit", args: [strategy] }),
]);
if (getAddress(morphoAsset) !== usdg) fail("Morpho vault asset is not canonical USDG");

const postDepositAssets = totalAssets + amount;
const targetLiquidAssets = postDepositAssets * targetBufferBps / BPS;
const requiredLiquidAssets = queuedWithdrawalAssets + targetLiquidAssets;
const postDepositLiquidAssets = vaultUsdgBalance + amount;
const requiredStrategyDeposit = postDepositLiquidAssets > requiredLiquidAssets
  ? postDepositLiquidAssets - requiredLiquidAssets
  : 0n;

const checks = {
  mainnet: true,
  depositsPaused,
  strategyActive,
  hasCanaryUsdg: usdgBalance >= amount,
  hasAdminGasReserve: nativeBalance >= MINIMUM_ADMIN_GAS_WEI,
  hasGuardianGasReserve: guardianNativeBalance >= MINIMUM_GUARDIAN_GAS_WEI,
  withinCap: totalAssets + amount <= tvlCap,
  nonZeroShares: previewShares > 0n,
  morphoVaultMatchesConfiguration: getAddress(observedMorphoVault) === configuredMorphoVault,
  morphoAssetIsCanonicalUsdg: getAddress(morphoAsset) === usdg,
  externalCapacityAvailable: requiredStrategyDeposit === 0n || externalDepositCapacity > 0n,
  externalCapacityCoversAllocation: externalDepositCapacity >= requiredStrategyDeposit,
};

const readyForGovernedCanary = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  account,
  amount: `${formatUnits(amount, 6)} USDG`,
  balances: {
    usdg: formatUnits(usdgBalance, 6),
    adminNativeEth: formatEther(nativeBalance),
    guardianNativeEth: formatEther(guardianNativeBalance),
    requiredAdminNativeEth: formatEther(MINIMUM_ADMIN_GAS_WEI),
    requiredGuardianNativeEth: formatEther(MINIMUM_GUARDIAN_GAS_WEI),
  },
  vault: {
    depositsPaused,
    strategyActive,
    totalAssets: formatUnits(totalAssets, 6),
    tvlCap: formatUnits(tvlCap, 6),
    previewShares: formatUnits(previewShares, 18),
    targetBufferBps: targetBufferBps.toString(),
    queuedWithdrawals: formatUnits(queuedWithdrawalAssets, 6),
  },
  strategy: {
    address: strategy,
    morphoVault: configuredMorphoVault,
    externalDepositCapacity: formatUnits(externalDepositCapacity, 6),
    requiredStrategyDeposit: formatUnits(requiredStrategyDeposit, 6),
  },
  checks,
  readyForGovernedCanary,
}, null, 2));

if (!readyForGovernedCanary) process.exitCode = 1;
