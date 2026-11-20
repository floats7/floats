import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const vaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function governance() view returns (address)",
  "function guardian() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function strategy() view returns (address)",
  "function strategyActive() view returns (bool)",
  "function depositsPaused() view returns (bool)",
  "function tvlCap() view returns (uint256)",
  "function targetBufferBps() view returns (uint256)",
  "function performanceFeeBps() view returns (uint256)",
]);
const strategyAbi = parseAbi([
  "function asset() view returns (address)",
  "function morphoVault() view returns (address)",
  "function fusdVault() view returns (address)",
]);
const oracleAbi = parseAbi(["function fusd() view returns (address)"]);

function fail(message: string): never {
  throw new Error(`fUSD deployment verification failed: ${message}`);
}

function parseEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
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
  if (!/^\d+$/.test(value)) fail(`${key} must be an integer`);
  return BigInt(value);
}

function equal(label: string, actual: unknown, expected: unknown): void {
  const normalizedActual = typeof actual === "string" ? actual.toLowerCase() : actual;
  const normalizedExpected = typeof expected === "string" ? expected.toLowerCase() : expected;
  if (normalizedActual !== normalizedExpected) {
    fail(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: verify-fusd-deployment.ts <environment-file>");
const values = parseEnvironment(environmentPath);
if (required(values, "APP_ENV") !== "mainnet" || integer(values, "CHAIN_ID") !== 4663n) {
  fail("mainnet environment is required");
}

const client = createPublicClient({
  transport: http(required(values, "RPC_URL"), { timeout: 8_000 }),
});
const expected = {
  vault: address(values, "FUSD_VAULT_ADDRESS"),
  strategy: address(values, "FUSD_STRATEGY_ADDRESS"),
  oracle: address(values, "FUSD_RATE_ORACLE_ADDRESS"),
  usdg: address(values, "USDG_ADDRESS"),
  morpho: address(values, "FUSD_MORPHO_VAULT_ADDRESS"),
  governance: address(values, "TIMELOCK_ADDRESS"),
  guardian: address(values, "GUARDIAN_ADDRESS"),
  treasury: address(values, "TREASURY_ADDRESS"),
};

for (const [name, contract] of Object.entries({
  vault: expected.vault,
  strategy: expected.strategy,
  oracle: expected.oracle,
})) {
  const code = await client.getCode({ address: contract });
  if (!code || code === "0x") fail(`${name} has no bytecode`);
}

async function read(contract: Address, abi: readonly unknown[], functionName: string) {
  return await client.readContract({ address: contract, abi, functionName } as never);
}

equal("vault.asset", await read(expected.vault, vaultAbi, "asset"), expected.usdg);
equal("vault.governance", await read(expected.vault, vaultAbi, "governance"), expected.governance);
equal("vault.guardian", await read(expected.vault, vaultAbi, "guardian"), expected.guardian);
equal("vault.feeRecipient", await read(expected.vault, vaultAbi, "feeRecipient"), expected.treasury);
equal("vault.strategy", await read(expected.vault, vaultAbi, "strategy"), expected.strategy);
equal("vault.strategyActive", await read(expected.vault, vaultAbi, "strategyActive"), true);
equal("vault.depositsPaused", await read(expected.vault, vaultAbi, "depositsPaused"), true);
equal("vault.tvlCap", await read(expected.vault, vaultAbi, "tvlCap"), integer(values, "FUSD_INITIAL_TVL_CAP"));
equal("vault.targetBufferBps", await read(expected.vault, vaultAbi, "targetBufferBps"), integer(values, "FUSD_TARGET_BUFFER_BPS"));
equal("vault.performanceFeeBps", await read(expected.vault, vaultAbi, "performanceFeeBps"), integer(values, "FUSD_PERFORMANCE_FEE_BPS"));
equal("strategy.asset", await read(expected.strategy, strategyAbi, "asset"), expected.usdg);
equal("strategy.morphoVault", await read(expected.strategy, strategyAbi, "morphoVault"), expected.morpho);
equal("strategy.fusdVault", await read(expected.strategy, strategyAbi, "fusdVault"), expected.vault);
equal("oracle.fusd", await read(expected.oracle, oracleAbi, "fusd"), expected.vault);

console.log("Verified paused fUSD mainnet deployment and complete strategy wiring");
