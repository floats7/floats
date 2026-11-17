import assert from "node:assert/strict";
import test from "node:test";

import { ProtocolIndexer } from "../src/indexer.ts";
import type {
  ChainBlock,
  ChainEventSource,
  DecodedProtocolEvent,
  IndexedBatch,
  IndexerCheckpoint,
  IndexerStore,
} from "../src/types.ts";

const hash = (character: string) => `0x${character.repeat(64)}` as const;

class MemorySource implements ChainEventSource {
  public head = 120n;
  public checkpointHash = hash("a");
  public events: readonly DecodedProtocolEvent[] = [];

  async getHeadBlockNumber(): Promise<bigint> {
    return this.head;
  }

  async getBlock(blockNumber: bigint): Promise<ChainBlock> {
    return { number: blockNumber, hash: this.checkpointHash, timestamp: new Date(0) };
  }

  async getEvents(): Promise<readonly DecodedProtocolEvent[]> {
    return this.events;
  }
}

class MemoryStore implements IndexerStore {
  public checkpoint: IndexerCheckpoint | undefined;
  public batches: IndexedBatch[] = [];
  public rewinds: bigint[] = [];
  public health: Array<Record<string, unknown>> = [];

  async getCheckpoint(): Promise<IndexerCheckpoint | undefined> {
    return this.checkpoint;
  }

  async commit(batch: IndexedBatch): Promise<void> {
    this.batches.push(batch);
    this.checkpoint = {
      nextBlock: batch.toBlock + 1n,
      lastFinalizedBlock: batch.finalizedBlock.number,
      lastFinalizedHash: batch.finalizedBlock.hash,
    };
  }

  async rewind(replayFromBlock: bigint): Promise<void> {
    this.rewinds.push(replayFromBlock);
    this.checkpoint = { nextBlock: replayFromBlock };
  }

  async reportHealth(input: Record<string, unknown>): Promise<void> {
    this.health.push(input);
  }
}

const options = { startBlock: 100n, confirmations: 5n, batchSize: 10n, reorgReplayDepth: 12n };

test("indexes only finalized blocks and advances checkpoint atomically", async () => {
  const source = new MemorySource();
  const store = new MemoryStore();
  const result = await new ProtocolIndexer(source, store, options).runOnce();

  assert.deepEqual(result, { status: "indexed", fromBlock: 100n, toBlock: 109n, eventCount: 0 });
  assert.equal(store.batches.length, 1);
  assert.equal(store.checkpoint?.nextBlock, 110n);
});

test("rewinds a bounded window when the finalized checkpoint hash changes", async () => {
  const source = new MemorySource();
  source.checkpointHash = hash("b");
  const store = new MemoryStore();
  store.checkpoint = { nextBlock: 116n, lastFinalizedBlock: 115n, lastFinalizedHash: hash("a") };

  const result = await new ProtocolIndexer(source, store, options).runOnce();

  assert.deepEqual(result, { status: "rewound", fromBlock: 104n, eventCount: 0 });
  assert.deepEqual(store.rewinds, [104n]);
  assert.equal(store.health.at(-1)?.status, "degraded");
});

test("does not ingest unfinalized head blocks", async () => {
  const source = new MemorySource();
  source.head = 102n;
  const store = new MemoryStore();

  const result = await new ProtocolIndexer(source, store, options).runOnce();

  assert.deepEqual(result, { status: "idle", eventCount: 0 });
  assert.equal(store.batches.length, 0);
});

test("rejects duplicate event identities before committing", async () => {
  const source = new MemorySource();
  const duplicate: DecodedProtocolEvent = {
    blockNumber: 100n,
    blockHash: hash("a"),
    blockTimestamp: new Date(0),
    transactionHash: hash("c"),
    transactionIndex: 0,
    logIndex: 1,
    contractAddress: `0x${"d".repeat(40)}`,
    eventName: "ConfigurationExecuted",
    payload: {},
  };
  source.events = [duplicate, duplicate];
  const store = new MemoryStore();

  await assert.rejects(() => new ProtocolIndexer(source, store, options).runOnce(), /DUPLICATE/);
  assert.equal(store.batches.length, 0);
  assert.equal(store.health.at(-1)?.status, "halted");
});
