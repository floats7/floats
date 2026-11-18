import { createPublicClient, encodeFunctionData, http, parseAbi, type Address } from "viem";

const RPC_URL = process.env.RPC_INDEXER ?? process.env.RPC_URL;
if (!RPC_URL) throw new Error("RPC_INDEXER or RPC_URL is required");

const REGISTRY = "0xe10b6f6b275de231345c20d14ab812db62151b00";
const CRCL = "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5";
const CALLER = "0x000000000000000000000000000000000000dEaD";
const SAMPLE = "0x0000000000000000000000000000000000000001";

const probes = [
  { component: "registry", address: REGISTRY, signature: "function upgradeTo(address)", args: [SAMPLE] },
  { component: "registry", address: REGISTRY, signature: "function blockAccounts(address[])", args: [[SAMPLE]] },
  { component: "registry", address: REGISTRY, signature: "function unblockAccounts(address[])", args: [[SAMPLE]] },
  { component: "registry", address: REGISTRY, signature: "function pause()", args: [] },
  { component: "registry", address: REGISTRY, signature: "function unpause()", args: [] },
  { component: "token", address: CRCL, signature: "function mint(address,uint256)", args: [SAMPLE, 1n] },
  { component: "token", address: CRCL, signature: "function burn(address,uint256)", args: [SAMPLE, 1n] },
  { component: "token", address: CRCL, signature: "function adminBurn(address,uint256)", args: [SAMPLE, 1n] },
  { component: "token", address: CRCL, signature: "function pause()", args: [] },
  { component: "token", address: CRCL, signature: "function unpause()", args: [] },
  { component: "token", address: CRCL, signature: "function pauseOracle()", args: [] },
  { component: "token", address: CRCL, signature: "function unpauseOracle()", args: [] },
  { component: "token", address: CRCL, signature: "function updateMultiplier(uint256)", args: [1n] },
  { component: "token", address: CRCL, signature: "function updateMultiplier(uint256,uint256)", args: [1n, 1n] },
  { component: "token", address: CRCL, signature: "function setMetadata(string,string)", args: ["x", "x"] },
] as const satisfies readonly {
  component: string;
  address: Address;
  signature: string;
  args: readonly unknown[];
}[];

const client = createPublicClient({ transport: http(RPC_URL) });

function findRevertData(error: unknown): string | null {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record.data === "string" && record.data.startsWith("0x")) return record.data;
    current = record.cause;
  }
  const match = String(error).match(/0xe2517d3f[0-9a-fA-F]{128}/);
  return match?.[0] ?? null;
}

function accessRole(data: string | null): string | null {
  if (!data?.startsWith("0xe2517d3f") || data.length < 138) return null;
  return `0x${data.slice(74, 138)}`;
}

async function inspectProbe(probe: (typeof probes)[number]) {
  const abi = parseAbi([probe.signature]);
  const functionName = probe.signature.match(/function\s+([^([]+)/)?.[1];
  if (!functionName) throw new Error(`Cannot parse function name from ${probe.signature}`);
  try {
    await client.call({
      account: CALLER,
      to: probe.address,
      data: encodeFunctionData({
        abi,
        functionName: functionName as never,
        args: probe.args as never,
      }),
    });
    return { component: probe.component, function: functionName, requiredRole: null, result: "call unexpectedly allowed" };
  } catch (error) {
    const role = accessRole(findRevertData(error));
    return {
      component: probe.component,
      function: functionName,
      requiredRole: role,
      result: role ? "access-control revert" : "non-access-control revert",
    };
  }
}

try {
  const chainId = await client.getChainId();
  const results = await Promise.all(probes.map(inspectProbe));
  console.log(JSON.stringify({ chainId, caller: CALLER, results }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown capability-role inspection failure";
  console.error(`Capability-role inspection failed: ${message}`);
  process.exitCode = 1;
}
