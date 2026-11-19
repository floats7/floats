import {
  decodeFunctionResult,
  encodeFunctionData,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

const STOCK_TOKEN_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function uid() view returns (bytes32)",
  "function uiMultiplier() view returns (uint256)",
]);

export interface StockTokenIdentityExpectation {
  readonly address: string;
  readonly symbol: string;
  readonly tokenName?: string;
  readonly assetUid: string;
}

export interface StockTokenInterfaceEvidence {
  readonly passed: boolean;
  readonly address: string;
  readonly symbol: string | null;
  readonly tokenName: string | null;
  readonly decimals: number | null;
  readonly totalSupply: string | null;
  readonly assetUid: string | null;
  readonly uiMultiplier18: string | null;
  readonly runtimeCodeHash: string | null;
  readonly failures: readonly string[];
}

export interface JsonRpcReader {
  call(address: Address, data: Hex): Promise<Hex>;
  getCode(address: Address): Promise<Hex>;
}

export interface RuntimeCodeComparisonEvidence {
  readonly passed: boolean;
  readonly candidateRuntimeCodeHash: string | null;
  readonly referenceRuntimeCodeHashes: readonly string[];
  readonly matchedReferenceAddress: string | null;
}

export interface DeploymentLineageEvidence {
  readonly passed: boolean;
  readonly candidateCreatorAddress: string | null;
  readonly candidateCreationTransaction: string | null;
  readonly referenceCreatorAddresses: readonly string[];
  readonly matchedReferenceAddress: string | null;
}

interface BlockscoutAddressResponse {
  readonly creator_address_hash?: string | { readonly hash?: string } | null;
  readonly creation_tx_hash?: string | null;
}

export async function compareDeploymentLineageWithReferences(
  explorerUrl: URL,
  candidateAddress: string,
  referenceAddresses: readonly string[],
  request: typeof globalThis.fetch = globalThis.fetch,
): Promise<DeploymentLineageEvidence> {
  if (explorerUrl.protocol !== "https:") throw new Error("Lineage explorer must use HTTPS");
  if (!isAddress(candidateAddress, { strict: false })) throw new Error("Candidate Stock Token address is invalid");
  const candidate = await readBlockscoutAddress(explorerUrl, candidateAddress, request);
  const references = await Promise.all(referenceAddresses.map(async (address) => {
    if (!isAddress(address, { strict: false })) throw new Error("Reference Stock Token address is invalid");
    return { address: address.toLowerCase(), ...(await readBlockscoutAddress(explorerUrl, address, request)) };
  }));
  const match = candidate.creatorAddress
    ? references.find((reference) => reference.creatorAddress === candidate.creatorAddress)
    : undefined;
  return {
    passed: Boolean(match),
    candidateCreatorAddress: candidate.creatorAddress,
    candidateCreationTransaction: candidate.creationTransaction,
    referenceCreatorAddresses: [...new Set(references.flatMap((reference) => reference.creatorAddress ? [reference.creatorAddress] : []))],
    matchedReferenceAddress: match?.address ?? null,
  };
}

export async function compareRuntimeCodeWithReferences(
  reader: JsonRpcReader,
  candidateRuntimeCodeHash: string | null,
  referenceAddresses: readonly string[],
): Promise<RuntimeCodeComparisonEvidence> {
  if (!candidateRuntimeCodeHash || !/^0x[0-9a-fA-F]{64}$/.test(candidateRuntimeCodeHash)) {
    return { passed: false, candidateRuntimeCodeHash, referenceRuntimeCodeHashes: [], matchedReferenceAddress: null };
  }
  const references = await Promise.all(referenceAddresses.map(async (value) => {
    if (!isAddress(value, { strict: false })) throw new Error("Reference Stock Token address is invalid");
    const normalized = value.toLowerCase() as Address;
    const code = await reader.getCode(normalized);
    return { address: normalized, hash: code === "0x" ? null : keccak256(code) };
  }));
  const match = references.find((reference) => reference.hash?.toLowerCase() === candidateRuntimeCodeHash.toLowerCase());
  return {
    passed: Boolean(match),
    candidateRuntimeCodeHash,
    referenceRuntimeCodeHashes: references.flatMap((reference) => reference.hash ? [reference.hash] : []),
    matchedReferenceAddress: match?.address ?? null,
  };
}

