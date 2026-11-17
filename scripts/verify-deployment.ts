import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { calculateDeploymentSourceHash } from "./deployment-source.ts";

type Address = `0x${string}`;
type Hash = `0x${string}`;

interface Deployment {
  address: Address;
  codeHash: Hash;
  constructorArguments: readonly unknown[];
}

interface Manifest {
  environment: "testnet" | "mainnet";
  chainId: 46630 | 4663;
  version: string;
  sourceHash: Hash;
  deployedAt: string;
  deploymentBlock: number;
  contracts: Record<string, Deployment>;
  roles: {
    admin: Address;
    timelock: Address;
    guardian: Address;
    keeper: Address;
    treasury: Address;
    timelockDelaySeconds: 300;
  };
}

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

function fail(message: string): never {
  throw new Error(`Deployment verification failed: ${message}`);
}

function cast(arguments_: readonly string[]): string {
  return execFileSync("cast", arguments_, { encoding: "utf8" }).trim();
}

function requireAddress(label: string, value: string): asserts value is Address {
  if (!addressPattern.test(value) || /^0x0{40}$/i.test(value)) fail(`${label} is not a non-zero address`);
}

function readEnvironmentValue(path: string, key: string): string {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0 && line.slice(0, separator) === key) {
      const value = line.slice(separator + 1);
      if (value) return value;
    }
  }
  fail(`${key} is required in the selected environment file`);
}

const [, , manifestPath, environmentPath] = process.argv;
if (!manifestPath || !environmentPath) {
  fail("usage: node --experimental-transform-types scripts/verify-deployment.ts <manifest> <environment-file>");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const rpcUrl = readEnvironmentValue(environmentPath, "RPC_URL");
const expectedChainId = manifest.environment === "testnet" ? 46630 : 4663;
if (manifest.chainId !== expectedChainId) fail("environment and chain ID do not match");
if (Number(cast(["chain-id", "--rpc-url", rpcUrl])) !== manifest.chainId) fail("RPC chain ID mismatch");
if (manifest.roles.timelockDelaySeconds !== 300) fail("timelock delay must be 300 seconds");
if (!hashPattern.test(manifest.sourceHash)) fail("sourceHash is invalid");
if (manifest.sourceHash !== calculateDeploymentSourceHash()) {
  fail("sourceHash does not match the current deployment sources");
}
if (Number.isNaN(Date.parse(manifest.deployedAt))) fail("deployedAt is not an ISO timestamp");
if (!Number.isSafeInteger(manifest.deploymentBlock) || manifest.deploymentBlock < 0) {
  fail("deploymentBlock is invalid");
}

const roleEntries = Object.entries(manifest.roles).filter(([key]) => key !== "timelockDelaySeconds");
for (const [name, address] of roleEntries) requireAddress(`role ${name}`, String(address));

const observedAddresses = new Set<string>();
for (const [name, deployment] of Object.entries(manifest.contracts)) {
  requireAddress(`${name}.address`, deployment.address);
  if (!hashPattern.test(deployment.codeHash)) fail(`${name}.codeHash is invalid`);
  const normalized = deployment.address.toLowerCase();
  if (observedAddresses.has(normalized)) fail(`duplicate contract address: ${deployment.address}`);
  observedAddresses.add(normalized);

  const observedHash = cast(["codehash", deployment.address, "--rpc-url", rpcUrl]);
  if (observedHash.toLowerCase() !== deployment.codeHash.toLowerCase()) {
    fail(`${name} code hash mismatch`);
  }
}

console.log(`Verified ${manifest.environment} deployment ${manifest.version} on chain ${manifest.chainId}`);
