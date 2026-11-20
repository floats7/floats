import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const timelockAbi = parseAbi([
  "function getMinDelay() view returns (uint256)",
  "function hashOperation(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt) view returns (bytes32)",
  "function schedule(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt,uint256 delay)",
  "function execute(address target,uint256 value,bytes data,bytes32 predecessor,bytes32 salt) payable",
]);
const vaultAbi = parseAbi([
  "function depositsPaused() view returns (bool)",
  "function strategyActive() view returns (bool)",
  "function setDepositsPaused(bool paused)",
  "function deposit(uint256 assets,address receiver) returns (uint256 shares)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256 assets)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function targetBufferBps() view returns (uint256)",
  "function queuedWithdrawalAssets() view returns (uint256)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const strategyAbi = parseAbi(["function morphoVault() view returns (address)"]);
const morphoVaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function maxDeposit(address receiver) view returns (uint256)",
]);
const MAXIMUM_CANARY_ASSETS = 10_000n; // 0.01 USDG
const MINIMUM_ADMIN_GAS_WEI = 100_000_000_000_000n;
const MINIMUM_GUARDIAN_GAS_WEI = 50_000_000_000_000n;
const BPS = 10_000n;

function fail(message: string): never {
  throw new Error(`fUSD canary failed: ${message}`);
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

function privateKey(values: ReadonlyMap<string, string>, key: string): Hex {
  const value = required(values, key);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) fail(`${key} is invalid`);
  return value as Hex;
}

function integer(values: ReadonlyMap<string, string>, key: string): bigint {
  const value = required(values, key);
  if (!/^\d+$/.test(value)) fail(`${key} must be an unsigned integer`);
  return BigInt(value);
}

const [environmentPath, action] = process.argv.slice(2);
if (!environmentPath || !["schedule", "execute"].includes(action ?? "")) {
  fail("usage: run-fusd-canary.ts <environment-file> <schedule|execute>");
}
const values = readEnvironment(environmentPath);
if (required(values, "APP_ENV") !== "mainnet" || integer(values, "CHAIN_ID") !== 4663n) fail("mainnet is required");

const rpcUrl = required(values, "RPC_URL");
const vault = address(values, "FUSD_VAULT_ADDRESS");
const timelock = address(values, "TIMELOCK_ADDRESS");
const usdg = address(values, "USDG_ADDRESS");
const strategy = address(values, "FUSD_STRATEGY_ADDRESS");
const configuredMorphoVault = address(values, "FUSD_MORPHO_VAULT_ADDRESS");
const amount = integer(values, "FUSD_CANARY_USDG_AMOUNT");
const sequence = integer(values, "FUSD_CANARY_SEQUENCE");
if (amount === 0n || amount > MAXIMUM_CANARY_ASSETS) fail("canary amount must be between 0.000001 and 0.01 USDG");
if (sequence === 0n) fail("FUSD_CANARY_SEQUENCE must be greater than zero");

const admin = privateKeyToAccount(privateKey(values, "ADMIN_PRIVATE_KEY"));
const guardian = privateKeyToAccount(privateKey(values, "GUARDIAN_PRIVATE_KEY"));
if (admin.address !== address(values, "ADMIN_ADDRESS")) fail("ADMIN_PRIVATE_KEY does not match ADMIN_ADDRESS");
if (guardian.address !== address(values, "GUARDIAN_ADDRESS")) fail("GUARDIAN_PRIVATE_KEY does not match GUARDIAN_ADDRESS");

const transport = http(rpcUrl, { timeout: 12_000 });
const publicClient = createPublicClient({ transport });
const adminClient = createWalletClient({ account: admin, transport });
const guardianClient = createWalletClient({ account: guardian, transport });
const unpauseSalt = keccak256(stringToHex(`FLOATS_FUSD_MAINNET_CANARY_UNPAUSE_V${sequence}`));
const unpauseData = encodeFunctionData({ abi: vaultAbi, functionName: "setDepositsPaused", args: [false] });
const operation = { target: vault, value: 0n, data: unpauseData, predecessor: zeroHash, salt: unpauseSalt } as const;

async function requireGasReserves(): Promise<void> {
  const [adminGas, guardianGas] = await Promise.all([
    publicClient.getBalance({ address: admin.address }),
    publicClient.getBalance({ address: guardian.address }),
  ]);
  if (adminGas < MINIMUM_ADMIN_GAS_WEI) fail("admin gas reserve is below 0.0001 ETH");
  if (guardianGas < MINIMUM_GUARDIAN_GAS_WEI) fail("guardian gas reserve is below 0.00005 ETH");
}

