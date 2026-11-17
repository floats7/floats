import type { Address, ChainBlock, Hex } from "./types.ts";

const INTERNAL_SCALE = 10n ** 18n;
const USDG_TO_INTERNAL_SCALE = 10n ** 12n;

const SELECTORS = {
  getTrackedTokens: "0x695def4c",
  totalSupply: "0x18160ddd",
  totalAssets: "0x01e1d114",
  balanceOf: "0x70a08231",
  uiMultiplier: "0xa60bf13d",
  observe: "0xe8f1d23f",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  uid: "0xf514ce36",
  getConstituent: "0x0cd95092",
  version: "0x54fd4d50",
} as const;

export type OracleHealth = "unconfigured" | "live" | "stale" | "paused" | "invalid";

export interface SnapshotCallSource {
  getBlock(blockNumber: bigint): Promise<ChainBlock>;
  callContract(to: Address, data: Hex, blockNumber: bigint): Promise<Hex>;
}

export interface HoldingSnapshot {
  readonly tokenAddress: Address;
  readonly rawBalance: bigint;
  readonly uiMultiplier18: bigint;
  readonly normalizedPriceUsd18: bigint;
  readonly valueUsd18: bigint;
  readonly oracleHealth: OracleHealth;
  readonly oracleUpdatedAt: bigint;
  readonly symbol: string;
  readonly decimals: number;
  readonly assetUid: Hex;
  readonly feedAddress: Address;
  readonly targetWeightBps: number;
  readonly eligibleFrom: bigint;
  readonly exitAfter: bigint;
  readonly registryStatus: "none" | "active" | "removed";
  readonly registryVersion: bigint;
}

export interface CoreSnapshot {
  readonly block: ChainBlock;
  readonly vaultAddress: Address;
  readonly navUsd18: bigint;
  readonly totalSupply18: bigint;
  readonly sharePriceUsd18: bigint | null;
  readonly holdings: readonly HoldingSnapshot[];
}

export class CoreSnapshotReader {
  public constructor(
    private readonly source: SnapshotCallSource,
    private readonly vaultAddress: Address,
    private readonly registryAddress: Address,
    private readonly navOracleAddress: Address,
  ) {}

  public async capture(blockNumber: bigint): Promise<CoreSnapshot> {
    const [block, trackedResult, supplyResult, assetsResult, versionResult] = await Promise.all([
      this.source.getBlock(blockNumber),
      this.source.callContract(this.registryAddress, SELECTORS.getTrackedTokens, blockNumber),
      this.source.callContract(this.vaultAddress, SELECTORS.totalSupply, blockNumber),
      this.source.callContract(this.vaultAddress, SELECTORS.totalAssets, blockNumber),
      this.source.callContract(this.registryAddress, SELECTORS.version, blockNumber),
    ]);
    const trackedTokens = decodeAddressArray(trackedResult);
    const totalSupply18 = decodeUint(supplyResult);
    const navUsd18 = decodeUint(assetsResult) * USDG_TO_INTERNAL_SCALE;
    const registryVersion = decodeUint(versionResult);
    const holdings = await mapWithConcurrency(
      trackedTokens,
      8,
      (token) => this.captureHolding(token, blockNumber, registryVersion),
    );
    const verifiedBlock = await this.source.getBlock(blockNumber);
    if (verifiedBlock.hash.toLowerCase() !== block.hash.toLowerCase()) {
      throw new Error("SNAPSHOT_BLOCK_REORGED");
    }

    return {
      block,
      vaultAddress: this.vaultAddress,
      navUsd18,
      totalSupply18,
      sharePriceUsd18: totalSupply18 === 0n ? null : navUsd18 * INTERNAL_SCALE / totalSupply18,
      holdings,
    };
  }

  private async captureHolding(
    token: Address,
    blockNumber: bigint,
    registryVersion: bigint,
  ): Promise<HoldingSnapshot> {
    const [balanceResult, multiplierResult, observationResult, symbolResult, decimalsResult, uidResult, constituentResult] = await Promise.all([
      this.source.callContract(token, encodeAddressCall(SELECTORS.balanceOf, this.vaultAddress), blockNumber),
      this.source.callContract(token, SELECTORS.uiMultiplier, blockNumber),
      this.source.callContract(this.navOracleAddress, encodeAddressCall(SELECTORS.observe, token), blockNumber),
      this.source.callContract(token, SELECTORS.symbol, blockNumber),
      this.source.callContract(token, SELECTORS.decimals, blockNumber),
      this.source.callContract(token, SELECTORS.uid, blockNumber),
      this.source.callContract(this.registryAddress, encodeAddressCall(SELECTORS.getConstituent, token), blockNumber),
    ]);
    const rawBalance = decodeUint(balanceResult);
    const uiMultiplier18 = decodeUint(multiplierResult);
    const [normalizedPriceUsd18, oracleUpdatedAt, healthValue] = decodeObservation(observationResult);
    const oracleHealth = decodeHealth(healthValue);
    const symbol = decodeString(symbolResult);
    const decimals = toSafeNumber(decodeUint(decimalsResult), 36n, "INVALID_TOKEN_DECIMALS");
    const assetUid = decodeBytes32(uidResult);
    const [feedWord, registryUidWord, weightWord, eligibleWord, exitWord, statusWord] = decodeConstituent(constituentResult);
    const registryUid = toBytes32(registryUidWord);
    if (assetUid.toLowerCase() !== registryUid.toLowerCase()) throw new Error("ASSET_UID_MISMATCH");

    return {
      tokenAddress: token,
      rawBalance,
      uiMultiplier18,
      normalizedPriceUsd18,
      valueUsd18: rawBalance * normalizedPriceUsd18 / INTERNAL_SCALE,
      oracleHealth,
      oracleUpdatedAt,
      symbol,
      decimals,
      assetUid,
      feedAddress: toAddress(feedWord),
      targetWeightBps: toSafeNumber(weightWord, 10_000n, "INVALID_TARGET_WEIGHT"),
      eligibleFrom: eligibleWord,
      exitAfter: exitWord,
      registryStatus: decodeRegistryStatus(statusWord),
      registryVersion,
    };
  }
}

