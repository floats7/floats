import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const endpointAbi = parseAbi([
  "function delegates(address oapp) view returns (address)",
  "function getSendLibrary(address sender,uint32 dstEid) view returns (address)",
  "function isDefaultSendLibrary(address sender,uint32 dstEid) view returns (bool)",
  "function getReceiveLibrary(address receiver,uint32 srcEid) view returns (address lib,bool isDefault)",
  "function getConfig(address oapp,address lib,uint32 eid,uint32 configType) view returns (bytes)",
  "function setSendLibrary(address oapp,uint32 eid,address newLib)",
  "function setReceiveLibrary(address oapp,uint32 eid,address newLib,uint256 gracePeriod)",
  "function setConfig(address oapp,address lib,(uint32 eid,uint32 configType,bytes config)[] params)",
]);
const executorParameters = parseAbiParameters("(uint32 maxMessageSize,address executor)");
const ulnParameters = parseAbiParameters(
  "(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)",
);
const EXECUTOR_CONFIG_TYPE = 1;
const ULN_CONFIG_TYPE = 2;

interface PlannedTransaction { readonly label: string; readonly to: Address; readonly data: Hex }

function fail(message: string): never { throw new Error(`LayerZero pathway configuration failed: ${message}`); }
function environmentFile(path: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) result.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return result;
}
function required(values: ReadonlyMap<string, string>, key: string): string {
  const result = values.get(key)?.trim();
  if (!result) fail(`${key} is required`);
  return result;
}
function integer(values: ReadonlyMap<string, string>, key: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const result = Number(required(values, key));
  if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) fail(`${key} is invalid`);
  return result;
}
function address(values: ReadonlyMap<string, string>, key: string): Address {
  try {
    const result = getAddress(required(values, key));
    if (/^0x0{40}$/i.test(result)) fail(`${key} must be non-zero`);
    return result;
  } catch { fail(`${key} must be a valid address`); }
}
function addresses(values: ReadonlyMap<string, string>, key: string): readonly Address[] {
  const result = required(values, key).split(",").map((item) => getAddress(item.trim()));
  if (result.length < 2 || result.length > 255) fail(`${key} must contain between 2 and 255 DVNs`);
  const normalized = result.map((item) => item.toLowerCase());
  if (new Set(normalized).size !== result.length) fail(`${key} contains duplicate DVNs`);
  return [...result].sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()));
}

const path = process.argv[2];
if (!path) fail("usage: configure-layerzero-pathway.ts <environment-file>");
const values = environmentFile(path);
const rpcUrl = new URL(required(values, "RPC_URL"));
if (rpcUrl.protocol !== "https:") fail("RPC_URL must use HTTPS");
const expected = {
  chainId: integer(values, "CHAIN_ID"),
  remoteEid: integer(values, "LAYERZERO_REMOTE_EID", 0xffff_ffff),
  endpoint: address(values, "LAYERZERO_ENDPOINT_ADDRESS"),
  oapp: address(values, "LAYERZERO_OAPP_ADDRESS"),
  delegate: address(values, "LAYERZERO_DELEGATE"),
  sendLibrary: address(values, "LAYERZERO_SEND_LIBRARY"),
  receiveLibrary: address(values, "LAYERZERO_RECEIVE_LIBRARY"),
  executor: address(values, "LAYERZERO_EXECUTOR"),
  maxMessageSize: integer(values, "LAYERZERO_MAX_MESSAGE_SIZE", 0xffff_ffff),
  confirmations: integer(values, "LAYERZERO_MIN_CONFIRMATIONS"),
  requiredDvns: addresses(values, "LAYERZERO_REQUIRED_DVNS"),
  apply: values.get("LAYERZERO_CONFIGURATION_APPLY") === "true",
};
const executorConfig = encodeAbiParameters(executorParameters, [{
  maxMessageSize: expected.maxMessageSize,
  executor: expected.executor,
}]);
const ulnConfig = encodeAbiParameters(ulnParameters, [{
  confirmations: BigInt(expected.confirmations),
  requiredDVNCount: expected.requiredDvns.length,
  optionalDVNCount: 0,
  optionalDVNThreshold: 0,
  requiredDVNs: expected.requiredDvns,
  optionalDVNs: [],
}]);

