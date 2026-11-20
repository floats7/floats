import { readFileSync } from "node:fs";
import { createPublicClient, http, isAddress, parseAbi, parseUnits, zeroAddress, type Address } from "viem";

const [environmentPath, tokenInput, referencePriceInput] = process.argv.slice(2);
if (!environmentPath || !tokenInput || !isAddress(tokenInput, { strict: false }) || !referencePriceInput) {
  throw new Error("Usage: inspect-candidate-liquidity.ts <environment-file> <token-address> <reference-price-usd>");
}
const env = parseEnv(environmentPath);
const chainId = Number(required(env, "CHAIN_ID"));
const rpcUrl = required(env, "RPC_INDEXER");
const token = tokenInput.toLowerCase() as Address;
const usdg = requiredAddress(env, "USDG_ADDRESS");
const v2Factory = "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f" as Address;
const v3Factory = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as Address;
const quoter = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as Address;
const fees = [100, 500, 3_000, 10_000] as const;
const samples = [1n, 10n, 100n] as const;
const factoryAbi = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function getPool(address,address,uint24) view returns (address)",
]);
const poolAbi = parseAbi(["function liquidity() view returns (uint128)"]);
const pairAbi = parseAbi(["function getReserves() view returns (uint112,uint112,uint32)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const client = createPublicClient({ transport: http(rpcUrl) });
if (await client.getChainId() !== chainId) throw new Error("RPC chain ID does not match environment");
const officialPrice = { value: referencePriceInput, price18: parseUnits(referencePriceInput, 18) };
if (officialPrice.price18 <= 0n) throw new Error("Reference price must be positive");

const v2Pair = await client.readContract({ address: v2Factory, abi: factoryAbi, functionName: "getPair", args: [usdg, token] });
const v2 = v2Pair === zeroAddress ? null : {
  address: v2Pair,
  reserves: (await client.readContract({ address: v2Pair, abi: pairAbi, functionName: "getReserves" })).slice(0, 2).map(String),
};
const v3 = (await Promise.all(fees.map(async (fee) => {
  const pool = await client.readContract({ address: v3Factory, abi: factoryAbi, functionName: "getPool", args: [usdg, token, fee] });
  if (pool === zeroAddress) return null;
  const liquidity = await client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" });
  const quotes = await Promise.all(samples.map(async (usdgAmount) => {
    const usdgIn = usdgAmount * 1_000_000n;
    const expectedToken = usdgIn * 10n ** 30n / officialPrice.price18;
    const [buy, sell] = await Promise.all([
      quote(usdg, token, usdgIn, fee),
      quote(token, usdg, expectedToken, fee),
    ]);
    const buyValue6 = buy === null ? null : buy * officialPrice.price18 / 10n ** 30n;
    return {
      usdg: usdgAmount.toString(),
      buyOutput18: buy?.toString() ?? null,
      buyImpactBps: buyValue6 === null ? null : impactBps(buyValue6, usdgIn),
      sellInput18: expectedToken.toString(),
      sellOutput6: sell?.toString() ?? null,
      sellImpactBps: sell === null ? null : impactBps(sell, usdgIn),
    };
  }));
  return { fee, address: pool, liquidity: liquidity.toString(), quotes };
}))).filter((pool) => pool !== null);

console.log(JSON.stringify({
  chainId,
  token,
  usdg,
  referencePrice: { value: officialPrice.value, price18: officialPrice.price18.toString() },
  v2,
  v3,
}, null, 2));

async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint, fee: number): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      account: zeroAddress,
      address: quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    return result[0];
  } catch {
    return null;
  }
}

function impactBps(actual: bigint, expected: bigint): string {
  return ((expected - actual) * 10_000n / expected).toString();
}

function parseEnv(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.startsWith("#")) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}
function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
function requiredAddress(values: ReadonlyMap<string, string>, key: string): Address {
  const value = required(values, key);
  if (!isAddress(value, { strict: false })) throw new Error(`${key} is invalid`);
  return value.toLowerCase() as Address;
}
