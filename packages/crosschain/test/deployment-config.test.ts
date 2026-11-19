import assert from "node:assert/strict";
import test from "node:test";
import { parseCrossChainDeploymentConfig } from "../src/index.ts";

const valid = {
  environment: "mainnet",
  hub: {
    name: "Robinhood Chain",
    chainId: 4663,
    eid: 30416,
    rpcUrl: "https://rpc.example/hub",
    explorerUrl: "https://explorer.example/hub",
    endpointV2: `0x${"1".repeat(40)}`,
  },
  spoke: {
    name: "Zero",
    chainId: 9999,
    eid: 39999,
    rpcUrl: "https://rpc.example/spoke",
    explorerUrl: "https://explorer.example/spoke",
    endpointV2: `0x${"2".repeat(40)}`,
  },
  paths: [{
    tokenSymbol: "FLOATS",
    hubContract: `0x${"3".repeat(40)}`,
    spokeContract: `0x${"4".repeat(40)}`,
  }],
};

test("parses an environment-bound deployment config", () => {
  const config = parseCrossChainDeploymentConfig(JSON.stringify(valid), "mainnet");
  assert.equal(config.hub.chainId, 4663);
  assert.equal(config.spoke.eid, 39999);
  assert.equal(config.paths[0]?.tokenSymbol, "FLOATS");
});

test("rejects using mainnet coordinates in a testnet process", () => {
  assert.throws(
    () => parseCrossChainDeploymentConfig(JSON.stringify(valid), "testnet"),
    /CROSSCHAIN_ENVIRONMENT_MISMATCH/,
  );
});

test("rejects insecure RPCs and colliding network identities", () => {
  assert.throws(
    () => parseCrossChainDeploymentConfig(JSON.stringify({
      ...valid,
      spoke: { ...valid.spoke, rpcUrl: "http://rpc.example", chainId: 4663 },
    }), "mainnet"),
    /HTTPS_REQUIRED/,
  );
  assert.throws(
    () => parseCrossChainDeploymentConfig(JSON.stringify({
      ...valid,
      spoke: { ...valid.spoke, chainId: 4663 },
    }), "mainnet"),
    /IDENTITY_COLLISION/,
  );
});

test("rejects duplicate token paths and contract reuse", () => {
  assert.throws(
    () => parseCrossChainDeploymentConfig(JSON.stringify({
      ...valid,
      paths: [valid.paths[0], valid.paths[0]],
    }), "mainnet"),
    /PATH_DUPLICATE/,
  );
});