const client = createPublicClient({ transport: http(rpcUrl.toString(), { retryCount: 1, timeout: 10_000 }) });
const chainId = await client.getChainId();
if (chainId !== expected.chainId) fail(`chain ID mismatch: expected ${expected.chainId}, received ${chainId}`);
for (const [label, contract] of [["endpoint", expected.endpoint], ["OApp", expected.oapp], ["send library", expected.sendLibrary], ["receive library", expected.receiveLibrary]] as const) {
  const code = await client.getCode({ address: contract });
  if (!code || code === "0x") fail(`${label} has no bytecode`);
}
const delegate = await client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "delegates", args: [expected.oapp] });
if (delegate.toLowerCase() !== expected.delegate.toLowerCase()) fail(`delegate mismatch: ${delegate}`);

const transactions: PlannedTransaction[] = [];
const [sendLibrary, sendIsDefault] = await Promise.all([
  client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "getSendLibrary", args: [expected.oapp, expected.remoteEid] }),
  client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "isDefaultSendLibrary", args: [expected.oapp, expected.remoteEid] }),
]);
if (sendIsDefault || sendLibrary.toLowerCase() !== expected.sendLibrary.toLowerCase()) {
  transactions.push({ label: "pin-send-library", to: expected.endpoint, data: encodeFunctionData({ abi: endpointAbi, functionName: "setSendLibrary", args: [expected.oapp, expected.remoteEid, expected.sendLibrary] }) });
}
const [receiveLibrary, receiveIsDefault] = await client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "getReceiveLibrary", args: [expected.oapp, expected.remoteEid] });
if (receiveIsDefault || receiveLibrary.toLowerCase() !== expected.receiveLibrary.toLowerCase()) {
  transactions.push({ label: "pin-receive-library", to: expected.endpoint, data: encodeFunctionData({ abi: endpointAbi, functionName: "setReceiveLibrary", args: [expected.oapp, expected.remoteEid, expected.receiveLibrary, 0n] }) });
}
const [currentExecutor, currentSendUln, currentReceiveUln] = await Promise.all([
  client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "getConfig", args: [expected.oapp, expected.sendLibrary, expected.remoteEid, EXECUTOR_CONFIG_TYPE] }),
  client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "getConfig", args: [expected.oapp, expected.sendLibrary, expected.remoteEid, ULN_CONFIG_TYPE] }),
  client.readContract({ address: expected.endpoint, abi: endpointAbi, functionName: "getConfig", args: [expected.oapp, expected.receiveLibrary, expected.remoteEid, ULN_CONFIG_TYPE] }),
]);
const sendParams = [];
if (currentExecutor.toLowerCase() !== executorConfig.toLowerCase()) sendParams.push({ eid: expected.remoteEid, configType: EXECUTOR_CONFIG_TYPE, config: executorConfig });
if (currentSendUln.toLowerCase() !== ulnConfig.toLowerCase()) sendParams.push({ eid: expected.remoteEid, configType: ULN_CONFIG_TYPE, config: ulnConfig });
if (sendParams.length > 0) transactions.push({ label: "configure-send-library", to: expected.endpoint, data: encodeFunctionData({ abi: endpointAbi, functionName: "setConfig", args: [expected.oapp, expected.sendLibrary, sendParams] }) });
if (currentReceiveUln.toLowerCase() !== ulnConfig.toLowerCase()) transactions.push({ label: "configure-receive-library", to: expected.endpoint, data: encodeFunctionData({ abi: endpointAbi, functionName: "setConfig", args: [expected.oapp, expected.receiveLibrary, [{ eid: expected.remoteEid, configType: ULN_CONFIG_TYPE, config: ulnConfig }]] }) });

if (transactions.length === 0) {
  console.log(JSON.stringify({ status: "already-configured", chainId, oapp: expected.oapp, remoteEid: expected.remoteEid }, null, 2));
  process.exit(0);
}
if (!expected.apply) {
  console.log(JSON.stringify({ status: "dry-run", chainId, delegate, transactions }, null, 2));
  process.exit(0);
}
const privateKey = required(values, "DEPLOYER_PRIVATE_KEY") as Hex;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail("DEPLOYER_PRIVATE_KEY is invalid");
const account = privateKeyToAccount(privateKey);
if (account.address.toLowerCase() !== expected.delegate.toLowerCase()) fail(`deployer ${account.address} is not delegate ${expected.delegate}`);
const wallet = createWalletClient({ account, transport: http(rpcUrl.toString()) });
const receipts = [];
for (const transaction of transactions) {
  const hash = await wallet.sendTransaction({ account, to: transaction.to, data: transaction.data, chain: null });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`${transaction.label} reverted: ${hash}`);
  receipts.push({ label: transaction.label, hash, blockNumber: receipt.blockNumber.toString() });
}
console.log(JSON.stringify({ status: "configured", chainId, receipts }, null, 2));