async function requireExternalCapacity(): Promise<void> {
  const [observedMorphoVault, morphoAsset, totalAssets, targetBufferBps, queuedWithdrawals, liquidAssets] = await Promise.all([
    publicClient.readContract({ address: strategy, abi: strategyAbi, functionName: "morphoVault" }),
    publicClient.readContract({ address: configuredMorphoVault, abi: morphoVaultAbi, functionName: "asset" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "totalAssets" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "targetBufferBps" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "queuedWithdrawalAssets" }),
    publicClient.readContract({ address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
  ]);
  if (getAddress(observedMorphoVault) !== configuredMorphoVault) fail("strategy Morpho vault does not match configuration");
  if (getAddress(morphoAsset) !== usdg) fail("Morpho vault asset is not canonical USDG");

  const externalCapacity = await publicClient.readContract({
    address: configuredMorphoVault,
    abi: morphoVaultAbi,
    functionName: "maxDeposit",
    args: [strategy],
  });
  const postDepositAssets = totalAssets + amount;
  const requiredLiquidAssets = queuedWithdrawals + postDepositAssets * targetBufferBps / BPS;
  const postDepositLiquidAssets = liquidAssets + amount;
  const requiredStrategyDeposit = postDepositLiquidAssets > requiredLiquidAssets
    ? postDepositLiquidAssets - requiredLiquidAssets
    : 0n;
  if (requiredStrategyDeposit === 0n) return;
  if (externalCapacity === 0n) fail("external Morpho deposit capacity is zero");
  if (externalCapacity < requiredStrategyDeposit) {
    fail(`external Morpho capacity ${externalCapacity} is below required allocation ${requiredStrategyDeposit}`);
  }
}

async function confirmed(hash: Hex): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success") fail(`transaction ${hash} reverted`);
}

if (action === "schedule") {
  await requireGasReserves();
  await requireExternalCapacity();
  if (!(await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "depositsPaused" }))) fail("vault must start paused");
  const delay = await publicClient.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" });
  const operationId = await publicClient.readContract({ address: timelock, abi: timelockAbi, functionName: "hashOperation", args: [operation.target, operation.value, operation.data, operation.predecessor, operation.salt] });
  const hash = await adminClient.writeContract({ chain: null, address: timelock, abi: timelockAbi, functionName: "schedule", args: [operation.target, operation.value, operation.data, operation.predecessor, operation.salt, delay] });
  await confirmed(hash);
  console.log(JSON.stringify({ stage: "scheduled", operationId, transactionHash: hash, delaySeconds: delay.toString() }, null, 2));
} else {
  await requireGasReserves();
  await requireExternalCapacity();
  if (!(await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "depositsPaused" }))) fail("vault must be paused before execution");
  if (!(await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "strategyActive" }))) fail("strategy must be active");
  const initialUsdg = await publicClient.readContract({ address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [admin.address] });
  if (initialUsdg < amount) fail("admin USDG balance is below canary amount");

  const transactions: Hex[] = [];
  try {
    const executeHash = await adminClient.writeContract({ chain: null, address: timelock, abi: timelockAbi, functionName: "execute", args: [operation.target, operation.value, operation.data, operation.predecessor, operation.salt] });
    transactions.push(executeHash);
    await confirmed(executeHash);

    const approveHash = await adminClient.writeContract({ chain: null, address: usdg, abi: erc20Abi, functionName: "approve", args: [vault, amount] });
    transactions.push(approveHash);
    await confirmed(approveHash);

    const sharesBefore = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [admin.address] });
    const depositHash = await adminClient.writeContract({ chain: null, address: vault, abi: vaultAbi, functionName: "deposit", args: [amount, admin.address] });
    transactions.push(depositHash);
    await confirmed(depositHash);
    const sharesAfter = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [admin.address] });
    const mintedShares = sharesAfter - sharesBefore;
    if (mintedShares === 0n) fail("deposit minted zero shares");

    const redeemHash = await adminClient.writeContract({ chain: null, address: vault, abi: vaultAbi, functionName: "redeem", args: [mintedShares, admin.address, admin.address] });
    transactions.push(redeemHash);
    await confirmed(redeemHash);
  } finally {
    if (!(await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "depositsPaused" }))) {
      const pauseHash = await guardianClient.writeContract({ chain: null, address: vault, abi: vaultAbi, functionName: "setDepositsPaused", args: [true] });
      transactions.push(pauseHash);
      await confirmed(pauseHash);
    }
  }

  const finalUsdg = await publicClient.readContract({ address: usdg, abi: erc20Abi, functionName: "balanceOf", args: [admin.address] });
  const finalShares = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [admin.address] });
  const paused = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "depositsPaused" });
  if (!paused || finalShares !== 0n) fail("post-canary invariants failed");
  console.log(JSON.stringify({ stage: "completed", transactions, initialUsdg: initialUsdg.toString(), finalUsdg: finalUsdg.toString(), finalShares: finalShares.toString(), depositsPaused: paused }, null, 2));
}
