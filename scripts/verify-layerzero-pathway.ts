import { readFileSync } from "node:fs";
import {
  createPublicClient,
  decodeAbiParameters,
  getAddress,
  http,
  pad,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

const endpointAbi = parseAbi([
  "function eid() view returns (uint32)",
  "function delegates(address oapp) view returns (address)",
  "function getSendLibrary(address sender, uint32 dstEid) view returns (address)",
  "function isDefaultSendLibrary(address sender, uint32 dstEid) view returns (bool)",
  "function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)",
  "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes)",
]);
const oappAbi = parseAbi([
  "function endpoint() view returns (address)",
  "function owner() view returns (address)",
  "function peers(uint32 eid) view returns (bytes32)",
]);
const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const adapterAbi = parseAbi(["function token() view returns (address)"]);
const executorParameters = [
  {
    type: "tuple",
    components: [
      { name: "maxMessageSize", type: "uint32" },
      { name: "executor", type: "address" },
    ],
  },
] as const;
const ulnParameters = [
  {
    type: "tuple",
    components: [
      { name: "confirmations", type: "uint64" },
      { name: "requiredDVNCount", type: "uint8" },
      { name: "optionalDVNCount", type: "uint8" },
      { name: "optionalDVNThreshold", type: "uint8" },
      { name: "requiredDVNs", type: "address[]" },
      { name: "optionalDVNs", type: "address[]" },
    ],
  },
] as const;

const EXECUTOR_CONFIG_TYPE = 1;
const ULN_CONFIG_TYPE = 2;

function fail(message: string): never {
  throw new Error(`LayerZero pathway verification failed: ${message}`);
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

function integer(values: ReadonlyMap<string, string>, key: string): number {
  const value = Number(required(values, key));
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${key} must be a positive integer`);
  return value;
}

function text(values: ReadonlyMap<string, string>, key: string): string {
  return required(values, key).trim();
}

function address(values: ReadonlyMap<string, string>, key: string): Address {
  try {
    const value = getAddress(required(values, key));
    if (/^0x0{40}$/i.test(value)) fail(`${key} must be non-zero`);
    return value;
  } catch {
    fail(`${key} must be a valid address`);
  }
}

function assertAddress(label: string, actual: Address, expected: Address): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    fail(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function assertSorted(label: string, addresses: readonly Address[]): void {
  const normalized = addresses.map((value) => value.toLowerCase());
  const sorted = [...normalized].sort();
  if (normalized.some((value, index) => value !== sorted[index])) {
    fail(`${label} must be sorted in ascending address order`);
  }
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: verify-layerzero-pathway.ts <environment-file>");
const values = parseEnvironment(environmentPath);

const expected = {
  chainId: integer(values, "CHAIN_ID"),
  localEid: integer(values, "LAYERZERO_EID"),
  remoteEid: integer(values, "LAYERZERO_REMOTE_EID"),
  endpoint: address(values, "LAYERZERO_ENDPOINT_ADDRESS"),
  oapp: address(values, "LAYERZERO_OAPP_ADDRESS"),
  owner: address(values, "LAYERZERO_OAPP_OWNER"),
  delegate: address(values, "LAYERZERO_DELEGATE"),
  remotePeer: address(values, "LAYERZERO_REMOTE_PEER"),
  sendLibrary: address(values, "LAYERZERO_SEND_LIBRARY"),
  receiveLibrary: address(values, "LAYERZERO_RECEIVE_LIBRARY"),
  executor: address(values, "LAYERZERO_EXECUTOR"),
  minimumRequiredDvns: integer(values, "LAYERZERO_MIN_REQUIRED_DVNS"),
  minimumConfirmations: integer(values, "LAYERZERO_MIN_CONFIRMATIONS"),
  token: address(values, "LAYERZERO_TOKEN_ADDRESS"),
  tokenName: text(values, "LAYERZERO_TOKEN_NAME"),
  tokenSymbol: text(values, "LAYERZERO_TOKEN_SYMBOL"),
  tokenDecimals: integer(values, "LAYERZERO_TOKEN_DECIMALS"),
  oappMode: text(values, "LAYERZERO_OAPP_MODE"),
};
if (expected.oappMode !== "adapter" && expected.oappMode !== "oft") {
  fail("LAYERZERO_OAPP_MODE must be adapter or oft");
}

const client = createPublicClient({
  transport: http(required(values, "RPC_URL"), { retryCount: 1, timeout: 10_000 }),
});
const chainId = await client.getChainId();
if (chainId !== expected.chainId) {
  fail(`RPC chain ID mismatch: expected ${expected.chainId}, received ${chainId}`);
}

const endpointCode = await client.getCode({ address: expected.endpoint });
const oappCode = await client.getCode({ address: expected.oapp });
if (!endpointCode || endpointCode === "0x") fail("Endpoint V2 has no bytecode");
if (!oappCode || oappCode === "0x") fail("OApp has no bytecode");

const endpointEid = await client.readContract({
  address: expected.endpoint,
  abi: endpointAbi,
  functionName: "eid",
});
if (endpointEid !== expected.localEid) {
  fail(`Endpoint EID mismatch: expected ${expected.localEid}, received ${endpointEid}`);
}
const boundEndpoint = await client.readContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "endpoint",
});
assertAddress("OApp endpoint", boundEndpoint, expected.endpoint);
const owner = await client.readContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "owner",
});
assertAddress("OApp owner", owner, expected.owner);
const delegate = await client.readContract({
  address: expected.endpoint,
  abi: endpointAbi,
  functionName: "delegates",
  args: [expected.oapp],
});
assertAddress("OApp delegate", delegate, expected.delegate);

const tokenContract = expected.oappMode === "adapter"
  ? await client.readContract({
      address: expected.oapp,
      abi: adapterAbi,
      functionName: "token",
    })
  : expected.oapp;
assertAddress("OFT token", tokenContract, expected.token);
const [tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
  client.readContract({ address: expected.token, abi: erc20Abi, functionName: "name" }),
  client.readContract({ address: expected.token, abi: erc20Abi, functionName: "symbol" }),
  client.readContract({ address: expected.token, abi: erc20Abi, functionName: "decimals" }),
]);
if (tokenName !== expected.tokenName) fail(`token name mismatch: expected ${expected.tokenName}, received ${tokenName}`);
if (tokenSymbol !== expected.tokenSymbol) fail(`token symbol mismatch: expected ${expected.tokenSymbol}, received ${tokenSymbol}`);
if (tokenDecimals !== expected.tokenDecimals) {
  fail(`token decimals mismatch: expected ${expected.tokenDecimals}, received ${tokenDecimals}`);
}

const peer = await client.readContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "peers",
  args: [expected.remoteEid],
});
const expectedPeer = pad(expected.remotePeer, { size: 32 });
if (peer.toLowerCase() !== expectedPeer.toLowerCase()) {
  fail(`peer mismatch: expected ${expectedPeer}, received ${peer}`);
}

const sendLibrary = await client.readContract({
  address: expected.endpoint,
  abi: endpointAbi,
  functionName: "getSendLibrary",
  args: [expected.oapp, expected.remoteEid],
});
assertAddress("send library", sendLibrary, expected.sendLibrary);
const usesDefaultSendLibrary = await client.readContract({
  address: expected.endpoint,
  abi: endpointAbi,
  functionName: "isDefaultSendLibrary",
  args: [expected.oapp, expected.remoteEid],
});
if (usesDefaultSendLibrary) fail("send library is not explicitly pinned");

const [receiveLibrary, usesDefaultReceiveLibrary] = await client.readContract({
  address: expected.endpoint,
  abi: endpointAbi,
  functionName: "getReceiveLibrary",
  args: [expected.oapp, expected.remoteEid],
});
assertAddress("receive library", receiveLibrary, expected.receiveLibrary);
if (usesDefaultReceiveLibrary) fail("receive library is not explicitly pinned");

async function config(library: Address, configType: number): Promise<Hex> {
  return await client.readContract({
    address: expected.endpoint,
    abi: endpointAbi,
    functionName: "getConfig",
    args: [expected.oapp, library, expected.remoteEid, configType],
  });
}

const [executorConfig] = decodeAbiParameters(
  executorParameters,
  await config(expected.sendLibrary, EXECUTOR_CONFIG_TYPE),
);
assertAddress("executor", executorConfig.executor, expected.executor);
if (executorConfig.maxMessageSize === 0) fail("executor max message size is zero");

const [sendUln] = decodeAbiParameters(
  ulnParameters,
  await config(expected.sendLibrary, ULN_CONFIG_TYPE),
);
const [receiveUln] = decodeAbiParameters(
  ulnParameters,
  await config(expected.receiveLibrary, ULN_CONFIG_TYPE),
);
for (const [label, uln] of [
  ["send ULN", sendUln],
  ["receive ULN", receiveUln],
] as const) {
  if (uln.confirmations < expected.minimumConfirmations) {
    fail(`${label} confirmations below policy minimum`);
  }
  if (uln.requiredDVNCount < expected.minimumRequiredDvns) {
    fail(`${label} required DVN count below policy minimum`);
  }
  if (uln.requiredDVNCount !== uln.requiredDVNs.length) {
    fail(`${label} required DVN count does not match its address list`);
  }
  assertSorted(`${label} required DVNs`, uln.requiredDVNs);
  assertSorted(`${label} optional DVNs`, uln.optionalDVNs);
}

console.log(
  JSON.stringify(
    {
      chainId,
      localEid: expected.localEid,
      remoteEid: expected.remoteEid,
      endpoint: expected.endpoint,
      oapp: expected.oapp,
      owner,
      delegate,
      token: {
        address: tokenContract,
        name: tokenName,
        symbol: tokenSymbol,
        decimals: tokenDecimals,
      },
      peer,
      sendLibrary,
      receiveLibrary,
      executor: executorConfig.executor,
      maxMessageSize: executorConfig.maxMessageSize,
      sendUln,
      receiveUln,
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);
