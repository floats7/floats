import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeFunctionData,
  pad,
  parseAbi,
  parseAbiParameters,
} from "viem";
import {
  decodeOftLog,
  OFT_RECEIVED_TOPIC,
  OFT_SENT_TOPIC,
} from "../src/oft-event-decoder.ts";

const sendAbi = parseAbi([
  "function send((uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd) sendParam,(uint256 nativeFee,uint256 lzTokenFee) fee,address refundAddress) payable returns ((bytes32 guid,uint64 nonce,(uint256 nativeFee,uint256 lzTokenFee) fee) receipt,(uint256 amountSentLD,uint256 amountReceivedLD) oftReceipt)",
]);
const address = (digit: string) => `0x${digit.repeat(40)}` as const;
const guid = `0x${"a".repeat(64)}` as const;
const sender = address("1");
const recipient = address("2");

test("OFTSent derives recipient and native fee from authenticated transaction calldata", () => {
  const input = encodeFunctionData({
    abi: sendAbi,
    functionName: "send",
    args: [
      {
        dstEid: 30_500,
        to: pad(recipient, { size: 32 }),
        amountLD: 2_000n,
        minAmountLD: 1_900n,
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x",
      },
      { nativeFee: 50n, lzTokenFee: 0n },
      sender,
    ],
  });
  const decoded = decodeOftLog(
    {
      topics: [OFT_SENT_TOPIC, guid, pad(sender, { size: 32 })],
      data: encodeAbiParameters(
        parseAbiParameters("uint32 dstEid, uint256 amountSentLD, uint256 amountReceivedLD"),
        [30_500, 2_000n, 1_995n],
      ),
    },
    input,
  );
  assert.deepEqual(decoded, {
    eventName: "OFTSent",
    payload: {
      guid,
      dstEid: "30500",
      fromAddress: sender,
      toAddress: recipient,
      amountSentLD: "2000",
      amountReceivedLD: "1995",
      nativeFee: "50",
      refundAddress: sender,
    },
  });
});

test("OFTSent refuses to invent a recipient when calldata is unavailable", () => {
  assert.throws(
    () =>
      decodeOftLog({
        topics: [OFT_SENT_TOPIC, guid, pad(sender, { size: 32 })],
        data: encodeAbiParameters(
          parseAbiParameters("uint32 dstEid, uint256 amountSentLD, uint256 amountReceivedLD"),
          [30_500, 2_000n, 1_995n],
        ),
      }),
    /OFT_SEND_TRANSACTION_INPUT_REQUIRED/,
  );
});

test("OFTReceived decodes the source EID, recipient, and credited amount", () => {
  const decoded = decodeOftLog({
    topics: [OFT_RECEIVED_TOPIC, guid, pad(recipient, { size: 32 })],
    data: encodeAbiParameters(
      parseAbiParameters("uint32 srcEid, uint256 amountReceivedLD"),
      [30_416, 1_995n],
    ),
  });
  assert.deepEqual(decoded, {
    eventName: "OFTReceived",
    payload: {
      guid,
      srcEid: "30416",
      toAddress: recipient,
      amountReceivedLD: "1995",
    },
  });
});
