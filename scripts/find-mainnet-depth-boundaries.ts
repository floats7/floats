import { createPublicClient, http, parseAbi, zeroAddress, type Address } from "viem";

const RPC_URL = process.env.RPC_INDEXER ?? process.env.RPC_URL;
if (!RPC_URL) throw new Error("RPC_INDEXER or RPC_URL is required");

const EXPECTED_CHAIN_ID = 4663;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
const USDG_SCALE = 1_000_000n;
const MAX_IMPACT_BPS = 200n;
const SEARCH_MIN = 1n * USDG_SCALE;
const SEARCH_MAX = 1_000_000n * USDG_SCALE;
const SEARCH_PRECISION = 1n * USDG_SCALE;

const ROUTES = [
  {
    symbol: "CRCL",
    token: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
    feed: "0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a",
    pool: "0x654E4143e82a5824445Ade0824351C2A9ACD95a8",
    fee: 3_000,
  },
  {
    symbol: "SPCX",
    token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    feed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
    pool: "0xc61284332117c3FB23A2A56cceFFD07F7aF60029",
    fee: 500,
  },
] as const satisfies readonly {
  symbol: string;
  token: Address;
  feed: Address;
  pool: Address;
  fee: number;
}[];

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

const client = createPublicClient({ transport: http(RPC_URL) });

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function impactBps(actual: bigint, expected: bigint): bigint {
  if (expected === 0n) throw new Error("Expected quote value cannot be zero");
  return ((expected - actual) * 10_000n) / expected;
}

async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint, fee: number): Promise<bigint | null> {
  try {
    const { result } = await client.simulateContract({
      account: zeroAddress,
      address: QUOTER_V2,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    return result[0];
  } catch {
    return null;
  }
}

async function inspectBoundary(route: (typeof ROUTES)[number]) {
  const [, answer] = await client.readContract({
    address: route.feed,
    abi: feedAbi,
    functionName: "latestRoundData",
  });
  if (answer <= 0n) throw new Error(`${route.symbol} feed answer is invalid`);

  async function measure(notional: bigint) {
    const tokenNotional = (notional * 10n ** 20n) / answer;
    const [buyOutput, sellOutput] = await Promise.all([
      quote(USDG, route.token, notional, route.fee),
      quote(route.token, USDG, tokenNotional, route.fee),
    ]);
    const buyBps = buyOutput === null ? null : impactBps((buyOutput * answer) / 10n ** 20n, notional);
    const sellBps = sellOutput === null ? null : impactBps(sellOutput, notional);
    return {
      buyBps,
      sellBps,
      passes: buyBps !== null && sellBps !== null
        && absolute(buyBps) <= MAX_IMPACT_BPS
        && absolute(sellBps) <= MAX_IMPACT_BPS,
    };
  }

  let passing = 0n;
  let failing = SEARCH_MAX;
  const maximum = await measure(SEARCH_MAX);
  if (maximum.passes) passing = SEARCH_MAX;
  else {
    while (failing - passing > SEARCH_PRECISION) {
      const midpoint = ((passing + failing) / (2n * SEARCH_PRECISION)) * SEARCH_PRECISION;
      const candidate = midpoint < SEARCH_MIN ? SEARCH_MIN : midpoint;
      const result = await measure(candidate);
      if (result.passes) passing = candidate;
      else failing = candidate;
    }
  }

  const passingMeasurement = passing === 0n ? null : await measure(passing);
  const failingMeasurement = passing === SEARCH_MAX ? null : await measure(failing);
  return {
    symbol: route.symbol,
    pool: route.pool,
    fee: route.fee,
    oracleAnswer: answer.toString(),
    precisionUsdg: (SEARCH_PRECISION / USDG_SCALE).toString(),
    maximumPassingUsdg: (passing / USDG_SCALE).toString(),
    firstFailingUsdg: failingMeasurement === null ? null : (failing / USDG_SCALE).toString(),
    passingImpactBps: passingMeasurement === null ? null : {
      buy: passingMeasurement.buyBps?.toString() ?? null,
      sell: passingMeasurement.sellBps?.toString() ?? null,
    },
    failingImpactBps: failingMeasurement === null ? null : {
      buy: failingMeasurement.buyBps?.toString() ?? null,
      sell: failingMeasurement.sellBps?.toString() ?? null,
    },
  };
}

async function inspect() {
  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Expected chain ${EXPECTED_CHAIN_ID}, received ${chainId}`);
  const blockNumber = await client.getBlockNumber();
  const routes = [];
  for (const route of ROUTES) routes.push(await inspectBoundary(route));
  return { chainId, blockNumber: blockNumber.toString(), maximumImpactBps: MAX_IMPACT_BPS.toString(), routes };
}

try {
  console.log(JSON.stringify(await inspect(), null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown depth-boundary inspection failure";
  console.error(`Depth-boundary inspection failed: ${message}`);
  process.exitCode = 1;
}
