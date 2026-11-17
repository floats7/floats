export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export interface ChainBlock {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: Date;
}

export interface DecodedProtocolEvent {
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly blockTimestamp: Date;
  readonly transactionHash: Hex;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly contractAddress: Address;
  readonly eventName: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface IndexerCheckpoint {
  readonly nextBlock: bigint;
  readonly lastFinalizedBlock?: bigint;
  readonly lastFinalizedHash?: Hex;
}

export interface IndexedBatch {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly finalizedBlock: ChainBlock;
  readonly events: readonly DecodedProtocolEvent[];
}

export interface ChainEventSource {
  getHeadBlockNumber(): Promise<bigint>;
  getBlock(blockNumber: bigint): Promise<ChainBlock>;
  getEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly DecodedProtocolEvent[]>;
}

export interface IndexerStore {
  getCheckpoint(): Promise<IndexerCheckpoint | undefined>;
  commit(batch: IndexedBatch): Promise<void>;
  rewind(replayFromBlock: bigint): Promise<void>;
  reportHealth(input: {
    status: "healthy" | "degraded" | "halted";
    latestSeenBlock?: bigint;
    lagBlocks?: bigint;
    lastError?: string;
  }): Promise<void>;
}
