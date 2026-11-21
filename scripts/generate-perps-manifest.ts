import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { getAddress, type Address } from "viem";

function fail(message: string): never { throw new Error(`Perps manifest generation failed: ${message}`); }
function parseEnvironment(path: string): ReadonlyMap<string, string> { const values = new Map<string, string>(); for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const separator = line.indexOf("="); if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1)); } return values; }
function required(values: ReadonlyMap<string, string>, key: string): string { const value = values.get(key)?.trim(); if (!value) fail(`${key} is required`); return value; }
function address(values: ReadonlyMap<string, string>, key: string): Address { try { return getAddress(required(values, key)); } catch { fail(`${key} is invalid`); } }
function codeHash(contract: Address, rpcUrl: string): string { return execFileSync("cast", ["codehash", contract, "--rpc-url", rpcUrl], { encoding: "utf8" }).trim(); }

const [environmentPath, outputPath] = process.argv.slice(2);
if (!environmentPath || !outputPath) fail("usage: generate-perps-manifest.ts <environment-file> <output-file>");
const values = parseEnvironment(environmentPath);
const environment = required(values, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") fail("APP_ENV must be testnet or mainnet");
const rpcUrl = values.get("RPC_INDEXER")?.trim() || required(values, "RPC_URL");
const explorerUrl = (values.get("BLOCK_EXPLORER_URL")?.trim() || required(values, "EXPLORER_URL")).replace(/\/$/, "");
const names = ["REGISTRY", "MARKET", "ORACLE", "MARGIN_ACCOUNT", "FUNDING_ENGINE", "RISK_ENGINE", "LIQUIDATION_ENGINE", "LIQUIDITY_VAULT", "INSURANCE_FUND", "FIPO_PRICE_FEED"] as const;
const contracts = Object.fromEntries(names.map((name) => { const contract = address(values, `PERPS_${name}_ADDRESS`); return [name.toLowerCase(), { address: contract, explorerUrl: `${explorerUrl}/address/${contract}`, codeHash: codeHash(contract, rpcUrl) }]; }));
const manifest = {
  environment,
  chainId: Number(required(values, "CHAIN_ID")),
  version: required(values, "PERPS_DEPLOYMENT_VERSION"),
  generatedAt: new Date().toISOString(),
  collateral: address(values, "USDG_ADDRESS"),
  contracts,
  governance: { timelock: address(values, "TIMELOCK_ADDRESS"), guardian: address(values, "GUARDIAN_ADDRESS") },
  withdrawalDelaySeconds: Number(required(values, "PERPS_WITHDRAWAL_DELAY_SECONDS")),
};
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(`Generated credential-free Perps ${environment} manifest at ${outputPath}`);
