import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

function fail(message: string): never {
  throw new Error(`Core activation verification failed: ${message}`);
}

function loadEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail(`invalid environment assignment in ${path}`);
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) fail(`${key} is required`);
  return value;
}

function requirePrivateKey(values: ReadonlyMap<string, string>): `0x${string}` {
  const value = required(values, "DEPLOYER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) fail("DEPLOYER_PRIVATE_KEY is invalid");
  return value as `0x${string}`;
}

function cast(arguments_: readonly string[]): string {
  return execFileSync("cast", arguments_, { encoding: "utf8" }).trim();
}

function call(rpcUrl: string, address: string, signature: string, args: readonly string[] = []): string {
  return cast(["call", address, signature, ...args, "--rpc-url", rpcUrl]);
}

function expectEqual(label: string, actual: string, expected: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    fail(`${label}: expected ${expected}, observed ${actual}`);
  }
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: verify-core-activation.ts <environment-file>");

const values = loadEnvironment(environmentPath);
const rpcUrl = required(values, "RPC_URL");
const chainId = required(values, "CHAIN_ID");
expectEqual("RPC chain ID", cast(["chain-id", "--rpc-url", rpcUrl]), chainId);

const timelock = required(values, "TIMELOCK_ADDRESS");
const vault = required(values, "FLOATS_VAULT_ADDRESS");
const feeModule = required(values, "FEE_MODULE_ADDRESS");
const rebalancer = required(values, "REBALANCER_ADDRESS");
const swapAdapter = required(values, "SWAP_ADAPTER_ADDRESS");
const admin = required(values, "ADMIN_ADDRESS");
const guardian = required(values, "GUARDIAN_ADDRESS");
const keeper = required(values, "KEEPER_ADDRESS");
const treasury = required(values, "TREASURY_ADDRESS");

expectEqual("timelock delay", call(rpcUrl, timelock, "getMinDelay()(uint256)"), "300");
expectEqual("vault owner", call(rpcUrl, vault, "owner()(address)"), timelock);
expectEqual("vault guardian", call(rpcUrl, vault, "guardian()(address)"), guardian);
expectEqual("vault fee module", call(rpcUrl, vault, "feeModule()(address)"), feeModule);
expectEqual("vault rebalancer", call(rpcUrl, vault, "rebalancer()(address)"), rebalancer);
expectEqual("fee treasury", call(rpcUrl, feeModule, "treasury()(address)"), treasury);
expectEqual("swap executor", call(rpcUrl, swapAdapter, "isExecutor(address)(bool)", [rebalancer]), "true");
expectEqual("keeper authorization", call(rpcUrl, rebalancer, "isKeeper(address)(bool)", [keeper]), "true");

const proposerRole = call(rpcUrl, timelock, "PROPOSER_ROLE()(bytes32)");
const executorRole = call(rpcUrl, timelock, "EXECUTOR_ROLE()(bytes32)");
const cancellerRole = call(rpcUrl, timelock, "CANCELLER_ROLE()(bytes32)");
expectEqual("admin proposer role", call(rpcUrl, timelock, "hasRole(bytes32,address)(bool)", [proposerRole, admin]), "true");
expectEqual("admin executor role", call(rpcUrl, timelock, "hasRole(bytes32,address)(bool)", [executorRole, admin]), "true");

const deployer = privateKeyToAccount(requirePrivateKey(values)).address;
expectEqual("deployer proposer revoked", call(rpcUrl, timelock, "hasRole(bytes32,address)(bool)", [proposerRole, deployer]), "false");
expectEqual("deployer canceller revoked", call(rpcUrl, timelock, "hasRole(bytes32,address)(bool)", [cancellerRole, deployer]), "false");
expectEqual("deployer executor revoked", call(rpcUrl, timelock, "hasRole(bytes32,address)(bool)", [executorRole, deployer]), "false");

const rates = call(rpcUrl, feeModule, "rates()(uint16,uint16,uint16,uint16)").split(/\s+/);
const expectedRates = ["MANAGEMENT_FEE_BPS", "CASH_FEE_BPS", "IN_KIND_FEE_BPS", "OFF_HOURS_FEE_BPS"];
if (rates.length !== expectedRates.length) fail("fee rate response shape is invalid");
expectedRates.forEach((key, index) => expectEqual(key, rates[index]!, required(values, key)));

console.log(`Verified Core activation on chain ${chainId}`);
