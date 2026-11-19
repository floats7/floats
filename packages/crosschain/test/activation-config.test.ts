import assert from "node:assert/strict";
import test from "node:test";
import { parseCrossChainActivationConfig } from "../src/index.ts";

const address = (digit: string) => `0x${digit.repeat(40)}`;
const valid = {
  environment: "testnet",
  hub: { eid: 40_001, fipo: address("1"), floats: address("2"), nav: address("3") },
  spoke: { eid: 43_002, fipo: address("4"), floats: address("5"), nav: address("6") },
  fipo: {
    hubOutbound: "100000000000000000000",
    hubInbound: "100000000000000000000",
    spokeOutbound: "100000000000000000000",
    spokeInbound: "100000000000000000000",
    windowSeconds: 3600,
  },
  floats: {
    hubOutbound: "50000000000000000000",
    hubInbound: "50000000000000000000",
    spokeOutbound: "50000000000000000000",
    spokeInbound: "50000000000000000000",
    windowSeconds: 3600,
  },
};

test("parses exact bigint rate limits without number coercion", () => {
  const parsed = parseCrossChainActivationConfig(JSON.stringify(valid), "testnet");
  assert.equal(parsed.fipo.hubOutbound, 100_000_000_000_000_000_000n);
  assert.equal(parsed.spoke.eid, 43_002);
});

test("rejects environment and EID collisions", () => {
  assert.throws(
    () => parseCrossChainActivationConfig(JSON.stringify(valid), "mainnet"),
    /ENVIRONMENT_MISMATCH/,
  );
  assert.throws(
    () => parseCrossChainActivationConfig(JSON.stringify({
      ...valid,
      spoke: { ...valid.spoke, eid: valid.hub.eid },
    }), "testnet"),
    /EID_COLLISION/,
  );
});

test("rejects duplicate contracts and unsafe capacities", () => {
  assert.throws(
    () => parseCrossChainActivationConfig(JSON.stringify({
      ...valid,
      spoke: { ...valid.spoke, nav: valid.hub.nav },
    }), "testnet"),
    /CONTRACT_DUPLICATE/,
  );
  assert.throws(
    () => parseCrossChainActivationConfig(JSON.stringify({
      ...valid,
      fipo: { ...valid.fipo, hubOutbound: "0" },
    }), "testnet"),
    /HUB_OUTBOUND_INVALID/,
  );
});
