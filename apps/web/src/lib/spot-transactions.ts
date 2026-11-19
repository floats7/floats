import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import type { Eip1193Provider } from "./eip1193";
import type { SpotRouteDto } from "./api-client";

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);
const erc20Abi = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);

export interface SpotQuote {
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly minimumOut: bigint;
  readonly estimatedPriceImpactBps: number;
}

const MAX_PRICE_IMPACT_BPS = 300;

export async function quoteSpot(input: {
  provider: Eip1193Provider;
  route: SpotRouteDto;
  usdg: `0x${string}`;
  side: "buy" | "sell";
  amountIn: bigint;
  slippageBps: number;
}): Promise<SpotQuote> {
  if (!Number.isSafeInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > 100) {
    throw new Error("SLIPPAGE_LIMIT_EXCEEDED");
  }
  const tokenIn = input.side === "buy" ? input.usdg : input.route.tokenAddress as `0x${string}`;
  const tokenOut = input.side === "buy" ? input.route.tokenAddress as `0x${string}` : input.usdg;
  const probeAmountIn = input.amountIn > 100n ? input.amountIn / 100n : input.amountIn;
  const [amountOut, probeAmountOut] = await Promise.all([
    readRouteQuote(input.provider, input.route, tokenIn, tokenOut, input.amountIn),
    readRouteQuote(input.provider, input.route, tokenIn, tokenOut, probeAmountIn),
  ]);
  if (amountOut <= 0n || probeAmountOut <= 0n) throw new Error("EMPTY_SPOT_QUOTE");
  const estimatedPriceImpactBps = calculatePriceImpactBps(
    input.amountIn,
    amountOut,
    probeAmountIn,
    probeAmountOut,
  );
  if (estimatedPriceImpactBps > MAX_PRICE_IMPACT_BPS) throw new Error("PRICE_IMPACT_EXCEEDED");
  return {
    amountIn: input.amountIn,
    amountOut,
    minimumOut: amountOut * BigInt(10_000 - input.slippageBps) / 10_000n,
    estimatedPriceImpactBps,
  };
}

async function readRouteQuote(
  provider: Eip1193Provider,
  route: SpotRouteDto,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee: route.fee, sqrtPriceLimitX96: 0n }],
  });
  const result = await provider.request<unknown>({ method: "eth_call", params: [{ to: route.quoterAddress, data }, "latest"] });
  if (typeof result !== "string" || !result.startsWith("0x")) throw new Error("INVALID_SPOT_QUOTE");
  const [amountOut] = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", data: result as `0x${string}` });
  return amountOut;
}

export function calculatePriceImpactBps(
  amountIn: bigint,
  amountOut: bigint,
  probeAmountIn: bigint,
  probeAmountOut: bigint,
): number {
  if (amountIn <= 0n || amountOut <= 0n || probeAmountIn <= 0n || probeAmountOut <= 0n) {
    throw new Error("QUOTE_AMOUNT_INVALID");
  }
  const expectedOut = probeAmountOut * amountIn / probeAmountIn;
  if (amountOut >= expectedOut) return 0;
  return Number((expectedOut - amountOut) * 10_000n / expectedOut);
}

export async function executeSpot(input: {
  provider: Eip1193Provider;
  account: string;
  route: SpotRouteDto;
  usdg: `0x${string}`;
  side: "buy" | "sell";
  quote: SpotQuote;
  onStatus(status: "approval" | "transaction" | "confirming"): void;
}): Promise<string> {
  const tokenIn = input.side === "buy" ? input.usdg : input.route.tokenAddress as `0x${string}`;
  const tokenOut = input.side === "buy" ? input.route.tokenAddress as `0x${string}` : input.usdg;
  input.onStatus("approval");
  const approval = await send(input.provider, input.account, tokenIn, encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [input.route.routerAddress as `0x${string}`, input.quote.amountIn],
  }));
  await wait(input.provider, approval);
  input.onStatus("transaction");
  const hash = await send(input.provider, input.account, input.route.routerAddress, encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [{
      tokenIn,
      tokenOut,
      fee: input.route.fee,
      recipient: input.account as `0x${string}`,
      amountIn: input.quote.amountIn,
      amountOutMinimum: input.quote.minimumOut,
      sqrtPriceLimitX96: 0n,
    }],
  }));
  input.onStatus("confirming");
  await wait(input.provider, hash);
  return hash;
}

async function send(provider: Eip1193Provider, from: string, to: string, data: string): Promise<string> {
  await provider.request({ method: "eth_estimateGas", params: [{ from, to, data }] });
  const hash = await provider.request<unknown>({ method: "eth_sendTransaction", params: [{ from, to, data }] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("INVALID_TRANSACTION_HASH");
  return hash;
}

async function wait(provider: Eip1193Provider, hash: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await provider.request<{ status?: string } | null>({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("TRANSACTION_REVERTED");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }
  throw new Error("TRANSACTION_TIMEOUT");
}
