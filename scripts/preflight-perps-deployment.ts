import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, isAddress, keccak256, parseAbi, toBytes, zeroAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function fail(message: string): never { throw new Error(`Perps preflight failed: ${message}`); }
function parseEnvironment(path: string): ReadonlyMap<string, string> { const values = new Map<string, string>(); for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const separator = line.indexOf("="); if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1)); } return values; }
function required(values: ReadonlyMap<string, string>, key: string): string { const value = values.get(key)?.trim(); if (!value) fail(`${key} is required`); return value; }
function address(values: ReadonlyMap<string, string>, key: string): Address { try { const result = getAddress(required(values, key)); if (result === "0x0000000000000000000000000000000000000000") fail(`${key} cannot be zero`); return result; } catch { fail(`${key} is invalid`); } }
function integer(values: ReadonlyMap<string, string>, key: string): bigint { const value = required(values, key); if (!/^[1-9][0-9]*$/.test(value)) fail(`${key} must be a positive integer`); return BigInt(value); }

const [environmentPath, ...marketPaths] = process.argv.slice(2);
if (!environmentPath) fail("usage: preflight-perps-deployment.ts <environment-file> [market-config.json ...]");
const values = parseEnvironment(environmentPath);
const environment = required(values, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") fail("APP_ENV must be testnet or mainnet");
const chainId = integer(values, "CHAIN_ID");
const expectedChainId = environment === "mainnet" ? 4663n : 46630n;
if (chainId !== expectedChainId) fail(`${environment} CHAIN_ID must be ${expectedChainId}`);
const rpcUrl = values.get("RPC_INDEXER")?.trim() || required(values, "RPC_URL");
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 10_000 }) });
if (BigInt(await client.getChainId()) !== chainId) fail("RPC chain ID does not match CHAIN_ID");
const core = {
  usdg: address(values, "USDG_ADDRESS"), timelock: address(values, "TIMELOCK_ADDRESS"),
  guardian: address(values, "GUARDIAN_ADDRESS"), treasury: address(values, "TREASURY_ADDRESS"), keeper: address(values, "KEEPER_ADDRESS"), admin: address(values, "ADMIN_ADDRESS"),
};
if (!required(values, "PERPS_DEPLOYMENT_VERSION").match(/^[A-Za-z0-9._-]{1,64}$/)) fail("PERPS_DEPLOYMENT_VERSION is invalid");
const withdrawalDelay = integer(values, "PERPS_WITHDRAWAL_DELAY_SECONDS");
if (withdrawalDelay > 30n * 86_400n) fail("PERPS_WITHDRAWAL_DELAY_SECONDS exceeds 30 days");
for (const name of ["usdg", "timelock"] as const) { const code = await client.getCode({ address: core[name] }); if (!code || code === "0x") fail(`${name} has no bytecode`); }
const timelockAbi = parseAbi(["function getMinDelay() view returns (uint256)", "function hasRole(bytes32 role,address account) view returns (bool)"]);
const configuredDelay = integer(values, "TIMELOCK_DELAY_SECONDS");
const observedDelay = await client.readContract({ address: core.timelock, abi: timelockAbi, functionName: "getMinDelay" });
if (observedDelay !== configuredDelay || observedDelay !== 300n) fail("timelock delay must match the configured 300 seconds");
const proposerRole = keccak256(toBytes("PROPOSER_ROLE"));
const executorRole = keccak256(toBytes("EXECUTOR_ROLE"));
const [adminIsProposer, adminIsExecutor, executorIsOpen] = await Promise.all([
  client.readContract({ address: core.timelock, abi: timelockAbi, functionName: "hasRole", args: [proposerRole, core.admin] }),
  client.readContract({ address: core.timelock, abi: timelockAbi, functionName: "hasRole", args: [executorRole, core.admin] }),
  client.readContract({ address: core.timelock, abi: timelockAbi, functionName: "hasRole", args: [executorRole, zeroAddress] }),
]);
if (!adminIsProposer) fail("ADMIN_ADDRESS is not a timelock proposer");
if (!adminIsExecutor && !executorIsOpen) fail("timelock execution is unavailable to ADMIN_ADDRESS and is not open");
const deployerKey = required(values, "DEPLOYER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(deployerKey)) fail("DEPLOYER_PRIVATE_KEY is invalid");
const deployer = privateKeyToAccount(deployerKey as `0x${string}`);
const configuredDeployer = values.get("DEPLOYER_ADDRESS")?.trim();
if (configuredDeployer && (!isAddress(configuredDeployer) || getAddress(configuredDeployer) !== deployer.address)) fail("DEPLOYER_PRIVATE_KEY does not match DEPLOYER_ADDRESS");
if (await client.getBalance({ address: deployer.address }) === 0n) fail("deployer has no native gas balance");
const adminKey = required(values, "ADMIN_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(adminKey)) fail("ADMIN_PRIVATE_KEY is invalid");
if (privateKeyToAccount(adminKey as `0x${string}`).address.toLowerCase() !== core.admin.toLowerCase()) fail("ADMIN_PRIVATE_KEY does not match ADMIN_ADDRESS");
const privateKey = values.get("KEEPER_PRIVATE_KEY")?.trim();
if (privateKey) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail("KEEPER_PRIVATE_KEY is invalid");
  if (privateKeyToAccount(privateKey as `0x${string}`).address.toLowerCase() !== core.keeper.toLowerCase()) fail("KEEPER_PRIVATE_KEY does not match KEEPER_ADDRESS");
}
const feedAbi = parseAbi(["function decimals() view returns (uint8)", "function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)"]);
for (const path of marketPaths) {
  const market = JSON.parse(readFileSync(path, "utf8")) as { chainId?: unknown; symbol?: unknown; underlyingAddress?: unknown; priceFeedAddress?: unknown; priceFeedEnvironmentKey?: unknown; marketState?: unknown };
  if (market.chainId !== Number(chainId)) fail(`${path} chainId mismatch`);
  if (typeof market.symbol !== "string" || !/^[A-Z0-9-]+-PERP$/.test(market.symbol)) fail(`${path} symbol is invalid`);
  if (typeof market.underlyingAddress !== "string" || !isAddress(market.underlyingAddress)) fail(`${path} underlyingAddress is invalid`);
  const configuredFeed = typeof market.priceFeedAddress === "string"
    ? market.priceFeedAddress
    : typeof market.priceFeedEnvironmentKey === "string"
      ? values.get(market.priceFeedEnvironmentKey)?.trim()
      : undefined;
  if (!configuredFeed || !isAddress(configuredFeed)) fail(`${path} requires an official priceFeedAddress`);
  if (market.marketState !== "disabled") fail(`${path} must start disabled`);
  const feed = getAddress(configuredFeed);
  const code = await client.getCode({ address: feed });
  if (!code || code === "0x") fail(`${path} price feed has no bytecode`);
  const [decimals, round] = await Promise.all([
    client.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
    client.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
  ]);
  if (decimals > 36 || round[1] <= 0n || round[3] === 0n || round[4] < round[0]) fail(`${path} official feed is unhealthy`);
}
console.log(`Perps ${environment} preflight passed for chain ${chainId} and ${marketPaths.length} market configuration(s); no transaction was sent`);
