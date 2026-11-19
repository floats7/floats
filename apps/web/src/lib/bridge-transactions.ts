import {
  decodeFunctionResult,
  encodeFunctionData,
  pad,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import type { CrossChainRouteDto } from "./api-client";
import type { Eip1193Provider } from "./eip1193";

const oftAbi = parseAbi([
  "function quoteSend((uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd) sendParam,bool payInLzToken) view returns ((uint256 nativeFee,uint256 lzTokenFee) fee)",
  "function send((uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd) sendParam,(uint256 nativeFee,uint256 lzTokenFee) fee,address refundAddress) payable returns ((bytes32 guid,uint64 nonce,(uint256 nativeFee,uint256 lzTokenFee) fee) receipt,(uint256 amountSentLD,uint256 amountReceivedLD) oftReceipt)",
]);
const erc20Abi = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);

export interface BridgeQuote {
  readonly amountLocal: bigint;
  readonly minimumReceivedLocal: bigint;
  readonly nativeFee: bigint;
  readonly approvalRequired: boolean;
  readonly sendParam: {
    readonly dstEid: number;
    readonly to: Hex;
    readonly amountLD: bigint;
    readonly minAmountLD: bigint;
    readonly extraOptions: Hex;
    readonly composeMsg: Hex;
    readonly oftCmd: Hex;
  };
}

export type BridgeExecutionStep =
  | { readonly type: "approval-submitted"; readonly transactionHash: Hex }
  | { readonly type: "approval-confirmed"; readonly transactionHash: Hex }
  | { readonly type: "send-submitted"; readonly transactionHash: Hex }
  | { readonly type: "send-confirmed"; readonly transactionHash: Hex };

export async function quoteBridge(input: {
  readonly provider: Eip1193Provider;
  readonly account: Address;
  readonly route: CrossChainRouteDto;
  readonly amount: string;
}): Promise<BridgeQuote> {
  await assertSourceChain(input.provider, input.route.sourceChainId);
  const amountLocal = parsePositiveAmount(input.amount, input.route.tokenDecimals);
  const minimumReceivedLocal = amountLocal * BigInt(input.route.minimumReceivedBps) / 10_000n;
  if (minimumReceivedLocal <= 0n) throw new Error("BRIDGE_MINIMUM_RECEIVED_ZERO");
  const sendParam = {
    dstEid: input.route.destinationEid,
    to: pad(input.account, { size: 32 }),
    amountLD: amountLocal,
    minAmountLD: minimumReceivedLocal,
    extraOptions: input.route.enforcedOptions as Hex,
    composeMsg: "0x" as Hex,
    oftCmd: "0x" as Hex,
  };
  const quoteData = encodeFunctionData({ abi: oftAbi, functionName: "quoteSend", args: [sendParam, false] });
  const quoteResult = await ethCall(input.provider, input.route.sourceContract, quoteData, input.account);
  const fee = decodeFunctionResult({ abi: oftAbi, functionName: "quoteSend", data: quoteResult });
  if (fee.nativeFee <= 0n || fee.lzTokenFee !== 0n) throw new Error("BRIDGE_UNSUPPORTED_FEE");
  const approvalRequired = input.route.sourceRequiresApproval
    ? await requiresApproval(input.provider, input.account, input.route, amountLocal)
    : false;
  return { amountLocal, minimumReceivedLocal, nativeFee: fee.nativeFee, approvalRequired, sendParam };
}

export async function executeBridge(input: {
  readonly provider: Eip1193Provider;
  readonly account: Address;
  readonly route: CrossChainRouteDto;
  readonly quote: BridgeQuote;
  readonly onStep: (step: BridgeExecutionStep) => void;
}): Promise<Hex> {
  await assertSourceChain(input.provider, input.route.sourceChainId);
  if (input.quote.approvalRequired) {
    const approvalData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [input.route.sourceContract as Address, input.quote.amountLocal],
    });
    const approvalHash = await send(input.provider, input.account, input.route.sourceTokenAddress, approvalData);
    input.onStep({ type: "approval-submitted", transactionHash: approvalHash });
    await waitForReceipt(input.provider, approvalHash);
    input.onStep({ type: "approval-confirmed", transactionHash: approvalHash });
  }
  const sendData = encodeFunctionData({
    abi: oftAbi,
    functionName: "send",
    args: [input.quote.sendParam, { nativeFee: input.quote.nativeFee, lzTokenFee: 0n }, input.account],
  });
  const sendHash = await send(
    input.provider,
    input.account,
    input.route.sourceContract,
    sendData,
    input.quote.nativeFee,
  );
  input.onStep({ type: "send-submitted", transactionHash: sendHash });
  await waitForReceipt(input.provider, sendHash);
  input.onStep({ type: "send-confirmed", transactionHash: sendHash });
  return sendHash;
}

async function requiresApproval(
  provider: Eip1193Provider,
  account: Address,
  route: CrossChainRouteDto,
  amount: bigint,
): Promise<boolean> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, route.sourceContract as Address],
  });
  const result = await ethCall(provider, route.sourceTokenAddress, data, account);
  const allowance = decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: result });
  return allowance < amount;
}

async function assertSourceChain(provider: Eip1193Provider, expected: number): Promise<void> {
  const observed = await provider.request<string>({ method: "eth_chainId" });
  if (Number.parseInt(observed, 16) !== expected) throw new Error("BRIDGE_WRONG_SOURCE_CHAIN");
}

async function ethCall(
  provider: Eip1193Provider,
  to: string,
  data: Hex,
  from: string,
): Promise<Hex> {
  const result = await provider.request<unknown>({ method: "eth_call", params: [{ from, to, data }, "latest"] });
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]*$/.test(result)) throw new Error("BRIDGE_INVALID_RPC_RESULT");
  return result as Hex;
}

async function send(
  provider: Eip1193Provider,
  from: string,
  to: string,
  data: Hex,
  value?: bigint,
): Promise<Hex> {
  const transaction = { from, to, data, ...(value === undefined ? {} : { value: `0x${value.toString(16)}` }) };
  await provider.request({ method: "eth_estimateGas", params: [transaction] });
  const hash = await provider.request<unknown>({ method: "eth_sendTransaction", params: [transaction] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("BRIDGE_INVALID_TRANSACTION_HASH");
  return hash as Hex;
}

async function waitForReceipt(provider: Eip1193Provider, hash: Hex): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await provider.request<{ status?: string } | null>({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("BRIDGE_TRANSACTION_REVERTED");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("BRIDGE_TRANSACTION_TIMEOUT");
}

function parsePositiveAmount(value: string, decimals: number): bigint {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) throw new Error("BRIDGE_AMOUNT_INVALID");
  const amount = parseUnits(value, decimals);
  if (amount <= 0n) throw new Error("BRIDGE_AMOUNT_ZERO");
  return amount;
}
