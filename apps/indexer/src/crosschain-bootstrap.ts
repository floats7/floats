import { loadServerConfig } from "../../api/src/config.ts";
import { SupabaseRestClient } from "../../api/src/supabase-rest-client.ts";
import { FLOATS_CROSSCHAIN_EVENT_CATALOG } from "./event-catalog.ts";
import { ProtocolIndexer } from "./indexer.ts";
import { EvmJsonRpcSource } from "./json-rpc-source.ts";
import { SupabaseIndexerStore } from "./supabase-store.ts";
import type { Address } from "./types.ts";

export function createCrossChainProtocolIndexer(environment: NodeJS.ProcessEnv): ProtocolIndexer {
  const server = loadServerConfig(environment);
  const runtime = loadCrossChainIndexerConfig(environment);
  if (server.chainId !== runtime.chainId) {
    throw new Error("CHAIN_ID must match CROSSCHAIN_CHAIN_ID for the selected worker");
  }
  const client = new SupabaseRestClient({
    baseUrl: server.supabaseUrl,
    secretKey: server.supabaseSecretKey,
  });
  const source = new EvmJsonRpcSource(
    runtime.rpcUrl,
    runtime.contractAddresses,
    undefined,
    FLOATS_CROSSCHAIN_EVENT_CATALOG,
  );
  return new ProtocolIndexer(
    source,
    new SupabaseIndexerStore(client, {
      environment: server.appEnvironment,
      chainId: runtime.chainId,
      consumer: "crosschain-events",
    }),
    runtime,
  );
}

export function loadCrossChainIndexerConfig(environment: NodeJS.ProcessEnv) {
  return {
    chainId: positiveInteger(environment, "CROSSCHAIN_CHAIN_ID"),
    rpcUrl: httpsUrl(environment, "CROSSCHAIN_RPC_INDEXER"),
    contractAddresses: addresses(environment, "CROSSCHAIN_CONTRACT_ADDRESSES"),
    startBlock: integer(environment, "CROSSCHAIN_INDEXER_START_BLOCK", true),
    confirmations: integer(environment, "CROSSCHAIN_INDEXER_CONFIRMATIONS"),
    batchSize: integer(environment, "CROSSCHAIN_INDEXER_BATCH_SIZE"),
    reorgReplayDepth: integer(environment, "CROSSCHAIN_INDEXER_REORG_REPLAY_DEPTH"),
  };
}

function value(environment: NodeJS.ProcessEnv, key: string): string {
  const result = environment[key]?.trim();
  if (!result) throw new Error(`${key} must be configured`);
  return result;
}

function positiveInteger(environment: NodeJS.ProcessEnv, key: string): number {
  const parsed = Number(value(environment, key));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${key} must be a positive integer`);
  return parsed;
}

function integer(environment: NodeJS.ProcessEnv, key: string, allowZero = false): bigint {
  const raw = value(environment, key);
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${key} must be an integer`);
  const parsed = BigInt(raw);
  if (allowZero ? parsed < 0n : parsed <= 0n) throw new Error(`${key} is outside its allowed range`);
  return parsed;
}

function httpsUrl(environment: NodeJS.ProcessEnv, key: string): URL {
  const result = new URL(value(environment, key));
  if (result.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(result.hostname)) {
    throw new Error(`${key} must use HTTPS outside local development`);
  }
  return result;
}

function addresses(environment: NodeJS.ProcessEnv, key: string): readonly Address[] {
  const observed = new Set<string>();
  const result = value(environment, key).split(",").map((raw, index) => {
    const address = raw.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
      throw new Error(`${key} entry ${index + 1} must be a non-zero EVM address`);
    }
    if (observed.has(address)) throw new Error(`${key} contains duplicate address ${address}`);
    observed.add(address);
    return address as Address;
  });
  if (result.length === 0) throw new Error(`${key} must contain at least one address`);
  return result;
}