function encodeAddressCall(selector: Hex, address: Address): Hex {
  return `${selector}${address.slice(2).padStart(64, "0")}` as Hex;
}

function decodeUint(data: Hex): bigint {
  const [word] = decodeStaticTuple(data, 1);
  if (word === undefined) throw new Error("MALFORMED_CALL_RESULT");
  return word;
}

function decodeObservation(data: Hex): readonly [bigint, bigint, bigint] {
  const values = decodeStaticTuple(data, 3);
  const normalizedPrice = values[0];
  const updatedAt = values[1];
  const health = values[2];
  if (normalizedPrice === undefined || updatedAt === undefined || health === undefined) {
    throw new Error("MALFORMED_CALL_RESULT");
  }
  return [normalizedPrice, updatedAt, health];
}

function decodeStaticTuple(data: Hex, length: number): bigint[] {
  const raw = data.slice(2);
  if (raw.length !== length * 64 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("MALFORMED_CALL_RESULT");
  }
  return Array.from({ length }, (_, index) => BigInt(`0x${raw.slice(index * 64, (index + 1) * 64)}`));
}

function decodeAddressArray(data: Hex): Address[] {
  const raw = data.slice(2);
  if (raw.length < 128 || raw.length % 64 !== 0 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("MALFORMED_ADDRESS_ARRAY");
  }
  const offset = Number(BigInt(`0x${raw.slice(0, 64)}`));
  if (offset !== 32) throw new Error("MALFORMED_ADDRESS_ARRAY");
  const length = Number(BigInt(`0x${raw.slice(64, 128)}`));
  if (!Number.isSafeInteger(length) || length > 64 || raw.length !== 128 + length * 64) {
    throw new Error("MALFORMED_ADDRESS_ARRAY");
  }
  return Array.from({ length }, (_, index) => {
    const word = raw.slice(128 + index * 64, 192 + index * 64);
    if (!/^0{24}[0-9a-fA-F]{40}$/.test(word)) throw new Error("MALFORMED_ADDRESS_ARRAY");
    return `0x${word.slice(24).toLowerCase()}` as Address;
  });
}

function decodeHealth(value: bigint): OracleHealth {
  const health = ["unconfigured", "live", "stale", "paused", "invalid"] as const;
  const result = health[Number(value)];
  if (!result) throw new Error("INVALID_ORACLE_HEALTH");
  return result;
}

function decodeConstituent(data: Hex): readonly [bigint, bigint, bigint, bigint, bigint, bigint] {
  const values = decodeStaticTuple(data, 6);
  if (values.some((value) => value === undefined)) throw new Error("MALFORMED_CONSTITUENT");
  return values as [bigint, bigint, bigint, bigint, bigint, bigint];
}

function decodeString(data: Hex): string {
  const raw = data.slice(2);
  if (raw.length < 128 || raw.length % 64 !== 0 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("MALFORMED_STRING_RESULT");
  }
  if (BigInt(`0x${raw.slice(0, 64)}`) !== 32n) throw new Error("MALFORMED_STRING_RESULT");
  const length = Number(BigInt(`0x${raw.slice(64, 128)}`));
  if (!Number.isSafeInteger(length) || length < 1 || length > 32) throw new Error("INVALID_TOKEN_SYMBOL");
  const bytes = Uint8Array.from(Buffer.from(raw.slice(128, 128 + length * 2), "hex"));
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(value)) throw new Error("INVALID_TOKEN_SYMBOL");
  return value;
}

function decodeBytes32(data: Hex): Hex {
  const raw = data.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("MALFORMED_BYTES32_RESULT");
  return `0x${raw.toLowerCase()}`;
}

function toBytes32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function toAddress(value: bigint): Address {
  if (value < 0n || value >= 1n << 160n) throw new Error("INVALID_FEED_ADDRESS");
  return `0x${value.toString(16).padStart(40, "0")}`;
}

function toSafeNumber(value: bigint, maximum: bigint, errorCode: string): number {
  if (value < 0n || value > maximum) throw new Error(errorCode);
  return Number(value);
}

function decodeRegistryStatus(value: bigint): HoldingSnapshot["registryStatus"] {
  const statuses = ["none", "active", "removed"] as const;
  const status = statuses[Number(value)];
  if (!status) throw new Error("INVALID_REGISTRY_STATUS");
  return status;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value);
    }
  });
  await Promise.all(workers);
  return results;
}
