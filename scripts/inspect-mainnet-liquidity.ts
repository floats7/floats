import {
  createPublicClient,
  http,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";

const RPC_URL = process.env.RPC_INDEXER ?? process.env.RPC_URL;
if (!RPC_URL) throw new Error("RPC_INDEXER or RPC_URL is required");

const EXPECTED_CHAIN_ID = 4663;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const V2_FACTORY = "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f";
const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
const FEES = [100, 500, 3_000, 10_000] as const;
const SAMPLE_USDG = 1_000_000_000n; // 1,000 USDG
const DEPTH_SAMPLES_USDG = [
  100_000_000n,
  1_000_000_000n,
  10_000_000_000n,
  100_000_000_000n,
  1_000_000_000_000n,
] as const;

const ASSETS = [
  {
    symbol: "CRCL",
    token: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
    feed: "0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a",
  },
  {
    symbol: "CRWV",
    token: "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3",
    feed: "0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C",
  },
  {
    symbol: "SPCX",
    token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    feed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
  },
] as const satisfies readonly { symbol: string; token: Address; feed: Address }[];

const factoryAbi = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function getPool(address,address,uint24) view returns (address)",
]);
const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
]);
const v2PairAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const feedAbi = parseAbi(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

const client = createPublicClient({ transport: http(RPC_URL) });

function impactBps(actual: bigint, expected: bigint): string {
  if (expected === 0n) return "n/a";
  return (((expected - actual) * 10_000n) / expected).toString();
}

function absoluteBps(value: string): bigint {
  const parsed = BigInt(value);
  return parsed < 0n ? -parsed : parsed;
}

async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint, fee: number) {
  try {
    const { result } = await client.simulateContract({
      account: zeroAddress,
      address: QUOTER_V2,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    return {
      amountOut: result[0].toString(),
      initializedTicksCrossed: result[2],
      gasEstimate: result[3].toString(),
    };
  } catch {
    return null;
  }
}

function v2AmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) / (reserveIn * 1_000n + amountInWithFee);
}

