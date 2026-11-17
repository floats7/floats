import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseRestClient } from "../../api/src/supabase-rest-client.ts";
import { CoreSnapshotReader, type SnapshotCallSource } from "../src/snapshot-reader.ts";
import { SupabaseSnapshotStore } from "../src/snapshot-store.ts";
import type { Address, Hex } from "../src/types.ts";

const vault = `0x${"1".repeat(40)}` as Address;
const registry = `0x${"2".repeat(40)}` as Address;
const oracle = `0x${"3".repeat(40)}` as Address;
const token = `0x${"4".repeat(40)}` as Address;
const feed = `0x${"5".repeat(40)}` as Address;
const assetUid = `0x${"6".repeat(64)}` as Hex;
const blockHash = `0x${"a".repeat(64)}` as Hex;
const word = (value: bigint) => value.toString(16).padStart(64, "0");
const encodedUint = (value: bigint) => `0x${word(value)}` as Hex;
const encodedString = (value: string) => {
  const hex = Buffer.from(value, "utf8").toString("hex");
  return `0x${word(32n)}${word(BigInt(value.length))}${hex.padEnd(64, "0")}` as Hex;
};

class SnapshotSource implements SnapshotCallSource {
  public readonly blockTags: bigint[] = [];
  public blockHash = blockHash;

  async getBlock(blockNumber: bigint) {
    return { number: blockNumber, hash: this.blockHash, timestamp: new Date("2026-01-01T00:00:00Z") };
  }

  async callContract(to: Address, data: Hex, blockNumber: bigint): Promise<Hex> {
    this.blockTags.push(blockNumber);
    if (to === registry && data === "0x695def4c") return `0x${word(32n)}${word(1n)}${"0".repeat(24)}${token.slice(2)}`;
    if (to === registry && data === "0x54fd4d50") return encodedUint(7n);
    if (to === vault && data === "0x18160ddd") return encodedUint(200n * 10n ** 18n);
    if (to === vault && data === "0x01e1d114") return encodedUint(250n * 10n ** 6n);
    if (to === token && data.startsWith("0x70a08231")) return encodedUint(10n * 10n ** 18n);
    if (to === token && data === "0xa60bf13d") return encodedUint(10n ** 18n);
    if (to === token && data === "0x95d89b41") return encodedString("CRCL");
    if (to === token && data === "0x313ce567") return encodedUint(18n);
    if (to === token && data === "0xf514ce36") return assetUid;
    if (to === registry && data.startsWith("0x0cd95092")) {
      return `0x${word(BigInt(feed))}${assetUid.slice(2)}${word(1250n)}${word(1_700_000_000n)}${word(1_800_000_000n)}${word(1n)}`;
    }
    if (to === oracle && data.startsWith("0xe8f1d23f")) {
      return `0x${word(25n * 10n ** 18n)}${word(1_700_000_000n)}${word(1n)}`;
    }
    throw new Error(`Unexpected call to ${to} with ${data}`);
  }
}

test("captures block-consistent NAV and holding state without precision loss", async () => {
  const source = new SnapshotSource();
  const snapshot = await new CoreSnapshotReader(source, vault, registry, oracle).capture(500n);

  assert.equal(source.blockTags.every((tag) => tag === 500n), true);
  assert.equal(snapshot.navUsd18, 250n * 10n ** 18n);
  assert.equal(snapshot.totalSupply18, 200n * 10n ** 18n);
  assert.equal(snapshot.sharePriceUsd18, 1_250_000_000_000_000_000n);
  assert.equal(snapshot.holdings[0]?.valueUsd18, 250n * 10n ** 18n);
  assert.equal(snapshot.holdings[0]?.oracleHealth, "live");
});

test("rejects a snapshot if the block hash changes during capture", async () => {
  const source = new SnapshotSource();
  let reads = 0;
  source.getBlock = async (blockNumber: bigint) => ({
    number: blockNumber,
    hash: (++reads === 1 ? blockHash : `0x${"b".repeat(64)}`) as Hex,
    timestamp: new Date(0),
  });

  await assert.rejects(
    () => new CoreSnapshotReader(source, vault, registry, oracle).capture(500n),
    /SNAPSHOT_BLOCK_REORGED/,
  );
});

test("persists NAV and holdings through one atomic snapshot RPC", async () => {
  const source = new SnapshotSource();
  const snapshot = await new CoreSnapshotReader(source, vault, registry, oracle).capture(500n);
  let body: Record<string, unknown> | undefined;
  const client = new SupabaseRestClient({
    baseUrl: new URL("https://example.supabase.co"),
    secretKey: "sb_secret_test",
    fetch: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 204 });
    },
  });

  await new SupabaseSnapshotStore(client, "testnet", 46630).commit(snapshot);

  assert.equal(body?.p_block_number, "500");
  assert.equal(body?.p_nav_usd_18, (250n * 10n ** 18n).toString());
  assert.equal((body?.p_holdings as unknown[]).length, 1);
});
