import assert from "node:assert/strict";
import test from "node:test";

import { loadIndexerRuntimeConfig } from "../src/bootstrap.ts";

const address = (character: string) => `0x${character.repeat(40)}`;
const validEnvironment: NodeJS.ProcessEnv = {
  RPC_URL: "https://rpc.testnet.chain.robinhood.com",
  RPC_INDEXER: "https://rpc.testnet.chain.robinhood.com",
  FLOATS_VAULT_ADDRESS: address("1"),
  INDEX_REGISTRY_ADDRESS: address("2"),
  NAV_ORACLE_ADDRESS: address("3"),
  FEE_MODULE_ADDRESS: address("4"),
  REBALANCER_ADDRESS: address("5"),
  INDEXER_START_BLOCK: "100",
  INDEXER_CONFIRMATIONS: "12",
  INDEXER_BATCH_SIZE: "500",
  INDEXER_REORG_REPLAY_DEPTH: "64",
};

test("loads a complete fail-fast indexer runtime configuration", () => {
  const config = loadIndexerRuntimeConfig(validEnvironment);

  assert.equal(config.startBlock, 100n);
  assert.equal(config.confirmations, 12n);
  assert.equal(config.batchSize, 500n);
  assert.equal(config.reorgReplayDepth, 64n);
  assert.equal(config.addresses.length, 4);
});

test("rejects an omitted deployment address", () => {
  assert.throws(
    () => loadIndexerRuntimeConfig({ ...validEnvironment, FEE_MODULE_ADDRESS: "" }),
    /FEE_MODULE_ADDRESS/,
  );
});

test("rejects zero-sized batches", () => {
  assert.throws(
    () => loadIndexerRuntimeConfig({ ...validEnvironment, INDEXER_BATCH_SIZE: "0" }),
    /INDEXER_BATCH_SIZE/,
  );
});

test("adds optional issuer governance addresses to the monitored set", () => {
  const issuerRegistry = address("a");
  const issuerToken = address("b");
  const config = loadIndexerRuntimeConfig({
    ...validEnvironment,
    ISSUER_MONITOR_ADDRESSES: `${issuerRegistry}, 0x${issuerToken.slice(2).toUpperCase()}`,
  });

  assert.deepEqual(config.addresses.slice(-2), [issuerRegistry, issuerToken]);
});

test("rejects malformed optional issuer monitoring addresses", () => {
  assert.throws(
    () => loadIndexerRuntimeConfig({ ...validEnvironment, ISSUER_MONITOR_ADDRESSES: "0x1234" }),
    /ISSUER_MONITOR_ADDRESSES entry 1/,
  );
});

test("adds Options contracts only as one complete monitored group", () => {
  const optionsEnvironment = {
    ...validEnvironment,
    OPTIONS_SERIES_REGISTRY_ADDRESS: address("6"),
    OPTIONS_MARKET_ADDRESS: address("7"),
    OPTIONS_SETTLEMENT_ENGINE_ADDRESS: address("8"),
    OPTIONS_VAULT_ADDRESS: address("9"),
    OPTIONS_RISK_MANAGER_ADDRESS: address("a"),
  };
  const config = loadIndexerRuntimeConfig(optionsEnvironment);
  assert.deepEqual(config.addresses.slice(-5), [
    address("6"), address("7"), address("8"), address("9"), address("a"),
  ]);

  assert.throws(
    () => loadIndexerRuntimeConfig({
      ...validEnvironment,
      OPTIONS_MARKET_ADDRESS: address("7"),
    }),
    /Optional address group must configure all/,
  );
});