async function inspect() {
  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Expected chain ${EXPECTED_CHAIN_ID}, received ${chainId}`);
  const blockNumber = await client.getBlockNumber();

  const assets = await Promise.all(ASSETS.map(async (asset) => {
    const [, answer] = await client.readContract({ address: asset.feed, abi: feedAbi, functionName: "latestRoundData" });
    if (answer <= 0n) throw new Error(`${asset.symbol} feed answer is invalid`);
    const expectedTokenOut = (SAMPLE_USDG * 10n ** 20n) / answer;

    const v2Pair = await client.readContract({
      address: V2_FACTORY,
      abi: factoryAbi,
      functionName: "getPair",
      args: [USDG, asset.token],
    });
    const v2 = v2Pair === zeroAddress ? null : await (async () => {
      const [token0, token1, reserves] = await Promise.all([
        client.readContract({ address: v2Pair, abi: v2PairAbi, functionName: "token0" }),
        client.readContract({ address: v2Pair, abi: v2PairAbi, functionName: "token1" }),
        client.readContract({ address: v2Pair, abi: v2PairAbi, functionName: "getReserves" }),
      ]);
      const usdgIsToken0 = token0.toLowerCase() === USDG.toLowerCase();
      const usdgReserve = usdgIsToken0 ? reserves[0] : reserves[1];
      const tokenReserve = usdgIsToken0 ? reserves[1] : reserves[0];
      const depthSamples = DEPTH_SAMPLES_USDG.map((usdgIn) => {
        const tokenIn = (usdgIn * 10n ** 20n) / answer;
        const tokenOut = v2AmountOut(usdgIn, usdgReserve, tokenReserve);
        const usdgOut = v2AmountOut(tokenIn, tokenReserve, usdgReserve);
        const buyBps = impactBps((tokenOut * answer) / 10n ** 20n, usdgIn);
        const sellBps = impactBps(usdgOut, usdgIn);
        return {
          notionalUsdg: usdgIn.toString(),
          buyImpactBps: buyBps,
          sellImpactBps: sellBps,
          buyWithinTwoPercent: absoluteBps(buyBps) <= 200n,
          sellWithinTwoPercent: absoluteBps(sellBps) <= 200n,
        };
      });
      return {
        pair: v2Pair,
        token0,
        token1,
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
        depthSamples,
        maxTwoPercentBuyUsdg: depthSamples.filter((sample) => sample.buyWithinTwoPercent).at(-1)?.notionalUsdg ?? null,
        maxTwoPercentSellUsdg: depthSamples.filter((sample) => sample.sellWithinTwoPercent).at(-1)?.notionalUsdg ?? null,
      };
    })();

    const v3 = (await Promise.all(FEES.map(async (fee) => {
      const pool = await client.readContract({
        address: V3_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [USDG, asset.token, fee],
      });
      if (pool === zeroAddress) return null;

      const [token0, token1, liquidity, slot0, usdgBalance, tokenBalance, buy, sell] = await Promise.all([
        client.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
        client.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
        client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
        client.readContract({ address: pool, abi: poolAbi, functionName: "slot0" }),
        client.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [pool] }),
        client.readContract({ address: asset.token, abi: erc20Abi, functionName: "balanceOf", args: [pool] }),
        quote(USDG, asset.token, SAMPLE_USDG, fee),
        quote(asset.token, USDG, expectedTokenOut, fee),
      ]);

      const buyOracleValue = buy ? (BigInt(buy.amountOut) * answer) / 10n ** 20n : 0n;
      const sellOutput = sell ? BigInt(sell.amountOut) : 0n;
      const depthSamples = liquidity === 0n ? [] : await Promise.all(DEPTH_SAMPLES_USDG.map(async (usdgIn) => {
        const tokenIn = (usdgIn * 10n ** 20n) / answer;
        const [buySample, sellSample] = await Promise.all([
          quote(USDG, asset.token, usdgIn, fee),
          quote(asset.token, USDG, tokenIn, fee),
        ]);
        const buyValue = buySample ? (BigInt(buySample.amountOut) * answer) / 10n ** 20n : 0n;
        const buyBps = buySample ? impactBps(buyValue, usdgIn) : null;
        const sellBps = sellSample ? impactBps(BigInt(sellSample.amountOut), usdgIn) : null;
        return {
          notionalUsdg: usdgIn.toString(),
          buyImpactBps: buyBps,
          sellImpactBps: sellBps,
          buyWithinTwoPercent: buyBps !== null && absoluteBps(buyBps) <= 200n,
          sellWithinTwoPercent: sellBps !== null && absoluteBps(sellBps) <= 200n,
        };
      }));
      return {
        fee,
        pool,
        token0,
        token1,
        liquidity: liquidity.toString(),
        tick: slot0[1],
        observationCardinality: slot0[3],
        usdgBalance: usdgBalance.toString(),
        tokenBalance: tokenBalance.toString(),
        buy,
        buyImpactBps: buy ? impactBps(buyOracleValue, SAMPLE_USDG) : null,
        sell,
        sellImpactBps: sell ? impactBps(sellOutput, SAMPLE_USDG) : null,
        depthSamples,
        maxTwoPercentBuyUsdg: depthSamples.filter((sample) => sample.buyWithinTwoPercent).at(-1)?.notionalUsdg ?? null,
        maxTwoPercentSellUsdg: depthSamples.filter((sample) => sample.sellWithinTwoPercent).at(-1)?.notionalUsdg ?? null,
      };
    }))).filter((pool) => pool !== null);

    return {
      symbol: asset.symbol,
      token: asset.token,
      oracleAnswer: answer.toString(),
      v2,
      v3,
    };
  }));

  return { chainId, blockNumber: blockNumber.toString(), sampleUsdg: SAMPLE_USDG.toString(), assets };
}

try {
  console.log(JSON.stringify(await inspect(), null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown liquidity inspection failure";
  console.error(`Liquidity inspection failed: ${message}`);
  process.exitCode = 1;
}
