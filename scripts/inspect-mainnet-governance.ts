import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

const RPC_URL = process.env.RPC_INDEXER ?? process.env.RPC_URL;
if (!RPC_URL) throw new Error("RPC_INDEXER or RPC_URL is required");

const EXPECTED_CHAIN_ID = 4663;
const REGISTRY = "0xe10b6f6b275de231345c20d14ab812db62151b00";
const ZERO_ROLE = `0x${"00".repeat(32)}` as Hex;

const registryAbi = parseAbi([
  "function implementation() view returns (address)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)",
  "event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)",
  "event Upgraded(address indexed implementation)",
  "event Paused(address account)",
  "event Unpaused(address account)",
]);

const client = createPublicClient({ transport: http(RPC_URL) });

async function findDeploymentBlock(latestBlock: bigint): Promise<bigint> {
  let low = 0n;
  let high = latestBlock;
  while (low < high) {
    const midpoint = (low + high) / 2n;
    const code = await client.getCode({ address: REGISTRY, blockNumber: midpoint });
    if (code && code !== "0x") high = midpoint;
    else low = midpoint + 1n;
  }
  return low;
}

async function classify(address: Address) {
  const code = await client.getCode({ address });
  return code && code !== "0x" ? "contract" : "eoa";
}

async function inspect() {
  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Expected chain ${EXPECTED_CHAIN_ID}, received ${chainId}`);

  const latestBlock = await client.getBlockNumber();
  const deploymentBlock = await findDeploymentBlock(latestBlock);
  const logs = await client.getContractEvents({
    address: REGISTRY,
    abi: registryAbi,
    fromBlock: deploymentBlock,
    toBlock: latestBlock,
  });

  const activeMembership = new Map<string, { role: Hex; account: Address }>();
  const roles = new Set<Hex>([ZERO_ROLE]);
  const governanceEvents = [];

  for (const log of logs) {
    if (log.eventName === "RoleGranted" || log.eventName === "RoleRevoked") {
      const role = log.args.role;
      const rawAccount = log.args.account;
      const rawSender = log.args.sender;
      if (!role || !rawAccount || !rawSender) throw new Error("Malformed access-control event");
      const account = getAddress(rawAccount);
      const key = `${role}:${account.toLowerCase()}`;
      roles.add(role);
      if (log.eventName === "RoleGranted") activeMembership.set(key, { role, account });
      else activeMembership.delete(key);
      governanceEvents.push({
        event: log.eventName,
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
        role,
        account,
        sender: getAddress(rawSender),
      });
      continue;
    }

    governanceEvents.push({
      event: log.eventName,
      blockNumber: log.blockNumber.toString(),
      transactionHash: log.transactionHash,
      args: log.args,
    });
  }

  const members = await Promise.all([...activeMembership.values()].map(async ({ role, account }) => ({
    role,
    account,
    active: await client.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "hasRole",
      args: [role, account],
    }),
    accountType: await classify(account),
  })));
  const roleAdmins = await Promise.all([...roles].map(async (role) => ({
    role,
    adminRole: await client.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "getRoleAdmin",
      args: [role],
    }),
  })));
  const implementation = await client.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "implementation",
  });

  return {
    chainId,
    observedAtBlock: latestBlock.toString(),
    registry: getAddress(REGISTRY),
    deploymentBlock: deploymentBlock.toString(),
    implementation,
    eventCount: logs.length,
    roleAdmins,
    activeMembers: members.filter((member) => member.active),
    governanceEvents,
  };
}

try {
  console.log(JSON.stringify(await inspect(), (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown governance inspection failure";
  console.error(`Governance inspection failed: ${message}`);
  process.exitCode = 1;
}
