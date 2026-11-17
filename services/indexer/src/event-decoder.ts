import type { Address, Hex } from "./types.ts";

type SolidityType = "address" | "bool" | "bytes32" | `uint${number}`;

interface EventInput {
  readonly name: string;
  readonly type: SolidityType;
  readonly indexed: boolean;
}

interface EventDefinition {
  readonly name: string;
  readonly topic: Hex;
  readonly inputs: readonly EventInput[];
}

export interface RawEvmLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export interface DecodedLogPayload {
  readonly eventName: string;
  readonly payload: Readonly<Record<string, string | boolean>>;
}

const input = (name: string, type: SolidityType, indexed = false): EventInput => ({
  name,
  type,
  indexed,
});

const EVENTS: readonly EventDefinition[] = [
  { name: "CashOperationsPauseSet", topic: "0x1c029cd8546058b632883c8d772f93d2ceb63372643cd0abdfe85a1ca99db028", inputs: [input("paused", "bool")] },
  { name: "Deposit", topic: "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7", inputs: [input("sender", "address", true), input("owner", "address", true), input("assets", "uint256"), input("shares", "uint256")] },
  { name: "DepositsPauseSet", topic: "0xc4c5fe831919701973bb88552e707619b78efcd47308ccfbf666b97262111146", inputs: [input("paused", "bool")] },
  { name: "FeeModuleSet", topic: "0xed77a117a5df89639cce58296b7a06a099531fba2e55e1381162c0f9216f3c64", inputs: [input("previousModule", "address", true), input("newModule", "address", true)] },
  { name: "InKindRedeemed", topic: "0xd178b2b91f28dc928f228f3a16b3df6eb91b483099f8a0632d7a399d27b0fc15", inputs: [input("caller", "address", true), input("receiver", "address", true), input("owner", "address", true), input("shares", "uint256")] },
  { name: "TransactionFeeCharged", topic: "0xf9688c89b442738ef6269df03d91bfb4c1233c0dcf1f31be1dfa6073c7478b9f", inputs: [input("payer", "address", true), input("token", "address", true), input("amount", "uint256"), input("paidInShares", "bool")] },
  { name: "RebalancerSet", topic: "0x64187bd7b97e66658c91904f3021d7c28de967281d18b1a20742348afdd6a6b3", inputs: [input("previousRebalancer", "address", true), input("newRebalancer", "address", true)] },
  { name: "TvlCapSet", topic: "0x3998a969459814a9349f6fc0f83811b6504bd355b816b95976af3e4dc02f3d5d", inputs: [input("previousCap", "uint256"), input("newCap", "uint256")] },
  { name: "Withdraw", topic: "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db", inputs: [input("sender", "address", true), input("receiver", "address", true), input("owner", "address", true), input("assets", "uint256"), input("shares", "uint256")] },
  { name: "ConfigurationCancelled", topic: "0xe241dd64c49b8c6caa230df8e27c1ec09bb8149c937360b27c56d681b0f82892", inputs: [input("configurationHash", "bytes32", true)] },
  { name: "ConfigurationExecuted", topic: "0x890b12fc42967b4050918f5b07dc0814215816be7ab2d07211a75a15889d9a42", inputs: [input("configurationHash", "bytes32", true), input("version", "uint64", true)] },
  { name: "ConfigurationProposed", topic: "0x6221c68756c3775c36c65198e7aadf48806db2c0748c734c7346a558c99a04cf", inputs: [input("configurationHash", "bytes32", true), input("validAfter", "uint48")] },
  { name: "ConstituentConfigured", topic: "0x3805f6b9eeb9a2f9cb354438b55b37beae08459672b9cc160366892fb690a5db", inputs: [input("token", "address", true), input("feed", "address", true), input("uid", "bytes32", true), input("targetWeightBps", "uint16"), input("eligibleFrom", "uint48"), input("exitAfter", "uint48"), input("version", "uint64")] },
  { name: "ConstituentRemoved", topic: "0x9e7dda9b8761b0e585637a2ccc6afb81fefb9df964c5f92ed99676026abf6412", inputs: [input("token", "address", true), input("version", "uint64", true)] },
  { name: "FeesAccrued", topic: "0x3f0efd667efe2a4e661231bb42b65ce017c3326fb50d12aa6f936500d58c1c02", inputs: [input("timestamp", "uint256", true), input("elapsed", "uint256"), input("sharesMinted", "uint256")] },
  { name: "RatesSet", topic: "0x9af2e94c19992d3f918ea9b2f0b12e8f76db636d960bc86a3c03f2736519fe3c", inputs: [input("managementBps", "uint16"), input("cashBps", "uint16"), input("inKindBps", "uint16"), input("offHoursBps", "uint16")] },
  { name: "TreasurySet", topic: "0x21eb548722a564f6e09f039f7aa858ae94c911910f3823b37af2250eeca4f403", inputs: [input("previousTreasury", "address", true), input("newTreasury", "address", true)] },
  { name: "ChunkLimitSet", topic: "0x27fa6dc3bec86b414c5c360d945a23681831e527a8273e06309e00fb0029b89f", inputs: [input("token", "address", true), input("previousLimit", "uint256"), input("newLimit", "uint256")] },
  { name: "InstructionAuthorized", topic: "0x1334b376052c8489506e855ae1f597cee3aa4e25058b1459e07db88d70f75a7b", inputs: [input("instructionHash", "bytes32", true), input("validAfter", "uint48"), input("deadline", "uint48")] },
  { name: "InstructionCancelled", topic: "0xb07cb16596c341e185f27947e60626883841e592815516fd06768118bb6b4476", inputs: [input("instructionHash", "bytes32", true)] },
  { name: "InstructionExecuted", topic: "0xab96402b40e21945409c45fbe054db07b0189c17f2dd15416c83ef8aebe33c89", inputs: [input("instructionHash", "bytes32", true), input("instructionId", "bytes32", true), input("keeper", "address", true), input("amountIn", "uint256"), input("amountOut", "uint256")] },
  { name: "KeeperSet", topic: "0x8dd62d4e1f60b96148552898e743aa2b571686baa26f4f1b647565dc3996c1a7", inputs: [input("keeper", "address", true), input("allowed", "bool")] },
];

