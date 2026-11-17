import type { IndexerRunResult, ProtocolIndexer } from "./indexer.ts";
import type { CoreSnapshot, CoreSnapshotReader } from "./snapshot-reader.ts";

export interface HeadSource {
  getHeadBlockNumber(): Promise<bigint>;
}

export interface SnapshotStore {
  commit(snapshot: CoreSnapshot): Promise<void>;
}

export interface IndexerCycleResult {
  readonly events: IndexerRunResult;
  readonly snapshotBlock?: bigint;
}

export class IndexerCycle {
  public constructor(
    private readonly source: HeadSource,
    private readonly protocolIndexer: ProtocolIndexer,
    private readonly snapshotReader: CoreSnapshotReader,
    private readonly snapshotStore: SnapshotStore,
    private readonly startBlock: bigint,
    private readonly confirmations: bigint,
  ) {}

  public async runOnce(): Promise<IndexerCycleResult> {
    const events = await this.protocolIndexer.runOnce();
    const head = await this.source.getHeadBlockNumber();
    if (head < this.confirmations) return { events };

    const finalizedBlock = head - this.confirmations;
    if (finalizedBlock < this.startBlock) return { events };

    const snapshot = await this.snapshotReader.capture(finalizedBlock);
    await this.snapshotStore.commit(snapshot);
    return { events, snapshotBlock: finalizedBlock };
  }
}
