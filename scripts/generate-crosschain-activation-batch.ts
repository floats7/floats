import { readFileSync } from "node:fs";
import { encodeFunctionData, pad, parseAbi, type Address, type Hex } from "viem";
import {
  parseCrossChainActivationConfig,
  type CrossChainEnvironment,
  type TokenRateLimits,
} from "../packages/crosschain/src/index.ts";

const peerAbi = parseAbi(["function setPeer(uint32 eid,bytes32 peer)"]);
const controlsAbi = parseAbi([
  "function setRateLimit(uint32 eid,bool inbound,uint128 capacity,uint64 window)",
]);

interface Operation {
  readonly chain: "hub" | "spoke";
  readonly label: string;
  readonly target: Address;
  readonly value: "0";
  readonly data: Hex;
}

interface ExpectedContractState {
  readonly chain: Operation["chain"];
  readonly label: string;
  readonly contract: Address;
  readonly owner: Address;
  readonly guardian?: Address;
  readonly bridgePaused?: false;
}

function fail(message: string): never {
  throw new Error(`Cross-chain activation batch failed: ${message}`);
}

function environment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return values;
}

function peer(
  chain: Operation["chain"],
  label: string,
  target: Address,
  remoteEid: number,
  remote: Address,
): Operation {
  return {
    chain,
    label,
    target,
    value: "0",
    data: encodeFunctionData({
      abi: peerAbi,
      functionName: "setPeer",
      args: [remoteEid, pad(remote, { size: 32 })],
    }),
  };
}

function rateOperations(
  symbol: string,
  hub: Address,
  spoke: Address,
  hubEid: number,
  spokeEid: number,
  limits: TokenRateLimits,
): readonly Operation[] {
  const rate = (
    chain: Operation["chain"],
    direction: "inbound" | "outbound",
    target: Address,
    eid: number,
    capacity: bigint,
  ): Operation => ({
    chain,
    label: `${symbol}-${direction}-rate-limit`,
    target,
    value: "0",
    data: encodeFunctionData({
      abi: controlsAbi,
      functionName: "setRateLimit",
      args: [eid, direction === "inbound", capacity, BigInt(limits.windowSeconds)],
    }),
  });
  return [
    rate("hub", "outbound", hub, spokeEid, limits.hubOutbound),
    rate("hub", "inbound", hub, spokeEid, limits.hubInbound),
    rate("spoke", "outbound", spoke, hubEid, limits.spokeOutbound),
    rate("spoke", "inbound", spoke, hubEid, limits.spokeInbound),
  ];
}

const path = process.argv[2];
if (!path) fail("usage: generate-crosschain-activation-batch.ts <environment-file>");
const values = environment(path);
const appEnvironment = values.get("APP_ENV");
if (appEnvironment !== "testnet" && appEnvironment !== "mainnet") {
  fail("APP_ENV must be testnet or mainnet");
}
const raw = values.get("CROSSCHAIN_ACTIVATION_CONFIG_JSON");
if (!raw) fail("CROSSCHAIN_ACTIVATION_CONFIG_JSON is required");
const config = parseCrossChainActivationConfig(raw, appEnvironment as CrossChainEnvironment);

const operations: readonly Operation[] = [
  peer("hub", "fIPO-peer", config.hub.fipo, config.spoke.eid, config.spoke.fipo),
  peer("hub", "FLOATS-peer", config.hub.floats, config.spoke.eid, config.spoke.floats),
  peer("hub", "NAV-peer", config.hub.nav, config.spoke.eid, config.spoke.nav),
  peer("spoke", "fIPO-peer", config.spoke.fipo, config.hub.eid, config.hub.fipo),
  peer("spoke", "FLOATS-peer", config.spoke.floats, config.hub.eid, config.hub.floats),
  peer("spoke", "NAV-peer", config.spoke.nav, config.hub.eid, config.hub.nav),
  ...rateOperations(
    "fIPO",
    config.hub.fipo,
    config.spoke.fipo,
    config.hub.eid,
    config.spoke.eid,
    config.fipo,
  ),
  ...rateOperations(
    "FLOATS",
    config.hub.floats,
    config.spoke.floats,
    config.hub.eid,
    config.spoke.eid,
    config.floats,
  ),
];

const expectedState: readonly ExpectedContractState[] = [
  {
    chain: "hub",
    label: "fIPO adapter",
    contract: config.hub.fipo,
    owner: config.hub.governance,
    guardian: config.hub.guardian,
    bridgePaused: false,
  },
  {
    chain: "hub",
    label: "FLOATS adapter",
    contract: config.hub.floats,
    owner: config.hub.governance,
    guardian: config.hub.guardian,
    bridgePaused: false,
  },
  {
    chain: "hub",
    label: "NAV publisher",
    contract: config.hub.nav,
    owner: config.hub.governance,
  },
  {
    chain: "spoke",
    label: "fIPO OFT",
    contract: config.spoke.fipo,
    owner: config.spoke.governance,
    guardian: config.spoke.guardian,
    bridgePaused: false,
  },
  {
    chain: "spoke",
    label: "FLOATS OFT",
    contract: config.spoke.floats,
    owner: config.spoke.governance,
    guardian: config.spoke.guardian,
    bridgePaused: false,
  },
  {
    chain: "spoke",
    label: "NAV mirror",
    contract: config.spoke.nav,
    owner: config.spoke.governance,
  },
];

console.log(JSON.stringify({
  schemaVersion: 2,
  environment: config.environment,
  roles: {
    hub: { governance: config.hub.governance, guardian: config.hub.guardian },
    spoke: { governance: config.spoke.governance, guardian: config.spoke.guardian },
  },
  operations,
  expectedState,
}, null, 2));
