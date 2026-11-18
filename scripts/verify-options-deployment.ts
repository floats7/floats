import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const ownableAbi = parseAbi(["function admin() view returns (address)"]);
const registryAbi = parseAbi([
  "function guardian() view returns (address)",
  "function settlementEngine() view returns (address)",
  "function isKeeper(address) view returns (bool)",
]);
const tokenAbi = parseAbi([
  "function market() view returns (address)",
  "function settlementEngine() view returns (address)",
]);
const vaultAbi = parseAbi([
  "function guardian() view returns (address)",
  "function market() view returns (address)",
  "function settlementEngine() view returns (address)",
  "function isKeeper(address) view returns (bool)",
  "function asset() view returns (address)",
]);
const verifierAbi = parseAbi([
  "function market() view returns (address)",
  "function registry() view returns (address)",
  "function isSigner(address) view returns (bool)",
]);
const engineAbi = parseAbi([
  "function market() view returns (address)",
  "function riskManager() view returns (address)",
  "function registry() view returns (address)",
  "function optionToken() view returns (address)",
  "function vault() view returns (address)",
]);
const riskAbi = parseAbi([
  "function market() view returns (address)",
  "function settlementEngine() view returns (address)",
  "function registry() view returns (address)",
  "function vault() view returns (address)",
]);
const marketAbi = parseAbi([
  "function usdg() view returns (address)",
  "function vault() view returns (address)",
  "function quoteVerifier() view returns (address)",
  "function settlementEngine() view returns (address)",
  "function optionToken() view returns (address)",
  "function riskManager() view returns (address)",
]);

function fail(message: string): never {
  throw new Error(`Options deployment verification failed: ${message}`);
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

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: verify-options-deployment.ts <environment-file>");
const values = parseEnvironment(environmentPath);
const chainId = Number(required(values, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) fail("CHAIN_ID is invalid");
const client = createPublicClient({ transport: http(required(values, "RPC_URL"), { timeout: 8_000 }) });

const expected = {
  timelock: address(values, "TIMELOCK_ADDRESS"),
  guardian: address(values, "GUARDIAN_ADDRESS"),
  keeper: address(values, "KEEPER_ADDRESS"),
  usdg: address(values, "USDG_ADDRESS"),
  signer: address(values, "OPTIONS_QUOTE_SIGNER_ADDRESS"),
  registry: address(values, "OPTIONS_SERIES_REGISTRY_ADDRESS"),
  token: address(values, "OPTION_TOKEN_ADDRESS"),
  vault: address(values, "OPTIONS_VAULT_ADDRESS"),
  verifier: address(values, "QUOTE_VERIFIER_ADDRESS"),
  engine: address(values, "OPTIONS_SETTLEMENT_ENGINE_ADDRESS"),
  risk: address(values, "OPTIONS_RISK_MANAGER_ADDRESS"),
  market: address(values, "OPTIONS_MARKET_ADDRESS"),
};

async function read(contract: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) {
  return await client.readContract({ address: contract, abi, functionName, args } as never);
}

function equal(label: string, actual: unknown, wanted: Address): void {
  if (typeof actual !== "string" || actual.toLowerCase() !== wanted.toLowerCase()) {
    fail(`${label} mismatch: expected ${wanted}, received ${String(actual)}`);
  }
}

for (const [name, contract] of Object.entries(expected).filter(([name]) => !["timelock", "guardian", "keeper", "usdg", "signer"].includes(name))) {
  const code = await client.getCode({ address: contract });
  if (!code || code === "0x") fail(`${name} has no bytecode`);
}
for (const [name, contract] of [["registry", expected.registry], ["token", expected.token], ["vault", expected.vault], ["verifier", expected.verifier], ["engine", expected.engine], ["risk", expected.risk]] as const) {
  equal(`${name}.admin`, await read(contract, ownableAbi, "admin"), expected.timelock);
}
equal("registry.guardian", await read(expected.registry, registryAbi, "guardian"), expected.guardian);
equal("registry.settlementEngine", await read(expected.registry, registryAbi, "settlementEngine"), expected.engine);
if (await read(expected.registry, registryAbi, "isKeeper", [expected.keeper]) !== true) fail("registry keeper missing");
equal("token.market", await read(expected.token, tokenAbi, "market"), expected.market);
equal("token.settlementEngine", await read(expected.token, tokenAbi, "settlementEngine"), expected.engine);
equal("vault.asset", await read(expected.vault, vaultAbi, "asset"), expected.usdg);
equal("vault.guardian", await read(expected.vault, vaultAbi, "guardian"), expected.guardian);
equal("vault.market", await read(expected.vault, vaultAbi, "market"), expected.engine);
equal("vault.settlementEngine", await read(expected.vault, vaultAbi, "settlementEngine"), expected.engine);
if (await read(expected.vault, vaultAbi, "isKeeper", [expected.keeper]) !== true) fail("vault keeper missing");
equal("verifier.market", await read(expected.verifier, verifierAbi, "market"), expected.market);
equal("verifier.registry", await read(expected.verifier, verifierAbi, "registry"), expected.registry);
if (await read(expected.verifier, verifierAbi, "isSigner", [expected.signer]) !== true) fail("quote signer missing");
equal("engine.market", await read(expected.engine, engineAbi, "market"), expected.market);
equal("engine.riskManager", await read(expected.engine, engineAbi, "riskManager"), expected.risk);
equal("engine.registry", await read(expected.engine, engineAbi, "registry"), expected.registry);
equal("engine.optionToken", await read(expected.engine, engineAbi, "optionToken"), expected.token);
equal("engine.vault", await read(expected.engine, engineAbi, "vault"), expected.vault);
equal("risk.market", await read(expected.risk, riskAbi, "market"), expected.market);
equal("risk.settlementEngine", await read(expected.risk, riskAbi, "settlementEngine"), expected.engine);
equal("risk.registry", await read(expected.risk, riskAbi, "registry"), expected.registry);
equal("risk.vault", await read(expected.risk, riskAbi, "vault"), expected.vault);
for (const [field, wanted] of [["usdg", expected.usdg], ["vault", expected.vault], ["quoteVerifier", expected.verifier], ["settlementEngine", expected.engine], ["optionToken", expected.token], ["riskManager", expected.risk]] as const) {
  equal(`market.${field}`, await read(expected.market, marketAbi, field), wanted);
}

console.log(`Verified complete Options wiring on chain ${chainId}`);
