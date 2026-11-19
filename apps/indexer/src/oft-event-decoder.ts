import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbi,
  parseAbiParameters,
  toEventSelector,
  type Hex,
} from "viem";
import type { Address } from "./types.ts";

const oftAbi = parseAbi([
  "function send((uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd) sendParam,(uint256 nativeFee,uint256 lzTokenFee) fee,address refundAddress) payable returns ((bytes32 guid,uint64 nonce,(uint256 nativeFee,uint256 lzTokenFee) fee) receipt,(uint256 amountSentLD,uint256 amountReceivedLD) oftReceipt)",
]);
const sentDataParameters = parseAbiParameters(
  "uint32 dstEid, uint256 amountSentLD, uint256 amountReceivedLD",
);
const receivedDataParameters = parseAbiParameters("uint32 srcEid, uint256 amountReceivedLD");

export const OFT_SENT_TOPIC = toEventSelector(
  "OFTSent(bytes32,uint32,address,uint256,uint256)",
);
export const OFT_RECEIVED_TOPIC = toEventSelector(
  "OFTReceived(bytes32,uint32,address,uint256)",
);
export const OFT_EVENT_TOPICS = [OFT_SENT_TOPIC, OFT_RECEIVED_TOPIC] as const;

export interface OftRawLog {
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export interface DecodedOftSent {
  readonly eventName: "OFTSent";
  readonly payload: {
    readonly guid: Hex;
    readonly dstEid: string;
    readonly fromAddress: Address;
    readonly toAddress: Address;
    readonly amountSentLD: string;
    readonly amountReceivedLD: string;
    readonly nativeFee: string;
    readonly refundAddress: Address;
  };
}

export interface DecodedOftReceived {
  readonly eventName: "OFTReceived";
  readonly payload: {
    readonly guid: Hex;
    readonly srcEid: string;
    readonly toAddress: Address;
    readonly amountReceivedLD: string;
  };
}

export type DecodedOftEvent = DecodedOftSent | DecodedOftReceived;

export function decodeOftLog(
  log: OftRawLog,
  transactionInput?: Hex,
): DecodedOftEvent | undefined {
  const topic = log.topics[0]?.toLowerCase();
  if (topic === OFT_SENT_TOPIC.toLowerCase()) return decodeSent(log, transactionInput);
  if (topic === OFT_RECEIVED_TOPIC.toLowerCase()) return decodeReceived(log);
  return undefined;
}

function decodeSent(log: OftRawLog, transactionInput?: Hex): DecodedOftSent {
  if (log.topics.length !== 3) throw new Error("OFT_SENT_TOPICS_INVALID");
  if (!transactionInput) throw new Error("OFT_SEND_TRANSACTION_INPUT_REQUIRED");
  const guid = bytes32Topic(log.topics[1], "OFT_SENT_GUID_INVALID");
  const fromAddress = addressTopic(log.topics[2], "OFT_SENT_FROM_INVALID");
  const [dstEid, amountSentLD, amountReceivedLD] = decodeAbiParameters(
    sentDataParameters,
    log.data,
  );
  const decodedCall = decodeFunctionData({ abi: oftAbi, data: transactionInput });
  if (decodedCall.functionName !== "send") throw new Error("OFT_SEND_CALL_INVALID");
  const [sendParam, fee, refundAddress] = decodedCall.args;
  if (sendParam.dstEid !== dstEid) throw new Error("OFT_SEND_DESTINATION_MISMATCH");
  if (sendParam.amountLD < amountSentLD || sendParam.minAmountLD > amountReceivedLD) {
    throw new Error("OFT_SEND_AMOUNT_MISMATCH");
  }
  return {
    eventName: "OFTSent",
    payload: {
      guid,
      dstEid: dstEid.toString(),
      fromAddress,
      toAddress: bytes32Address(sendParam.to),
      amountSentLD: amountSentLD.toString(),
      amountReceivedLD: amountReceivedLD.toString(),
      nativeFee: fee.nativeFee.toString(),
      refundAddress: normalizeAddress(refundAddress),
    },
  };
}

function decodeReceived(log: OftRawLog): DecodedOftReceived {
  if (log.topics.length !== 3) throw new Error("OFT_RECEIVED_TOPICS_INVALID");
  const guid = bytes32Topic(log.topics[1], "OFT_RECEIVED_GUID_INVALID");
  const toAddress = addressTopic(log.topics[2], "OFT_RECEIVED_TO_INVALID");
  const [srcEid, amountReceivedLD] = decodeAbiParameters(receivedDataParameters, log.data);
  return {
    eventName: "OFTReceived",
    payload: {
      guid,
      srcEid: srcEid.toString(),
      toAddress,
      amountReceivedLD: amountReceivedLD.toString(),
    },
  };
}

function bytes32Address(value: Hex): Address {
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(value)) throw new Error("OFT_RECIPIENT_NOT_EVM_ADDRESS");
  return normalizeAddress(`0x${value.slice(-40)}`);
}

function addressTopic(value: Hex | undefined, error: string): Address {
  if (!value || !/^0x0{24}[0-9a-fA-F]{40}$/.test(value)) throw new Error(error);
  return normalizeAddress(`0x${value.slice(-40)}`);
}

function bytes32Topic(value: Hex | undefined, error: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(error);
  return value.toLowerCase() as Hex;
}

function normalizeAddress(value: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error("OFT_ADDRESS_INVALID");
  }
  return value.toLowerCase() as Address;
}
