import assert from "node:assert/strict";
import test from "node:test";

import { decodeFloatsCoreLog } from "../src/event-decoder.ts";
import { RobinhoodJsonRpcSource } from "../src/json-rpc-source.ts";

const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}` as const;
const blockHash = `0x${"a".repeat(64)}` as const;
const transactionHash = `0x${"b".repeat(64)}` as const;
const feeModule = `0x${"c".repeat(40)}` as const;
const feesAccruedTopic = "0x3f0efd667efe2a4e661231bb42b65ce017c3326fb50d12aa6f936500d58c1c02";

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
