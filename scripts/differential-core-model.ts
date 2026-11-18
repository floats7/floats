import { readFileSync } from "node:fs";
import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  type Address,
} from "viem";

const BPS_DENOMINATOR = 10_000n;
const INTERNAL_SCALE = 10n ** 18n;
const INTERNAL_TO_USDG = 10n ** 12n;

const registryAbi = parseAbi(["function getActiveTokens() view returns (address[])"]);
const navOracleAbi = parseAbi(["function normalizedPrice(address token) view returns (uint256)"]);
const quoteOracleAbi = parseAbi([
  "function quote(address tokenIn,address tokenOut,uint256 amountIn) view returns (uint256)",
]);
const rebalancerAbi = parseAbi([
  "function calculateDelta(uint256 currentValue,uint16 targetWeightBps,uint256 totalValue) pure returns (int256)",
]);
const feeModuleAbi = parseAbi([
  "function rates() view returns (uint16 managementBps,uint16 cashBps,uint16 inKindBps,uint16 offHoursBps)",
  "function calculateFee(uint256 amount,uint8 kind) view returns (uint256)",
  "function grossAmount(uint256 netAmount,uint8 kind) view returns (uint256)",
]);

const [environmentPath] = process.argv.slice(2);
if (!environmentPath) {
  throw new Error("usage: npm run test:differential -- <environment-file>");
}

const environment = loadEnvironment(environmentPath);
const chainId = Number(required(environment, "CHAIN_ID"));
const client = createPublicClient({
  transport: http(required(environment, "RPC_INDEXER")),
});
const addresses = {
  usdg: requiredAddress(environment, "USDG_ADDRESS"),
  registry: requiredAddress(environment, "INDEX_REGISTRY_ADDRESS"),
  navOracle: requiredAddress(environment, "NAV_ORACLE_ADDRESS"),
  quoteOracle: requiredAddress(environment, "SWAP_QUOTE_ORACLE_ADDRESS"),
  rebalancer: requiredAddress(environment, "REBALANCER_ADDRESS"),
  feeModule: requiredAddress(environment, "FEE_MODULE_ADDRESS"),
};

const observedChainId = await client.getChainId();
if (observedChainId !== chainId) {
  throw new Error(`RPC chain mismatch: expected ${chainId}, observed ${observedChainId}`);
}
const blockNumber = await client.getBlockNumber();
let comparisons = 0;

await compareRebalanceDeltas();
await compareFees();
const activeTokenCount = await compareSwapQuotes();

console.log(JSON.stringify({
  environment: required(environment, "APP_ENV"),
  chainId,
  blockNumber: blockNumber.toString(),
  comparisons,
  activeTokenCount,
  status: "pass",
}));

async function compareRebalanceDeltas(): Promise<void> {
  const vectors = [
    [0n, 0, 0n],
    [0n, 10_000, 1n],
    [20n * INTERNAL_SCALE, 4_000, 100n * INTERNAL_SCALE],
    [60n * INTERNAL_SCALE, 4_000, 100n * INTERNAL_SCALE],
    [123_456_789n, 3_333, 987_654_321n],
    [2n ** 120n, 7_500, 2n ** 121n],
  ] as const;

  for (const [currentValue, targetWeightBps, totalValue] of vectors) {
    const actual = await client.readContract({
      address: addresses.rebalancer,
      abi: rebalancerAbi,
      functionName: "calculateDelta",
      args: [currentValue, targetWeightBps, totalValue],
      blockNumber,
    });
    const targetValue = totalValue * BigInt(targetWeightBps) / BPS_DENOMINATOR;
    assertEqual("rebalance delta", targetValue - currentValue, actual);
  }
}

async function compareFees(): Promise<void> {
  const [, cashBps, inKindBps, offHoursBps] = await client.readContract({
    address: addresses.feeModule,
    abi: feeModuleAbi,
    functionName: "rates",
    blockNumber,
  });
  const rates = [cashBps, inKindBps, offHoursBps] as const;
  const amounts = [0n, 1n, 9_999n, 10_000n, 1_000_000n, 10n ** 24n] as const;

  for (let kind = 0; kind < rates.length; kind += 1) {
    const rate = BigInt(rates[kind]!);
    for (const amount of amounts) {
      const [actualFee, actualGross] = await Promise.all([
        client.readContract({
          address: addresses.feeModule,
          abi: feeModuleAbi,
          functionName: "calculateFee",
          args: [amount, kind],
          blockNumber,
        }),
        client.readContract({
          address: addresses.feeModule,
          abi: feeModuleAbi,
          functionName: "grossAmount",
          args: [amount, kind],
          blockNumber,
        }),
      ]);
      const expectedFee = amount === 0n || rate === 0n
        ? 0n
        : ceilDiv(amount * rate, BPS_DENOMINATOR);
      const expectedGross = amount === 0n || rate === 0n
        ? amount
        : ceilDiv(amount * BPS_DENOMINATOR, BPS_DENOMINATOR - rate);
      assertEqual("transaction fee", expectedFee, actualFee);
      assertEqual("gross fee amount", expectedGross, actualGross);
    }
  }
}

async function compareSwapQuotes(): Promise<number> {
  const tokens = await client.readContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "getActiveTokens",
    blockNumber,
  });
  if (tokens.length === 0) throw new Error("Registry has no active tokens");
  const stockAmounts = [1n, 1n * INTERNAL_SCALE, 17n * INTERNAL_SCALE] as const;
  const usdgAmounts = [1n, 1n * 10n ** 6n, 250n * 10n ** 6n] as const;

  for (const token of tokens) {
    const price = await client.readContract({
      address: addresses.navOracle,
      abi: navOracleAbi,
      functionName: "normalizedPrice",
      args: [token],
      blockNumber,
    });
    if (price === 0n) throw new Error(`Active token ${token} has a zero price`);

    for (const amount of stockAmounts) {
      const actual = await client.readContract({
        address: addresses.quoteOracle,
        abi: quoteOracleAbi,
        functionName: "quote",
        args: [token, addresses.usdg, amount],
        blockNumber,
      });
      const expected = amount * price / INTERNAL_SCALE / INTERNAL_TO_USDG;
      assertEqual("stock-to-USDG quote", expected, actual);
    }
    for (const amount of usdgAmounts) {
      const actual = await client.readContract({
        address: addresses.quoteOracle,
        abi: quoteOracleAbi,
        functionName: "quote",
        args: [addresses.usdg, token, amount],
        blockNumber,
      });
      const expected = amount * INTERNAL_TO_USDG * INTERNAL_SCALE / price;
      assertEqual("USDG-to-stock quote", expected, actual);
    }
  }
  return tokens.length;
}

function ceilDiv(value: bigint, denominator: bigint): bigint {
  return value === 0n ? 0n : (value - 1n) / denominator + 1n;
}

function assertEqual(label: string, expected: bigint, actual: bigint): void {
  comparisons += 1;
  if (expected !== actual) {
    throw new Error(`${label} mismatch: expected ${expected}, observed ${actual}`);
  }
}

function loadEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requiredAddress(values: ReadonlyMap<string, string>, key: string): Address {
  const value = required(values, key);
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${key} is invalid`);
  return value;
}
