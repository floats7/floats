import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";

const [environmentPath, expiryInput, contractSizeInput = "100000000000000"] = process.argv.slice(2);
if (!environmentPath || !expiryInput || !/^\.env\.(testnet|mainnet)$/.test(environmentPath)) {
  throw new Error("Usage: generate-options-beta-series.ts <environment-file> <expiry> [contract-size-18]");
}
const environment = Object.fromEntries(readFileSync(environmentPath, "utf8").split(/\r?\n/).flatMap((line) => {
  const separator = line.indexOf("=");
  return separator > 0 && !line.startsWith("#") ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
}));
const required = (key: string): string => {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const expiry = Number(expiryInput);
if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1_000)) throw new Error("Expiry is invalid");
if (!/^[1-9][0-9]*$/.test(contractSizeInput)) throw new Error("Contract size is invalid");

const client = createPublicClient({ transport: http(required("RPC_URL")) });
const registry = required("INDEX_REGISTRY_ADDRESS") as `0x${string}`;
const priceSource = required("OPTIONS_PRICE_ORACLE_ADDRESS") as `0x${string}`;
const registryAbi = parseAbi([
  "function getActiveTokens() view returns (address[])",
  "function getConstituent(address) view returns (address feed,bytes32 uid,uint16 targetWeightBps,uint48 eligibleFrom,uint48 exitAfter,uint8 status)",
]);
const oracleAbi = parseAbi(["function currentPrice(address) view returns (uint256 priceUsd18,bool healthy)"]);
const tokens = await client.readContract({ address: registry, abi: registryAbi, functionName: "getActiveTokens" });
const series = [];
for (const underlying of tokens) {
  const [constituent, price] = await Promise.all([
    client.readContract({ address: registry, abi: registryAbi, functionName: "getConstituent", args: [underlying] }),
    client.readContract({ address: priceSource, abi: oracleAbi, functionName: "currentPrice", args: [underlying] }),
  ]);
  if (!price[1] || price[0] === 0n) throw new Error(`Price is unavailable for ${underlying}`);
  const common = {
    underlying: underlying.toLowerCase(),
    underlyingUid: constituent[1],
    priceSource: priceSource.toLowerCase(),
    strikeUsd18: price[0].toString(),
    expiry,
    contractSize18: contractSizeInput,
    corporateActionPolicyVersion: 1,
  };
  series.push({ ...common, kind: 0, capUsd18: (price[0] * 120n / 100n).toString() });
  series.push({ ...common, kind: 1, capUsd18: "0" });
}
process.stdout.write(JSON.stringify(series));
