import { decodeErrorResult, encodeFunctionData, parseAbi } from "viem";

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
  "error InvalidAddress()",
  "error InvalidAmount()",
  "error InvalidUnlockTime()",
  "error OperationsPaused()",
  "error ERC20InsufficientBalance(address sender,uint256 balance,uint256 needed)",
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
  onStatus?(status: "approval" | "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus?.("approval");
  const approvalHash = await submit(input.provider, input.account, input.usdg, encodeFunctionData({
    abi: erc20Abi, functionName: "approve", args: [input.vault, input.assets6],
  }));
  await waitForReceipt(input.provider, approvalHash);
  input.onStatus?.("transaction");
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi, functionName: "deposit", args: [input.assets6, input.account as `0x${string}`],
  }));
  input.onStatus?.("confirming");
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function requestOptionsWithdrawal(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; shares18: bigint; unlockAt: number;
  onStatus?(status: "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus?.("transaction");
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi,
    functionName: "requestWithdrawal",
    args: [input.shares18, input.account as `0x${string}`, input.unlockAt],
  }));
  input.onStatus?.("confirming");
  await waitForReceipt(input.provider, hash);
  return hash;
}

export function describeOptionsVaultError(error: unknown): string {
  const data = findRevertData(error);
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: vaultAbi, data });
      if (decoded.errorName === "ERC20InsufficientBalance") return "The requested amount exceeds your Options Vault LP share balance.";
      if (decoded.errorName === "OperationsPaused") return "Options Vault operations are currently paused.";
      if (decoded.errorName === "InvalidUnlockTime") return "The withdrawal unlock time is invalid. Refresh the page and try again.";
      if (decoded.errorName === "InvalidAmount") return "Enter an LP share amount greater than zero.";
      if (decoded.errorName === "InvalidAddress") return "The connected wallet address is invalid for this request.";
    } catch {
      // Some wallet providers omit the contract error ABI payload.
    }
  }
  if (error instanceof Error && /insufficient funds/i.test(error.message)) return "The wallet does not have enough ETH to pay network gas.";
  if (error instanceof Error && /user rejected|denied transaction|4001/i.test(error.message)) return "The transaction was rejected in the wallet.";
  return "The withdrawal request failed simulation. Check your LP share balance and active network, then try again.";
}

function findRevertData(error: unknown): `0x${string}` | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current === "string") {
      const match = current.match(/0x[0-9a-fA-F]{8,}/);
      if (match) return match[0] as `0x${string}`;
      return undefined;
    }
    if (typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    if (typeof record.data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(record.data)) return record.data as `0x${string}`;
    current = record.data ?? record.cause ?? record.error ?? record.originalError;
  }
  return undefined;
}

export async function claimOptionsPosition(input: {
  provider: Eip1193Provider; account: string; market: `0x${string}`; seriesId: `0x${string}`; size18: bigint;
  onStatus?(status: "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus?.("transaction");
  const hash = await submit(input.provider, input.account, input.market, encodeFunctionData({
    abi: claimAbi, functionName: "claim", args: [input.seriesId, input.size18],
  }));
  input.onStatus?.("confirming");
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function claimOptionsWithdrawal(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; requestId: bigint;
  onStatus?(status: "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus?.("transaction");
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi, functionName: "claimWithdrawal", args: [input.requestId],
  }));
  input.onStatus?.("confirming");
  await waitForReceipt(input.provider, hash);
  return hash;
}

export async function cancelOptionsWithdrawal(input: {
  provider: Eip1193Provider; account: string; vault: `0x${string}`; requestId: bigint;
  onStatus?(status: "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus?.("transaction");
  const hash = await submit(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi, functionName: "cancelWithdrawal", args: [input.requestId],
  }));
  input.onStatus?.("confirming");
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
