import assert from "node:assert/strict";
import test from "node:test";
import { loadCrossChainIndexerConfig } from "../src/crosschain-bootstrap.ts";

const address = (character: string) => `0x${character.repeat(40)}`;
const environment: NodeJS.ProcessEnv = {
  CROSSCHAIN_CHAIN_ID: "4663",
  CROSSCHAIN_RPC_INDEXER: "https://rpc.mainnet.chain.robinhood.com",
  CROSSCHAIN_CONTRACT_ADDRESSES: `${address("1")},${address("2")}`,
  CROSSCHAIN_INDEXER_START_BLOCK: "100",
  CROSSCHAIN_INDEXER_CONFIRMATIONS: "20",
  CROSSCHAIN_INDEXER_BATCH_SIZE: "500",
  CROSSCHAIN_INDEXER_REORG_REPLAY_DEPTH: "64",
};

test("crosschain worker configuration is chain-scoped and fail-fast", () => {
  const config = loadCrossChainIndexerConfig(environment);
  assert.equal(config.chainId, 4663);
  assert.equal(config.contractAddresses.length, 2);
  assert.equal(config.confirmations, 20n);
});

test("crosschain worker rejects duplicate contracts and insecure RPCs", () => {
  assert.throws(
    () => loadCrossChainIndexerConfig({
      ...environment,
      CROSSCHAIN_CONTRACT_ADDRESSES: `${address("1")},${address("1")}`,
    }),
    /duplicate address/,
  );
  assert.throws(
    () => loadCrossChainIndexerConfig({ ...environment, CROSSCHAIN_RPC_INDEXER: "http://remote" }),
    /HTTPS/,
  );
});
