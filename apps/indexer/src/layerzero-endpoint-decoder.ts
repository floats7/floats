import { decodeAbiParameters, keccak256, parseAbiParameters, toEventSelector, type Hex } from "viem";
import type { Address } from "./types.ts";

const alertParameters = parseAbiParameters(
  "(uint32 srcEid,bytes32 sender,uint64 nonce) origin,bytes32 guid,uint256 gas,uint256 value,bytes message,bytes extraData,bytes reason",
);

export const LZ_RECEIVE_ALERT_TOPIC = toEventSelector(
  "LzReceiveAlert(address,address,(uint32,bytes32,uint64),bytes32,uint256,uint256,bytes,bytes,bytes)",
);

export interface LayerZeroEndpointRawLog {
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export function decodeLayerZeroEndpointLog(log: LayerZeroEndpointRawLog) {
  if (log.topics[0]?.toLowerCase() !== LZ_RECEIVE_ALERT_TOPIC.toLowerCase()) return undefined;
  if (log.topics.length !== 3) throw new Error("LZ_RECEIVE_ALERT_TOPICS_INVALID");

  const receiverAddress = addressTopic(log.topics[1], "LZ_RECEIVE_ALERT_RECEIVER_INVALID");
  const executorAddress = addressTopic(log.topics[2], "LZ_RECEIVE_ALERT_EXECUTOR_INVALID");
  const [origin, guid, gas, value, message, extraData, reason] = decodeAbiParameters(
    alertParameters,
    log.data,
  );
  if (origin.srcEid === 0 || !/^0x[0-9a-fA-F]{64}$/.test(guid)) {
    throw new Error("LZ_RECEIVE_ALERT_ORIGIN_INVALID");
  }
  return {
    eventName: "LzReceiveAlert" as const,
    payload: {
      srcEid: origin.srcEid.toString(),
      sender: origin.sender.toLowerCase() as Hex,
      nonce: origin.nonce.toString(),
      guid: guid.toLowerCase() as Hex,
      receiverAddress,
      executorAddress,
      gas: gas.toString(),
      value: value.toString(),
      messageHash: keccak256(message),
      extraDataHash: keccak256(extraData),
      reasonHash: keccak256(reason),
    },
  };
}

function addressTopic(value: Hex | undefined, error: string): Address {
  if (!value || !/^0x0{24}[0-9a-fA-F]{40}$/.test(value)) throw new Error(error);
  const address = `0x${value.slice(-40)}`.toLowerCase();
  if (/^0x0{40}$/.test(address)) throw new Error(error);
  return address as Address;
}
