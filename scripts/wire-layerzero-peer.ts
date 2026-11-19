import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  pad,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const oappAbi = parseAbi([
  "function owner() view returns (address)",
  "function peers(uint32 eid) view returns (bytes32)",
  "function setPeer(uint32 eid, bytes32 peer)",
]);

function fail(message: string): never {
  throw new Error(`LayerZero peer wiring failed: ${message}`);
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
  const result = values.get(key)?.trim();
  if (!result) fail(`${key} is required`);
  return result;
}

function positiveInteger(values: ReadonlyMap<string, string>, key: string): number {
  const result = Number(required(values, key));
  if (!Number.isSafeInteger(result) || result <= 0) fail(`${key} must be a positive integer`);
  return result;
}

function address(values: ReadonlyMap<string, string>, key: string, allowZero = false): Address {
  try {
    const result = getAddress(required(values, key));
    if (!allowZero && /^0x0{40}$/i.test(result)) fail(`${key} must be non-zero`);
    return result;
  } catch {
    fail(`${key} must be a valid address`);
  }
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: wire-layerzero-peer.ts <environment-file>");
const values = parseEnvironment(environmentPath);
const removePeer = values.get("LAYERZERO_REMOVE_PEER") === "true";
const expected = {
  chainId: positiveInteger(values, "CHAIN_ID"),
  rpcUrl: required(values, "RPC_URL"),
  oapp: address(values, "LAYERZERO_OAPP_ADDRESS"),
  owner: address(values, "LAYERZERO_OAPP_OWNER"),
  remoteEid: positiveInteger(values, "LAYERZERO_REMOTE_EID"),
  remotePeer: removePeer
    ? "0x0000000000000000000000000000000000000000" as Address
    : address(values, "LAYERZERO_REMOTE_PEER"),
  apply: values.get("LAYERZERO_WIRING_APPLY") === "true",
  removePeer,
};
const rpcUrl = new URL(expected.rpcUrl);
if (rpcUrl.protocol !== "https:") fail("RPC_URL must use HTTPS");

const publicClient = createPublicClient({
  transport: http(rpcUrl.toString(), { retryCount: 1, timeout: 10_000 }),
});
const chainId = await publicClient.getChainId();
if (chainId !== expected.chainId) {
  fail(`RPC chain ID mismatch: expected ${expected.chainId}, received ${chainId}`);
}
const code = await publicClient.getCode({ address: expected.oapp });
if (!code || code === "0x") fail("OApp has no bytecode");
const owner = await publicClient.readContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "owner",
});
if (owner.toLowerCase() !== expected.owner.toLowerCase()) {
  fail(`owner mismatch: expected ${expected.owner}, received ${owner}`);
}

const expectedPeer = pad(expected.remotePeer, { size: 32 });
const currentPeer = await publicClient.readContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "peers",
  args: [expected.remoteEid],
});
if (currentPeer.toLowerCase() === expectedPeer.toLowerCase()) {
  console.log(JSON.stringify({ status: "already-wired", chainId, oapp: expected.oapp, remoteEid: expected.remoteEid, peer: currentPeer }, null, 2));
  process.exit(0);
}

const data = encodeFunctionData({
  abi: oappAbi,
  functionName: "setPeer",
  args: [expected.remoteEid, expectedPeer],
});
if (!expected.apply) {
  console.log(JSON.stringify({
    status: "dry-run",
    chainId,
    from: expected.owner,
    to: expected.oapp,
    currentPeer,
    expectedPeer,
    operation: expected.removePeer ? "remove-peer" : "set-peer",
    data,
  }, null, 2));
  process.exit(0);
}

const privateKey = required(values, "DEPLOYER_PRIVATE_KEY") as Hex;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail("DEPLOYER_PRIVATE_KEY is invalid");
const account = privateKeyToAccount(privateKey);
if (account.address.toLowerCase() !== expected.owner.toLowerCase()) {
  fail(`deployer ${account.address} is not the configured owner ${expected.owner}`);
}
const wallet = createWalletClient({ account, transport: http(rpcUrl.toString()) });
const transactionHash = await wallet.writeContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "setPeer",
  args: [expected.remoteEid, expectedPeer],
  chain: null,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== "success") fail(`transaction reverted: ${transactionHash}`);
const verifiedPeer = await publicClient.readContract({
  address: expected.oapp,
  abi: oappAbi,
  functionName: "peers",
  args: [expected.remoteEid],
});
if (verifiedPeer.toLowerCase() !== expectedPeer.toLowerCase()) {
  fail(`post-transaction peer mismatch: ${verifiedPeer}`);
}
console.log(JSON.stringify({
  status: expected.removePeer ? "peer-removed" : "wired",
  chainId,
  transactionHash,
  peer: verifiedPeer,
}, null, 2));
