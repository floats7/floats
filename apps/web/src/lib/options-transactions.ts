import { encodeFunctionData, parseAbi } from "viem";

import type { SignedOptionsQuoteDto } from "./api-client";
import type { Eip1193Provider } from "./eip1193";

const marketAbi = parseAbi([
  "function buy((bytes32 seriesId,uint8 side,address buyer,uint256 size18,uint256 premiumPerUnit6,uint256 signedSpotUsd18,uint256 nonce,uint48 issuedAt,uint48 validUntil) quote,bytes signature)",
  "function sellBack((bytes32 seriesId,uint8 side,address buyer,uint256 size18,uint256 premiumPerUnit6,uint256 signedSpotUsd18,uint256 nonce,uint48 issuedAt,uint48 validUntil) quote,bytes signature)",
]);
const erc20Abi = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);
const vaultAbi = parseAbi([
  "function deposit(uint256 assets,address receiver) returns (uint256 shares)",
  "function requestWithdrawal(uint256 shares,address receiver,uint48 unlockAt) returns (uint256 requestId)",
  "function claimWithdrawal(uint256 requestId)",
  "function cancelWithdrawal(uint256 requestId)",
]);
const claimAbi = parseAbi(["function claim(bytes32 seriesId,uint256 size18) returns (uint256 payout6)"]);

export async function executeOptionsQuote(input: {
  provider: Eip1193Provider;
  account: string;
  market: `0x${string}`;
  usdg: `0x${string}`;
  signed: SignedOptionsQuoteDto;
  onStatus(status: "approval" | "transaction" | "confirming"): void;
}): Promise<string> {
  const { quote } = input.signed;
  const tuple = {
    seriesId: quote.seriesId as `0x${string}`,
    side: quote.side,
    buyer: quote.buyer as `0x${string}`,
    size18: BigInt(quote.size18),
    premiumPerUnit6: BigInt(quote.premiumPerUnit6),
    signedSpotUsd18: BigInt(quote.signedSpotUsd18),
    nonce: BigInt(quote.nonce),
    issuedAt: quote.issuedAt,
    validUntil: quote.validUntil,
  } as const;
  if (quote.side === 0) {
    input.onStatus("approval");
    const premium = (tuple.premiumPerUnit6 * tuple.size18 + 10n ** 18n - 1n) / 10n ** 18n;
    const approval = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [input.market, premium] });
    const approvalHash = await submit(input.provider, input.account, input.usdg, approval);
    await waitForReceipt(input.provider, approvalHash);
  }
  input.onStatus("transaction");
  const data = encodeFunctionData({
    abi: marketAbi,
    functionName: quote.side === 0 ? "buy" : "sellBack",
    args: [tuple, input.signed.signature as `0x${string}`],
  });
  const hash = await submit(input.provider, input.account, input.market, data);
  input.onStatus("confirming");
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function depositOptionsLiquidity(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; usdg: `0x${string}`; assets6: bigint;
}): Promise<string> {
  const approvalHash = await submit(input.provider, input.account, input.usdg, encodeFunctionData({
    abi: erc20Abi, functionName: "approve", args: [input.vault, input.assets6],
  }));
  await waitForReceipt(input.provider, approvalHash);
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi, functionName: "deposit", args: [input.assets6, input.account as `0x${string}`],
  }));
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function requestOptionsWithdrawal(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; shares18: bigint; unlockAt: number;
}): Promise<string> {
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi,
    functionName: "requestWithdrawal",
    args: [input.shares18, input.account as `0x${string}`, input.unlockAt],
  }));
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function claimOptionsPosition(input: {
  provider: Eip1193Provider; account: string; market: `0x${string}`; seriesId: `0x${string}`; size18: bigint;
}): Promise<string> {
  const hash = await submit(input.provider, input.account, input.market, encodeFunctionData({
    abi: claimAbi, functionName: "claim", args: [input.seriesId, input.size18],
  }));
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function claimOptionsWithdrawal(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; requestId: bigint;
}): Promise<string> {
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi, functionName: "claimWithdrawal", args: [input.requestId],
  }));
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function cancelOptionsWithdrawal(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; requestId: bigint;
}): Promise<string> {
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi, functionName: "cancelWithdrawal", args: [input.requestId],
  }));
  await waitForReceipt(input.provider, hash);
  return hash;
}

async function submit(provider: Eip1193Provider, from: string, to: string, data: string): Promise<string> {
  await provider.request({ method: "eth_estimateGas", params: [{ from, to, data }] });
  const hash = await provider.request<unknown>({ method: "eth_sendTransaction", params: [{ from, to, data }] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("INVALID_TRANSACTION_HASH");
  return hash;
}

async function waitForReceipt(provider: Eip1193Provider, hash: string): Promise<void> {
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
