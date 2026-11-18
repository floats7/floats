import assert from "node:assert/strict";
import test from "node:test";

import { decodeFloatsCoreLog } from "../src/event-decoder.ts";
import { RobinhoodJsonRpcSource } from "../src/json-rpc-source.ts";

const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}` as const;
const blockHash = `0x${"a".repeat(64)}` as const;
const transactionHash = `0x${"b".repeat(64)}` as const;
const feeModule = `0x${"c".repeat(40)}` as const;
const feesAccruedTopic = "0x3f0efd667efe2a4e661231bb42b65ce017c3326fb50d12aa6f936500d58c1c02";
const issuerRoleGrantedTopic = "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d";
const seriesCreatedTopic = "0xf3a5a850451915d9f6b59eacecae48e62546cbe616dc14c4cdef9c622245900a";
const optionBoughtTopic = "0x62ec400cdc3fcaee22524ed3b7ab07a8fc1b96e9f499ba5fbf450a9a3254ca3c";

test("decodes indexed and non-indexed Floats Core event fields without number coercion", () => {
  const decoded = decodeFloatsCoreLog({
    address: feeModule,
    topics: [feesAccruedTopic, word(1_700_000_000n)],
    data: `0x${word(3600n).slice(2)}${word(42n).slice(2)}`,
  });

  assert.deepEqual(decoded, {
    eventName: "FeesAccrued",
    payload: { timestamp: "1700000000", elapsed: "3600", sharesMinted: "42" },
  });
});

test("decodes issuer role changes into explicit monitoring events", () => {
  const role = word(7n);
  const account = word(8n);
  const sender = word(9n);
  const decoded = decodeFloatsCoreLog({
    address: feeModule,
    topics: [issuerRoleGrantedTopic, role, account, sender],
    data: "0x",
  });

  assert.deepEqual(decoded, {
    eventName: "IssuerRoleGranted",
    payload: {
      role,
      account: `0x${"0".repeat(39)}8`,
      sender: `0x${"0".repeat(39)}9`,
    },
  });
});

test("decodes immutable options series terms without precision loss", () => {
  const decoded = decodeFloatsCoreLog({
    address: feeModule,
    topics: [seriesCreatedTopic, word(1n), word(2n), word(3n)],
    data: `0x${[
      word(0n),
      word(100n * 10n ** 18n),
      word(200n * 10n ** 18n),
      word(1_800_000_000n),
      word(10n ** 18n),
      word(9n),
      word(1n),
    ].map((item) => item.slice(2)).join("")}`,
  });

  assert.deepEqual(decoded, {
    eventName: "SeriesCreated",
    payload: {
      seriesId: word(1n),
      underlying: `0x${"0".repeat(39)}2`,
      priceSource: `0x${"0".repeat(39)}3`,
      kind: "0",
      strikeUsd18: "100000000000000000000",
      capUsd18: "200000000000000000000",
      expiry: "1800000000",
      contractSize18: "1000000000000000000",
      underlyingUid: word(9n),
      corporateActionPolicyVersion: "1",
    },
  });
});

test("decodes buyer-bound options market activity", () => {
  const decoded = decodeFloatsCoreLog({
    address: feeModule,
    topics: [optionBoughtTopic, word(1n), word(2n), word(3n)],
    data: `0x${word(10n ** 18n).slice(2)}${word(60_000_000n).slice(2)}${word(100_000_000n).slice(2)}`,
  });

  assert.deepEqual(decoded, {
    eventName: "OptionBought",
    payload: {
      quoteHash: word(1n),
      seriesId: word(2n),
      buyer: `0x${"0".repeat(39)}3`,
      size18: "1000000000000000000",
      premium6: "60000000",
      maximumLiability6: "100000000",
    },
  });
});

test("loads, verifies, decodes, and canonically orders RPC logs", async () => {
  const methods: string[] = [];
  const fetchStub: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string };
    methods.push(request.method);
    const result = request.method === "eth_getLogs"
      ? [{
          address: feeModule,
          blockNumber: "0x64",
          blockHash,
          transactionHash,
          transactionIndex: "0x2",
          logIndex: "0x3",
          data: `0x${word(3600n).slice(2)}${word(42n).slice(2)}`,
          topics: [feesAccruedTopic, word(1_700_000_000n)],
          removed: false,
        }]
      : { number: "0x64", hash: blockHash, timestamp: "0x6553f100" };
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
  const source = new RobinhoodJsonRpcSource(
    new URL("https://rpc.testnet.chain.robinhood.com"),
    [feeModule],
    fetchStub,
  );

  const events = await source.getEvents(100n, 110n);

  assert.deepEqual(methods, ["eth_getLogs", "eth_getBlockByNumber"]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventName, "FeesAccrued");
  assert.equal(events[0]?.payload.sharesMinted, "42");
  assert.equal(events[0]?.blockTimestamp.toISOString(), "2023-11-14T22:13:20.000Z");
});

test("rejects logs whose block hash no longer matches the canonical block", async () => {
  const fetchStub: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string };
    const result = request.method === "eth_getLogs"
      ? [{
          address: feeModule,
          blockNumber: "0x64",
          blockHash,
          transactionHash,
          transactionIndex: "0x0",
          logIndex: "0x0",
          data: `0x${word(1n).slice(2)}${word(2n).slice(2)}`,
          topics: [feesAccruedTopic, word(1n)],
        }]
      : { number: "0x64", hash: `0x${"d".repeat(64)}`, timestamp: "0x1" };
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
  const source = new RobinhoodJsonRpcSource(new URL("https://example.com"), [feeModule], fetchStub);

  await assert.rejects(() => source.getEvents(100n, 100n), /LOG_BLOCK_MISMATCH/);
});
