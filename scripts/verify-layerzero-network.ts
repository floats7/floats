import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const endpointAbi = parseAbi([
  "function eid() view returns (uint32)",
  "function isSupportedEid(uint32 eid) view returns (bool)",
]);

interface NetworkExpectation {
  chainId: number;
  endpoint: Address;
  endpointId: number;
  remoteEndpointId?: number;
}

function fail(message: string): never {
  throw new Error(`LayerZero network verification failed: ${message}`);
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

function positiveInteger(values: ReadonlyMap<string, string>, key: string): number {
  const value = Number(required(values, key));
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${key} must be a positive integer`);
  return value;
}

function optionalPositiveInteger(
  values: ReadonlyMap<string, string>,
  key: string,
): number | undefined {
  const rawValue = values.get(key);
  if (!rawValue) return undefined;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${key} must be a positive integer`);
  return value;
}

function address(values: ReadonlyMap<string, string>, key: string): Address {
  try {
    return getAddress(required(values, key));
  } catch {
    fail(`${key} must be a valid non-zero address`);
  }
}

function expectation(values: ReadonlyMap<string, string>): NetworkExpectation {
  const endpoint = address(values, "LAYERZERO_ENDPOINT_ADDRESS");
  if (/^0x0{40}$/i.test(endpoint)) fail("LAYERZERO_ENDPOINT_ADDRESS must be non-zero");
  const remoteEndpointId = optionalPositiveInteger(values, "LAYERZERO_REMOTE_EID");
  const baseExpectation = {
    chainId: positiveInteger(values, "CHAIN_ID"),
    endpoint,
    endpointId: positiveInteger(values, "LAYERZERO_EID"),
  };
  return remoteEndpointId === undefined
    ? baseExpectation
    : { ...baseExpectation, remoteEndpointId };
}

const environmentPath = process.argv[2];
if (!environmentPath) {
  fail("usage: verify-layerzero-network.ts <environment-file>");
}

const values = parseEnvironment(environmentPath);
const expected = expectation(values);
const client = createPublicClient({
  transport: http(required(values, "RPC_URL"), { retryCount: 1, timeout: 10_000 }),
});

const observedChainId = await client.getChainId();
if (observedChainId !== expected.chainId) {
  fail(`RPC chain ID mismatch: expected ${expected.chainId}, received ${observedChainId}`);
}

const bytecode = await client.getCode({ address: expected.endpoint });
if (!bytecode || bytecode === "0x") fail("configured endpoint has no bytecode");

const observedEndpointId = await client.readContract({
  address: expected.endpoint,
  abi: endpointAbi,
  functionName: "eid",
});
if (Number(observedEndpointId) !== expected.endpointId) {
  fail(`endpoint ID mismatch: expected ${expected.endpointId}, received ${observedEndpointId}`);
}

if (expected.remoteEndpointId !== undefined) {
  const isSupported = await client.readContract({
    address: expected.endpoint,
    abi: endpointAbi,
    functionName: "isSupportedEid",
    args: [expected.remoteEndpointId],
  });
  if (!isSupported) fail(`remote EID ${expected.remoteEndpointId} is not supported`);
}

console.log(
  `Verified LayerZero Endpoint V2 ${expected.endpoint} (EID ${expected.endpointId}) on chain ${expected.chainId}`,
);