export async function verifyStockTokenInterface(
  reader: JsonRpcReader,
  expectation: StockTokenIdentityExpectation,
): Promise<StockTokenInterfaceEvidence> {
  if (!isAddress(expectation.address, { strict: false })) throw new Error("Candidate token address is invalid");
  if (!/^[A-Z0-9.-]{1,16}$/.test(expectation.symbol)) throw new Error("Candidate symbol is invalid");
  if (!/^0x[0-9a-fA-F]{64}$/.test(expectation.assetUid)) throw new Error("Candidate asset UID is invalid");
  const address = expectation.address.toLowerCase() as Address;
  const failures: string[] = [];
  const [symbol, tokenName, decimals, totalSupply, assetUid, uiMultiplier18, code] = await Promise.all([
    read(reader, address, "symbol").catch(() => null),
    read(reader, address, "name").catch(() => null),
    read(reader, address, "decimals").catch(() => null),
    read(reader, address, "totalSupply").catch(() => null),
    read(reader, address, "uid").catch(() => null),
    read(reader, address, "uiMultiplier").catch(() => null),
    reader.getCode(address).catch(() => "0x" as Hex),
  ]);

  const normalizedSymbol = typeof symbol === "string" ? symbol : null;
  const normalizedTokenName = typeof tokenName === "string" ? tokenName : null;
  const normalizedDecimals = typeof decimals === "number" ? decimals : null;
  const normalizedTotalSupply = typeof totalSupply === "bigint" ? totalSupply.toString() : null;
  const normalizedUid = typeof assetUid === "string" ? assetUid.toLowerCase() : null;
  const normalizedMultiplier = typeof uiMultiplier18 === "bigint" ? uiMultiplier18.toString() : null;
  if (normalizedSymbol !== expectation.symbol) failures.push("SYMBOL_MISMATCH");
  if (!normalizedTokenName || (expectation.tokenName && normalizedTokenName !== expectation.tokenName)) failures.push("NAME_MISMATCH");
  if (normalizedDecimals !== 18) failures.push("DECIMALS_NOT_18");
  if (normalizedTotalSupply === null) failures.push("TOTAL_SUPPLY_UNREADABLE");
  if (normalizedUid !== expectation.assetUid.toLowerCase()) failures.push("ASSET_UID_MISMATCH");
  if (normalizedMultiplier === null || BigInt(normalizedMultiplier) <= 0n) failures.push("UI_MULTIPLIER_INVALID");
  if (code === "0x") failures.push("RUNTIME_CODE_MISSING");

  return {
    passed: failures.length === 0,
    address,
    symbol: normalizedSymbol,
    tokenName: normalizedTokenName,
    decimals: normalizedDecimals,
    totalSupply: normalizedTotalSupply,
    assetUid: normalizedUid,
    uiMultiplier18: normalizedMultiplier,
    runtimeCodeHash: code === "0x" ? null : keccak256(code),
    failures,
  };
}

export function createJsonRpcReader(rpcUrl: URL, request: typeof globalThis.fetch = globalThis.fetch): JsonRpcReader {
  if (rpcUrl.protocol !== "https:" && !isLoopback(rpcUrl)) throw new Error("Identity verifier RPC must use HTTPS");
  let id = 0;
  async function rpc<T>(method: string, params: readonly unknown[]): Promise<T> {
    const response = await request(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Identity verifier RPC returned ${response.status}`);
    const payload = await response.json() as { result?: T; error?: { message?: string } };
    if (payload.error || payload.result === undefined) throw new Error(payload.error?.message ?? "Identity verifier RPC failed");
    return payload.result;
  }
  return {
    call: (address, data) => rpc<Hex>("eth_call", [{ to: address, data }, "latest"]),
    getCode: (address) => rpc<Hex>("eth_getCode", [address, "latest"]),
  };
}

async function read(
  reader: JsonRpcReader,
  address: Address,
  functionName: "symbol" | "name" | "decimals" | "totalSupply" | "uid" | "uiMultiplier",
): Promise<unknown> {
  const data = encodeFunctionData({ abi: STOCK_TOKEN_ABI, functionName });
  const result = await reader.call(address, data);
  return decodeFunctionResult({ abi: STOCK_TOKEN_ABI, functionName, data: result });
}

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
}

async function readBlockscoutAddress(
  explorerUrl: URL,
  address: string,
  request: typeof globalThis.fetch,
): Promise<{ readonly creatorAddress: string | null; readonly creationTransaction: string | null }> {
  const url = new URL(`/api/v2/addresses/${address.toLowerCase()}`, explorerUrl);
  const response = await request(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Lineage explorer returned ${response.status}`);
  const payload = await response.json() as BlockscoutAddressResponse;
  const rawCreator = typeof payload.creator_address_hash === "string"
    ? payload.creator_address_hash
    : payload.creator_address_hash?.hash;
  const creatorAddress = rawCreator && isAddress(rawCreator, { strict: false }) ? rawCreator.toLowerCase() : null;
  const creationTransaction = payload.creation_tx_hash && /^0x[0-9a-fA-F]{64}$/.test(payload.creation_tx_hash)
    ? payload.creation_tx_hash.toLowerCase()
    : null;
  return { creatorAddress, creationTransaction };
}
