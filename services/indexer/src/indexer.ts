import type { ChainEventSource, DecodedProtocolEvent, IndexerCheckpoint, IndexerStore } from "./types.ts";

export interface ProtocolIndexerOptions {
  readonly startBlock: bigint;
  readonly confirmations: bigint;
  readonly batchSize: bigint;
  readonly reorgReplayDepth: bigint;
}

export interface IndexerRunResult {
  readonly status: "idle" | "indexed" | "rewound";
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
  readonly eventCount: number;
}

export class ProtocolIndexer {
  public constructor(
    private readonly source: ChainEventSource,
    private readonly store: IndexerStore,
    private readonly options: ProtocolIndexerOptions,
  ) {
    if (options.startBlock < 0n) throw new Error("startBlock cannot be negative");
    if (options.confirmations < 0n) throw new Error("confirmations cannot be negative");
    if (options.batchSize <= 0n) throw new Error("batchSize must be positive");
    if (options.reorgReplayDepth <= 0n) throw new Error("reorgReplayDepth must be positive");
  }

  public async runOnce(): Promise<IndexerRunResult> {
    try {
      const head = await this.source.getHeadBlockNumber();
      const finalizedHead = head >= this.options.confirmations ? head - this.options.confirmations : -1n;
      const checkpoint = await this.store.getCheckpoint();

      if (checkpoint && (await this.hasReorg(checkpoint))) {
        const replayFrom = this.replayStart(checkpoint.lastFinalizedBlock!);
        await this.store.rewind(replayFrom);
        await this.store.reportHealth({
          status: "degraded",
          latestSeenBlock: head,
          lagBlocks: head - replayFrom,
          lastError: "CHAIN_REORG_DETECTED",
        });
        return { status: "rewound", fromBlock: replayFrom, eventCount: 0 };
      }

      const fromBlock = checkpoint?.nextBlock ?? this.options.startBlock;
      if (finalizedHead < fromBlock) {
        await this.store.reportHealth({
          status: "healthy",
          latestSeenBlock: head,
          lagBlocks: head >= fromBlock ? head - fromBlock : 0n,
        });
        return { status: "idle", eventCount: 0 };
      }

      const toBlock = min(fromBlock + this.options.batchSize - 1n, finalizedHead);
      const [events, finalizedBlock] = await Promise.all([
        this.source.getEvents(fromBlock, toBlock),
        this.source.getBlock(toBlock),
      ]);
      validateEvents(events, fromBlock, toBlock);

      await this.store.commit({ fromBlock, toBlock, finalizedBlock, events });
      await this.store.reportHealth({
        status: "healthy",
        latestSeenBlock: head,
        lagBlocks: head - toBlock,
      });
      return { status: "indexed", fromBlock, toBlock, eventCount: events.length };
    } catch (error) {
      await this.store.reportHealth({ status: "halted", lastError: safeErrorCode(error) });
      throw error;
    }
  }

  private async hasReorg(checkpoint: IndexerCheckpoint): Promise<boolean> {
    if (checkpoint.lastFinalizedBlock === undefined || checkpoint.lastFinalizedHash === undefined) {
      return false;
    }
    const canonicalBlock = await this.source.getBlock(checkpoint.lastFinalizedBlock);
    return canonicalBlock.hash.toLowerCase() !== checkpoint.lastFinalizedHash.toLowerCase();
  }

  private replayStart(lastFinalizedBlock: bigint): bigint {
    const candidate = lastFinalizedBlock - this.options.reorgReplayDepth + 1n;
    return candidate > this.options.startBlock ? candidate : this.options.startBlock;
  }
}

function validateEvents(
  events: readonly DecodedProtocolEvent[],
  fromBlock: bigint,
  toBlock: bigint,
): void {
  const identities = new Set<string>();
  let previousPosition: readonly [bigint, number, number] | undefined;

  for (const event of events) {
    if (event.blockNumber < fromBlock || event.blockNumber > toBlock) {
      throw new Error("EVENT_OUTSIDE_REQUESTED_RANGE");
    }
    const identity = `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
    if (identities.has(identity)) throw new Error("DUPLICATE_EVENT_IDENTITY");
    identities.add(identity);

    const position = [event.blockNumber, event.transactionIndex, event.logIndex] as const;
    if (previousPosition && comparePosition(position, previousPosition) < 0) {
      throw new Error("EVENTS_NOT_CANONICALLY_ORDERED");
    }
    previousPosition = position;
  }
}

function comparePosition(
  left: readonly [bigint, number, number],
  right: readonly [bigint, number, number],
): number {
  if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
  if (left[1] !== right[1]) return left[1] - right[1];
  return left[2] - right[2];
}

function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function safeErrorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "INDEXER_RUN_FAILED";
}
