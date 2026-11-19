import { decodeAbiParameters, parseAbiParameters, toEventSelector, type Hex } from "viem";

const navDataParameters = parseAbiParameters(
  "uint256 nav18, uint256 canonicalTotalSupply, uint48 observedAt",
);

export const NAV_PUBLISHED_TOPIC = toEventSelector(
  "NavPublished(bytes32,uint32,uint64,uint256,uint256,uint48)",
);
export const NAV_MIRRORED_TOPIC = toEventSelector(
  "NavMirrored(bytes32,uint32,uint64,uint256,uint256,uint48)",
);
export const NAV_MESSAGE_TOPICS = [NAV_PUBLISHED_TOPIC, NAV_MIRRORED_TOPIC] as const;

export interface NavMessageRawLog {
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export function decodeNavMessageLog(log: NavMessageRawLog) {
  const topic = log.topics[0]?.toLowerCase();
  if (topic !== NAV_PUBLISHED_TOPIC.toLowerCase() && topic !== NAV_MIRRORED_TOPIC.toLowerCase()) {
    return undefined;
  }
  if (log.topics.length !== 4) throw new Error("NAV_MESSAGE_TOPICS_INVALID");
  const guid = word(log.topics[1], "NAV_MESSAGE_GUID_INVALID");
  const remoteEid = uintTopic(log.topics[2], 32, "NAV_MESSAGE_EID_INVALID");
  const sequence = uintTopic(log.topics[3], 64, "NAV_MESSAGE_SEQUENCE_INVALID");
  const [nav18, canonicalTotalSupply, observedAt] = decodeAbiParameters(
    navDataParameters,
    log.data,
  );
  if (nav18 === 0n || canonicalTotalSupply === 0n || observedAt === 0) {
    throw new Error("NAV_MESSAGE_VALUE_INVALID");
  }

  const common = {
    guid,
    sequence: sequence.toString(),
    nav18: nav18.toString(),
    canonicalTotalSupply: canonicalTotalSupply.toString(),
    observedAt: observedAt.toString(),
  };
  return topic === NAV_PUBLISHED_TOPIC.toLowerCase()
    ? { eventName: "NavPublished" as const, payload: { ...common, dstEid: remoteEid.toString() } }
    : { eventName: "NavMirrored" as const, payload: { ...common, srcEid: remoteEid.toString() } };
}

function word(value: Hex | undefined, error: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(error);
  return value.toLowerCase() as Hex;
}

function uintTopic(value: Hex | undefined, bits: 32 | 64, error: string): bigint {
  const parsed = BigInt(word(value, error));
  if (parsed === 0n || parsed > (1n << BigInt(bits)) - 1n) throw new Error(error);
  return parsed;
}
