import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, keccak256, pad, parseAbiParameters } from "viem";
import {
  decodeLayerZeroEndpointLog,
  LZ_RECEIVE_ALERT_TOPIC,
} from "../src/layerzero-endpoint-decoder.ts";

const address = (digit: string) => `0x${digit.repeat(40)}` as const;
const guid = `0x${"a".repeat(64)}` as const;
const message = "0x1234" as const;
const extraData = "0x5678" as const;
const reason = "0xdeadbeef" as const;

test("decodes retry evidence without exposing raw packet payloads", () => {
  const receiver = address("1");
  const executor = address("2");
  const sender = pad(address("3"), { size: 32 });
  const decoded = decodeLayerZeroEndpointLog({
    topics: [LZ_RECEIVE_ALERT_TOPIC, pad(receiver, { size: 32 }), pad(executor, { size: 32 })],
    data: encodeAbiParameters(
      parseAbiParameters(
        "(uint32 srcEid,bytes32 sender,uint64 nonce) origin,bytes32 guid,uint256 gas,uint256 value,bytes message,bytes extraData,bytes reason",
      ),
      [{ srcEid: 40_001, sender, nonce: 7n }, guid, 250_000n, 0n, message, extraData, reason],
    ),
  });
  assert.deepEqual(decoded, {
    eventName: "LzReceiveAlert",
    payload: {
      srcEid: "40001",
      sender,
      nonce: "7",
      guid,
      receiverAddress: receiver,
      executorAddress: executor,
      gas: "250000",
      value: "0",
      messageHash: keccak256(message),
      extraDataHash: keccak256(extraData),
      reasonHash: keccak256(reason),
    },
  });
});

test("rejects malformed endpoint alert topics", () => {
  assert.throws(
    () => decodeLayerZeroEndpointLog({ topics: [LZ_RECEIVE_ALERT_TOPIC], data: "0x" }),
    /TOPICS_INVALID/,
  );
});
