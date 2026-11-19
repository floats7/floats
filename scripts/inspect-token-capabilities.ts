import { readFileSync } from "node:fs";
import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";

const metadataAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
]);

const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

const capabilitySignatures = [
  "mint(address,uint256)",
  "burn(uint256)",
  "burnFrom(address,uint256)",
  "pause()",
  "unpause()",
  "upgradeToAndCall(address,bytes)",
  "grantRole(bytes32,address)",
] as const;

function fail(message: string): never {
  throw new Error(`Token capability inspection failed: ${message}`);
}

function parseEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) fail(`${key} is required`);
  return value;
}

function parseAddress(value: string, label: string): Address {
  try {
    const parsed = getAddress(value);
    if (/^0x0{40}$/i.test(parsed)) fail(`${label} must be non-zero`);
    return parsed;
  } catch {
    fail(`${label} must be a valid address`);
  }
}

function storageAddress(value: Hex | undefined): Address | undefined {
  if (!value || /^0x0+$/i.test(value)) return undefined;
  return parseAddress(`0x${value.slice(-40)}`, "implementation slot");
}

const environmentPath = process.argv[2];
const rawTokenAddress = process.argv[3];
if (!environmentPath || !rawTokenAddress) {
  fail("usage: inspect-token-capabilities.ts <environment-file> <token-address>");
}

const values = parseEnvironment(environmentPath);
const token = parseAddress(rawTokenAddress, "token address");
const expectedChainId = Number(required(values, "CHAIN_ID"));
if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) fail("CHAIN_ID is invalid");

const client = createPublicClient({
  transport: http(required(values, "RPC_URL"), { retryCount: 1, timeout: 10_000 }),
});
const chainId = await client.getChainId();
if (chainId !== expectedChainId) {
  fail(`RPC chain ID mismatch: expected ${expectedChainId}, received ${chainId}`);
}

const proxyCode = await client.getCode({ address: token });
if (!proxyCode || proxyCode === "0x") fail("token address has no bytecode");
const implementation = storageAddress(
  await client.getStorageAt({ address: token, slot: implementationSlot }),
);
const implementationCode = implementation
  ? await client.getCode({ address: implementation })
  : undefined;
const inspectedCode = implementationCode && implementationCode !== "0x" ? implementationCode : proxyCode;

async function read(functionName: "name" | "symbol" | "decimals" | "totalSupply" | "owner" | "paused") {
  try {
    return await client.readContract({ address: token, abi: metadataAbi, functionName });
  } catch {
    return null;
  }
}

const selectors = Object.fromEntries(
  capabilitySignatures.map((signature) => {
    const selector = toFunctionSelector(signature);
    return [signature, inspectedCode.toLowerCase().includes(selector.slice(2).toLowerCase())];
  }),
);

const report = {
  chainId,
  token,
  implementation: implementation ?? null,
  proxyBytecodeBytes: (proxyCode.length - 2) / 2,
  implementationBytecodeBytes:
    implementationCode && implementationCode !== "0x" ? (implementationCode.length - 2) / 2 : null,
  metadata: {
    name: await read("name"),
    symbol: await read("symbol"),
    decimals: await read("decimals"),
    totalSupply: String(await read("totalSupply")),
    owner: await read("owner"),
    paused: await read("paused"),
  },
  selectorEvidence: selectors,
  warning:
    "Selector presence is capability-discovery evidence, not proof that a caller is authorized or that a function is reachable.",
};

console.log(JSON.stringify(report, null, 2));
