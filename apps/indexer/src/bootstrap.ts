import { loadServerConfig } from "../../api/src/config.ts";
import { SupabaseRestClient } from "../../api/src/supabase-rest-client.ts";
import { ProtocolIndexer } from "./indexer.ts";
import { RobinhoodJsonRpcSource } from "./json-rpc-source.ts";
import { IndexerCycle } from "./run-cycle.ts";
import { CoreSnapshotReader } from "./snapshot-reader.ts";
import { SupabaseSnapshotStore } from "./snapshot-store.ts";
import { SupabaseIndexerStore } from "./supabase-store.ts";
import type { Address } from "./types.ts";

interface IndexerRuntimeConfig {
  readonly rpcUrl: URL;
  readonly addresses: readonly Address[];
  readonly vaultAddress: Address;
  readonly registryAddress: Address;
  readonly navOracleAddress: Address;
  readonly startBlock: bigint;
  readonly confirmations: bigint;
  readonly batchSize: bigint;
  readonly reorgReplayDepth: bigint;
}

export function createIndexerCycle(environment: NodeJS.ProcessEnv): IndexerCycle {
  const server = loadServerConfig(environment);
  const runtime = loadIndexerRuntimeConfig(environment);
  const client = new SupabaseRestClient({
    baseUrl: server.supabaseUrl,
    secretKey: server.supabaseSecretKey,
  });
  const source = new RobinhoodJsonRpcSource(runtime.rpcUrl, runtime.addresses);
  const protocolIndexer = new ProtocolIndexer(
    source,
    new SupabaseIndexerStore(client, {
      environment: server.appEnvironment,
      chainId: server.chainId,
      consumer: "core-events",
    }),
    runtime,
  );

  return new IndexerCycle(
    source,
    protocolIndexer,
    new CoreSnapshotReader(
      source,
      runtime.vaultAddress,
      runtime.registryAddress,
      runtime.navOracleAddress,
    ),
    new SupabaseSnapshotStore(client, server.appEnvironment, server.chainId),
    runtime.startBlock,
    runtime.confirmations,
  );
}

export function createProtocolIndexer(environment: NodeJS.ProcessEnv): ProtocolIndexer {
  const server = loadServerConfig(environment);
  const runtime = loadIndexerRuntimeConfig(environment);
  const client = new SupabaseRestClient({
    baseUrl: server.supabaseUrl,
    secretKey: server.supabaseSecretKey,
  });

  return new ProtocolIndexer(
    new RobinhoodJsonRpcSource(runtime.rpcUrl, runtime.addresses),
    new SupabaseIndexerStore(client, {
      environment: server.appEnvironment,
      chainId: server.chainId,
      consumer: "core-events",
    }),
    {
      startBlock: runtime.startBlock,
      confirmations: runtime.confirmations,
      batchSize: runtime.batchSize,
      reorgReplayDepth: runtime.reorgReplayDepth,
    },
  );
}

export function loadIndexerRuntimeConfig(environment: NodeJS.ProcessEnv): IndexerRuntimeConfig {
  const vaultAddress = requireAddress(environment, "FLOATS_VAULT_ADDRESS");
  const registryAddress = requireAddress(environment, "INDEX_REGISTRY_ADDRESS");
  const issuerMonitorAddresses = optionalAddresses(environment, "ISSUER_MONITOR_ADDRESSES");
  const optionsAddresses = optionalAddressGroup(environment, [
    "OPTIONS_SERIES_REGISTRY_ADDRESS",
    "OPTIONS_MARKET_ADDRESS",
    "OPTIONS_SETTLEMENT_ENGINE_ADDRESS",
    "OPTIONS_VAULT_ADDRESS",
    "OPTIONS_RISK_MANAGER_ADDRESS",
  ]);
  return {
    rpcUrl: requireHttpsUrl(environment, "RPC_INDEXER"),
    addresses: [
      vaultAddress,
      registryAddress,
      requireAddress(environment, "FEE_MODULE_ADDRESS"),
      requireAddress(environment, "REBALANCER_ADDRESS"),
      ...issuerMonitorAddresses,
      ...optionsAddresses,
    ],
    vaultAddress,
    registryAddress,
    navOracleAddress: requireAddress(environment, "NAV_ORACLE_ADDRESS"),
    startBlock: requireInteger(environment, "INDEXER_START_BLOCK", true),
    confirmations: requireInteger(environment, "INDEXER_CONFIRMATIONS"),
    batchSize: requireInteger(environment, "INDEXER_BATCH_SIZE"),
    reorgReplayDepth: requireInteger(environment, "INDEXER_REORG_REPLAY_DEPTH"),
  };
}

function optionalAddressGroup(
  environment: NodeJS.ProcessEnv,
  keys: readonly string[],
): readonly Address[] {
  const configured = keys.filter((key) => environment[key]?.trim());
  if (configured.length === 0) return [];
  if (configured.length !== keys.length) {
    throw new Error(`Optional address group must configure all of: ${keys.join(", ")}`);
  }
  return keys.map((key) => requireAddress(environment, key));
}

function optionalAddresses(environment: NodeJS.ProcessEnv, key: string): readonly Address[] {
  const value = environment[key]?.trim();
  if (!value) return [];
  return value.split(",").map((item, index) => {
    const address = item.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`${key} entry ${index + 1} must be an EVM address`);
    }
    return address.toLowerCase() as Address;
  });
}

function requireValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing required indexer configuration: ${key}`);
  return value;
}

function requireHttpsUrl(environment: NodeJS.ProcessEnv, key: string): URL {
  const url = new URL(requireValue(environment, key));
  if (url.protocol !== "https:") throw new Error(`${key} must use HTTPS`);
  return url;
}

function requireAddress(environment: NodeJS.ProcessEnv, key: string): Address {
  const value = requireValue(environment, key);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${key} must be an EVM address`);
  return value.toLowerCase() as Address;
}

function requireInteger(environment: NodeJS.ProcessEnv, key: string, allowZero = false): bigint {
  const value = requireValue(environment, key);
  if (!/^[0-9]+$/.test(value)) throw new Error(`${key} must be an integer`);
  const parsed = BigInt(value);
  if (allowZero ? parsed < 0n : parsed <= 0n) throw new Error(`${key} is outside its allowed range`);
  return parsed;
}
