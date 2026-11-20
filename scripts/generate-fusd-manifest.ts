import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { getAddress, type Address } from "viem";

function fail(message: string): never {
  throw new Error(`fUSD manifest generation failed: ${message}`);
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

function codeHash(contract: Address, rpcUrl: string): string {
  return execFileSync("cast", ["codehash", contract, "--rpc-url", rpcUrl], {
    encoding: "utf8",
  }).trim();
}

const [environmentPath, outputPath] = process.argv.slice(2);
if (!environmentPath || !outputPath) {
  fail("usage: generate-fusd-manifest.ts <environment-file> <output-file>");
}
const values = parseEnvironment(environmentPath);
if (required(values, "APP_ENV") !== "mainnet" || required(values, "CHAIN_ID") !== "4663") {
  fail("mainnet environment is required");
}
const rpcUrl = values.get("RPC_INDEXER")?.trim() || required(values, "RPC_URL");
const contracts = {
  vault: address(values, "FUSD_VAULT_ADDRESS"),
  strategy: address(values, "FUSD_STRATEGY_ADDRESS"),
  rateOracle: address(values, "FUSD_RATE_ORACLE_ADDRESS"),
};
const manifest = {
  environment: "mainnet",
  chainId: 4663,
  version: required(values, "FUSD_DEPLOYMENT_VERSION"),
  generatedAt: new Date().toISOString(),
  collateral: address(values, "USDG_ADDRESS"),
  strategySource: address(values, "FUSD_MORPHO_VAULT_ADDRESS"),
  depositsPaused: true,
  contracts: Object.fromEntries(
    Object.entries(contracts).map(([name, contract]) => [
      name,
      { address: contract, codeHash: codeHash(contract, rpcUrl) },
    ]),
  ),
  governance: {
    timelock: address(values, "TIMELOCK_ADDRESS"),
    guardian: address(values, "GUARDIAN_ADDRESS"),
    treasury: address(values, "TREASURY_ADDRESS"),
  },
  risk: {
    initialTvlCap: required(values, "FUSD_INITIAL_TVL_CAP"),
    targetBufferBps: Number(required(values, "FUSD_TARGET_BUFFER_BPS")),
    performanceFeeBps: Number(required(values, "FUSD_PERFORMANCE_FEE_BPS")),
  },
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(`Generated fUSD manifest at ${outputPath}`);
