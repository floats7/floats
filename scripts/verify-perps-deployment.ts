import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const registryAbi = parseAbi(["function admin() view returns (address)", "function guardian() view returns (address)"]);
const oracleAbi = parseAbi(["function registry() view returns (address)"]);
const marginAbi = parseAbi(["function collateralToken() view returns (address)", "function registry() view returns (address)", "function admin() view returns (address)", "function riskEngine() view returns (address)"]);
const vaultAbi = parseAbi(["function asset() view returns (address)", "function admin() view returns (address)", "function guardian() view returns (address)", "function operationsPaused() view returns (bool)", "function minimumWithdrawalDelay() view returns (uint48)"]);
const fundingAbi = parseAbi(["function admin() view returns (address)", "function registry() view returns (address)", "function positionSource() view returns (address)"]);
const riskAbi = parseAbi(["function admin() view returns (address)", "function marginAccount() view returns (address)", "function registry() view returns (address)", "function oracle() view returns (address)", "function positionSource() view returns (address)", "function fundingEngine() view returns (address)"]);
const marketAbi = parseAbi(["function admin() view returns (address)", "function registry() view returns (address)", "function oracle() view returns (address)", "function fundingEngine() view returns (address)", "function riskEngine() view returns (address)", "function marginAccount() view returns (address)", "function liquidityVault() view returns (address)", "function liquidationEngine() view returns (address)", "function protocolFeeRecipient() view returns (address)"]);
const insuranceAbi = parseAbi(["function collateralToken() view returns (address)", "function admin() view returns (address)", "function isOperator(address) view returns (bool)"]);
const liquidationAbi = parseAbi(["function admin() view returns (address)", "function market() view returns (address)", "function marginAccount() view returns (address)", "function riskEngine() view returns (address)", "function insuranceFund() view returns (address)", "function liquidityVault() view returns (address)"]);
const fipoFeedAbi = parseAbi(["function vault() view returns (address)", "function decimals() view returns (uint8)", "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]);

function fail(message: string): never { throw new Error(`Perps deployment verification failed: ${message}`); }
function parseEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}
function required(values: ReadonlyMap<string, string>, key: string): string { const value = values.get(key)?.trim(); if (!value) fail(`${key} is required`); return value; }
function address(values: ReadonlyMap<string, string>, key: string): Address { try { return getAddress(required(values, key)); } catch { fail(`${key} is not a valid address`); } }
function integer(values: ReadonlyMap<string, string>, key: string): bigint { const value = required(values, key); if (!/^\d+$/.test(value)) fail(`${key} must be an integer`); return BigInt(value); }
function equal(label: string, actual: unknown, expected: unknown): void {
  const left = typeof actual === "string" ? actual.toLowerCase() : actual;
  const right = typeof expected === "string" ? expected.toLowerCase() : expected;
  if (left !== right) fail(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}`);
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: verify-perps-deployment.ts <environment-file>");
const values = parseEnvironment(environmentPath);
const environment = required(values, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") fail("APP_ENV must be testnet or mainnet");
const expectedChainId = integer(values, "CHAIN_ID");
const client = createPublicClient({ transport: http(values.get("RPC_INDEXER")?.trim() || required(values, "RPC_URL"), { timeout: 10_000 }) });
equal("chain ID", await client.getChainId(), Number(expectedChainId));

const contracts = {
  registry: address(values, "PERPS_REGISTRY_ADDRESS"), market: address(values, "PERPS_MARKET_ADDRESS"), oracle: address(values, "PERPS_ORACLE_ADDRESS"),
  margin: address(values, "PERPS_MARGIN_ACCOUNT_ADDRESS"), funding: address(values, "PERPS_FUNDING_ENGINE_ADDRESS"), risk: address(values, "PERPS_RISK_ENGINE_ADDRESS"),
  liquidation: address(values, "PERPS_LIQUIDATION_ENGINE_ADDRESS"), vault: address(values, "PERPS_LIQUIDITY_VAULT_ADDRESS"), insurance: address(values, "PERPS_INSURANCE_FUND_ADDRESS"),
  fipoFeed: address(values, "PERPS_FIPO_PRICE_FEED_ADDRESS"),
};
const governance = address(values, "TIMELOCK_ADDRESS");
const guardian = address(values, "GUARDIAN_ADDRESS");
const usdg = address(values, "USDG_ADDRESS");
const treasury = address(values, "TREASURY_ADDRESS");
for (const [name, contract] of Object.entries(contracts)) { const code = await client.getCode({ address: contract }); if (!code || code === "0x") fail(`${name} has no bytecode`); }
async function read(contract: Address, abi: readonly unknown[], functionName: string) { return client.readContract({ address: contract, abi, functionName } as never); }

equal("registry.admin", await read(contracts.registry, registryAbi, "admin"), governance);
equal("registry.guardian", await read(contracts.registry, registryAbi, "guardian"), guardian);
equal("oracle.registry", await read(contracts.oracle, oracleAbi, "registry"), contracts.registry);
equal("margin.collateralToken", await read(contracts.margin, marginAbi, "collateralToken"), usdg);
equal("margin.registry", await read(contracts.margin, marginAbi, "registry"), contracts.registry);
equal("margin.admin", await read(contracts.margin, marginAbi, "admin"), governance);
equal("margin.riskEngine", await read(contracts.margin, marginAbi, "riskEngine"), contracts.risk);
equal("vault.asset", await read(contracts.vault, vaultAbi, "asset"), usdg);
equal("vault.admin", await read(contracts.vault, vaultAbi, "admin"), governance);
equal("vault.guardian", await read(contracts.vault, vaultAbi, "guardian"), guardian);
equal("vault.operationsPaused", await read(contracts.vault, vaultAbi, "operationsPaused"), true);
equal("vault.minimumWithdrawalDelay", await read(contracts.vault, vaultAbi, "minimumWithdrawalDelay"), integer(values, "PERPS_WITHDRAWAL_DELAY_SECONDS"));
equal("funding.admin", await read(contracts.funding, fundingAbi, "admin"), governance);
equal("funding.registry", await read(contracts.funding, fundingAbi, "registry"), contracts.registry);
equal("funding.positionSource", await read(contracts.funding, fundingAbi, "positionSource"), contracts.market);
equal("risk.admin", await read(contracts.risk, riskAbi, "admin"), governance);
equal("risk.marginAccount", await read(contracts.risk, riskAbi, "marginAccount"), contracts.margin);
equal("risk.registry", await read(contracts.risk, riskAbi, "registry"), contracts.registry);
equal("risk.oracle", await read(contracts.risk, riskAbi, "oracle"), contracts.oracle);
equal("risk.positionSource", await read(contracts.risk, riskAbi, "positionSource"), contracts.market);
equal("risk.fundingEngine", await read(contracts.risk, riskAbi, "fundingEngine"), contracts.funding);
equal("market.admin", await read(contracts.market, marketAbi, "admin"), governance);
equal("market.registry", await read(contracts.market, marketAbi, "registry"), contracts.registry);
equal("market.oracle", await read(contracts.market, marketAbi, "oracle"), contracts.oracle);
equal("market.fundingEngine", await read(contracts.market, marketAbi, "fundingEngine"), contracts.funding);
equal("market.riskEngine", await read(contracts.market, marketAbi, "riskEngine"), contracts.risk);
equal("market.marginAccount", await read(contracts.market, marketAbi, "marginAccount"), contracts.margin);
equal("market.liquidityVault", await read(contracts.market, marketAbi, "liquidityVault"), contracts.vault);
equal("market.liquidationEngine", await read(contracts.market, marketAbi, "liquidationEngine"), contracts.liquidation);
equal("market.protocolFeeRecipient", await read(contracts.market, marketAbi, "protocolFeeRecipient"), treasury);
equal("insurance.collateralToken", await read(contracts.insurance, insuranceAbi, "collateralToken"), usdg);
equal("insurance.admin", await read(contracts.insurance, insuranceAbi, "admin"), governance);
equal("insurance liquidation operator", await client.readContract({ address: contracts.insurance, abi: insuranceAbi, functionName: "isOperator", args: [contracts.liquidation] }), true);
equal("liquidation.admin", await read(contracts.liquidation, liquidationAbi, "admin"), governance);
equal("liquidation.market", await read(contracts.liquidation, liquidationAbi, "market"), contracts.market);
equal("liquidation.marginAccount", await read(contracts.liquidation, liquidationAbi, "marginAccount"), contracts.margin);
equal("liquidation.riskEngine", await read(contracts.liquidation, liquidationAbi, "riskEngine"), contracts.risk);
equal("liquidation.insuranceFund", await read(contracts.liquidation, liquidationAbi, "insuranceFund"), contracts.insurance);
equal("liquidation.liquidityVault", await read(contracts.liquidation, liquidationAbi, "liquidityVault"), contracts.vault);
equal("fIPO feed vault", await read(contracts.fipoFeed, fipoFeedAbi, "vault"), address(values, "FLOATS_VAULT_ADDRESS"));
equal("fIPO feed decimals", await read(contracts.fipoFeed, fipoFeedAbi, "decimals"), 18);
const fipoRound = await client.readContract({ address: contracts.fipoFeed, abi: fipoFeedAbi, functionName: "latestRoundData" });
if (fipoRound[1] <= 0n || fipoRound[3] === 0n || fipoRound[4] < fipoRound[0]) fail("fIPO NAV price feed is unhealthy");
console.log(`Verified complete Perps ${environment} deployment wiring on chain ${expectedChainId}`);