const BY_TOPIC = new Map(EVENTS.map((event) => [event.topic.toLowerCase(), event]));

export const FLOATS_CORE_EVENT_TOPICS: readonly Hex[] = EVENTS.map((event) => event.topic);

export function decodeFloatsCoreLog(log: RawEvmLog): DecodedLogPayload | undefined {
  const topic0 = log.topics[0];
  if (!topic0) throw new Error("LOG_MISSING_EVENT_TOPIC");
  const definition = BY_TOPIC.get(topic0.toLowerCase());
  if (!definition) return undefined;

  const dataWords = splitWords(log.data);
  const expectedTopics = definition.inputs.filter((item) => item.indexed).length + 1;
  const expectedWords = definition.inputs.length - expectedTopics + 1;
  if (log.topics.length !== expectedTopics || dataWords.length !== expectedWords) {
    throw new Error("MALFORMED_EVENT_DATA");
  }

  let topicIndex = 1;
  let dataIndex = 0;
  const payload: Record<string, string | boolean> = {};
  for (const eventInput of definition.inputs) {
    const word = eventInput.indexed ? log.topics[topicIndex++] : dataWords[dataIndex++];
    if (!word) throw new Error("MALFORMED_EVENT_DATA");
    payload[eventInput.name] = decodeWord(word, eventInput.type);
  }
  return { eventName: definition.name, payload };
}

function splitWords(data: Hex): Hex[] {
  const raw = data.slice(2);
  if (raw.length % 64 !== 0 || !/^[0-9a-fA-F]*$/.test(raw)) throw new Error("MALFORMED_EVENT_DATA");
  return Array.from({ length: raw.length / 64 }, (_, index) => `0x${raw.slice(index * 64, (index + 1) * 64)}` as Hex);
}

function decodeWord(word: Hex, type: SolidityType): string | boolean {
  if (!/^0x[0-9a-fA-F]{64}$/.test(word)) throw new Error("MALFORMED_EVENT_WORD");
  if (type === "bytes32") return word.toLowerCase();
  if (type === "address") return `0x${word.slice(-40).toLowerCase()}`;
  const value = BigInt(word);
  if (type === "bool") {
    if (value !== 0n && value !== 1n) throw new Error("INVALID_BOOLEAN_WORD");
    return value === 1n;
  }
  return value.toString();
}
