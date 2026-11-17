import type { AppEnvironment } from "../../api/src/config.ts";
import type { SupabaseRestClient } from "../../api/src/supabase-rest-client.ts";
import type { Database } from "../../../packages/database/src/database.generated.ts";
import type { IndexedBatch, IndexerCheckpoint, IndexerStore } from "./types.ts";

type CheckpointRow = Pick<
  Database["public"]["Tables"]["chain_checkpoints"]["Row"],
  "next_block" | "last_finalized_block" | "last_finalized_hash"
>;

export interface SupabaseIndexerStoreOptions {
  readonly environment: AppEnvironment;
  readonly chainId: number;
  readonly consumer: string;
}

export class SupabaseIndexerStore implements IndexerStore {
  public constructor(
    private readonly client: SupabaseRestClient,
    private readonly options: SupabaseIndexerStoreOptions,
  ) {
    if (!Number.isSafeInteger(options.chainId) || options.chainId <= 0) {
      throw new Error("chainId must be a positive safe integer");
    }
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(options.consumer)) {
      throw new Error("consumer must be a stable lowercase identifier");
    }
  }

  public async getCheckpoint(): Promise<IndexerCheckpoint | undefined> {
    const query = new URLSearchParams({
      select: "next_block,last_finalized_block,last_finalized_hash",
      environment: `eq.${this.options.environment}`,
      chain_id: `eq.${this.options.chainId}`,
      consumer: `eq.${this.options.consumer}`,
      limit: "1",
    });
    const [row] = await this.client.select<readonly CheckpointRow[]>("chain_checkpoints", query);
    if (!row) return undefined;

    const lastFinalizedHash = row.last_finalized_hash;
    if (lastFinalizedHash !== null && !/^0x[0-9a-fA-F]{64}$/.test(lastFinalizedHash)) {
      throw new Error("Stored checkpoint hash is invalid");
    }

    return {
      nextBlock: BigInt(row.next_block),
      ...(row.last_finalized_block === null
        ? {}
        : { lastFinalizedBlock: BigInt(row.last_finalized_block) }),
      ...(row.last_finalized_hash === null
        ? {}
        : { lastFinalizedHash: lastFinalizedHash as `0x${string}` }),
    };
  }

  public async commit(batch: IndexedBatch): Promise<void> {
    await this.client.rpc("commit_indexer_batch", {
      ...this.scopeParameters(),
      p_from_block: batch.fromBlock.toString(),
      p_to_block: batch.toBlock.toString(),
      p_finalized_hash: batch.finalizedBlock.hash,
      p_events: batch.events.map((event) => ({
        block_number: event.blockNumber.toString(),
        block_hash: event.blockHash,
        transaction_hash: event.transactionHash,
        transaction_index: event.transactionIndex,
        log_index: event.logIndex,
        contract_address: event.contractAddress,
        event_name: event.eventName,
        payload: event.payload,
        block_timestamp: event.blockTimestamp.toISOString(),
      })),
    });
  }

  public async rewind(replayFromBlock: bigint): Promise<void> {
    await this.client.rpc("rewind_indexer", {
      ...this.scopeParameters(),
      p_replay_from_block: replayFromBlock.toString(),
    });
  }

  public async reportHealth(input: {
    status: "healthy" | "degraded" | "halted";
    latestSeenBlock?: bigint;
    lagBlocks?: bigint;
    lastError?: string;
  }): Promise<void> {
    await this.client.rpc("report_ingestion_health", {
      ...this.scopeParameters(),
      p_status: input.status,
      p_latest_seen_block: input.latestSeenBlock?.toString() ?? null,
      p_lag_blocks: input.lagBlocks?.toString() ?? null,
      p_last_error: input.lastError ?? null,
    });
  }

  private scopeParameters(): Record<string, string | number> {
    return {
      p_environment: this.options.environment,
      p_chain_id: this.options.chainId,
      p_consumer: this.options.consumer,
    };
  }
}
