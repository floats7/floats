import { encodeFunctionData, parseAbi } from "viem";

import type { Eip1193Provider } from "./eip1193";

const erc20Abi = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);
const marginAbi = parseAbi([
  "function deposit(uint256 assets)",
  "function addIsolatedMargin(bytes32 marketId,uint256 assets)",
  "function removeIsolatedMargin(bytes32 marketId,uint256 assets)",
  "function addCrossCollateral(uint256 assets)",
  "function setMarginMode(bytes32 marketId,uint8 mode)",
]);

export async function changeIsolatedPerpsMargin(input: {
  provider: Eip1193Provider;
  account: string;
  usdg: `0x${string}`;
  marginAccount: `0x${string}`;
  marketId: `0x${string}`;
  action: "add" | "remove";
  assets6: bigint;
  onStatus(status: "approval" | "deposit" | "margin" | "confirming"): void;
}): Promise<string> {
  if (input.action === "add") {
    input.onStatus("approval");
    await sendAndWait(input.provider, input.account, input.usdg, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [input.marginAccount, input.assets6] }));
    input.onStatus("deposit");
    await sendAndWait(input.provider, input.account, input.marginAccount, encodeFunctionData({ abi: marginAbi, functionName: "deposit", args: [input.assets6] }));
  }
  input.onStatus("margin");
  const hash = await send(input.provider, input.account, input.marginAccount, encodeFunctionData({
    abi: marginAbi,
    functionName: input.action === "add" ? "addIsolatedMargin" : "removeIsolatedMargin",
    args: [input.marketId, input.assets6],
  }));
  input.onStatus("confirming");
  await wait(input.provider, hash);
  return hash;
}
const marketAbi = parseAbi([
  "function modifyPosition(bytes32 marketId,int256 sizeDelta18,uint256 acceptablePriceUsd18) returns (uint256 executionPriceUsd18)",
]);
const vaultAbi = parseAbi([
  "function deposit(uint256 assets,address receiver) returns (uint256 shares)",
  "function requestWithdrawal(uint256 shares,address receiver) returns (uint256 requestId)",
  "function cancelWithdrawal(uint256 requestId)",
  "function claimWithdrawal(uint256 requestId)",
]);

export async function depositPerpsLiquidity(input: {
  provider: Eip1193Provider;
  account: string;
  usdg: `0x${string}`;
  vault: `0x${string}`;
  assets6: bigint;
  onStatus(status: "approval" | "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus("approval");
  await sendAndWait(input.provider, input.account, input.usdg, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [input.vault, input.assets6] }));
  input.onStatus("transaction");
  const hash = await send(input.provider, input.account, input.vault, encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [input.assets6, input.account as `0x${string}`] }));
  input.onStatus("confirming");
  await wait(input.provider, hash);
  return hash;
}

export async function requestPerpsLiquidityWithdrawal(input: {
  provider: Eip1193Provider;
  account: string;
  vault: `0x${string}`;
  shares18: bigint;
  onStatus(status: "transaction" | "confirming"): void;
}): Promise<string> {
  input.onStatus("transaction");
  const hash = await send(input.provider, input.account, input.vault, encodeFunctionData({ abi: vaultAbi, functionName: "requestWithdrawal", args: [input.shares18, input.account as `0x${string}`] }));
  input.onStatus("confirming");
  await wait(input.provider, hash);
  return hash;
}

export async function managePerpsLiquidityWithdrawal(input: {
  provider: Eip1193Provider;
  account: string;
  vault: `0x${string}`;
  requestId: bigint;
  action: "cancel" | "claim";
}): Promise<string> {
  return sendAndWait(input.provider, input.account, input.vault, encodeFunctionData({ abi: vaultAbi, functionName: input.action === "cancel" ? "cancelWithdrawal" : "claimWithdrawal", args: [input.requestId] }));
}

export async function fundPerpsMargin(input: {
  provider: Eip1193Provider;
  account: string;
  usdg: `0x${string}`;
  marginAccount: `0x${string}`;
  marketId: `0x${string}`;
  mode: "isolated" | "cross";
  assets6: bigint;
  onStatus(status: "approval" | "deposit" | "mode" | "allocate" | "confirming"): void;
}): Promise<string> {
  input.onStatus("approval");
  await sendAndWait(input.provider, input.account, input.usdg, encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [input.marginAccount, input.assets6],
  }));
  input.onStatus("deposit");
  await sendAndWait(input.provider, input.account, input.marginAccount, encodeFunctionData({
    abi: marginAbi,
    functionName: "deposit",
    args: [input.assets6],
  }));
  if (input.mode === "cross") {
    input.onStatus("mode");
    await sendAndWait(input.provider, input.account, input.marginAccount, encodeFunctionData({
      abi: marginAbi,
      functionName: "setMarginMode",
      args: [input.marketId, 1],
    }));
  }
  input.onStatus("allocate");
  const hash = await send(input.provider, input.account, input.marginAccount, encodeFunctionData({
    abi: marginAbi,
    functionName: input.mode === "isolated" ? "addIsolatedMargin" : "addCrossCollateral",
    args: input.mode === "isolated" ? [input.marketId, input.assets6] : [input.assets6],
  }));
  input.onStatus("confirming");
  await wait(input.provider, hash);
  return hash;
}

export async function executePerpsTrade(input: {
  provider: Eip1193Provider;
  account: string;
  market: `0x${string}`;
  marketId: `0x${string}`;
  sizeDelta18: bigint;
  executionPriceUsd18: bigint;
  onStatus(status: "transaction" | "confirming"): void;
}): Promise<string> {
  const acceptablePrice = input.sizeDelta18 > 0n
    ? input.executionPriceUsd18 * 10_100n / 10_000n
    : input.executionPriceUsd18 * 9_900n / 10_000n;
  input.onStatus("transaction");
  const hash = await send(input.provider, input.account, input.market, encodeFunctionData({
    abi: marketAbi,
    functionName: "modifyPosition",
    args: [input.marketId, input.sizeDelta18, acceptablePrice],
  }));
  input.onStatus("confirming");
  await wait(input.provider, hash);
  return hash;
}

async function sendAndWait(
  provider: Eip1193Provider,
  from: string,
  to: string,
  data: string,
): Promise<string> {
  const hash = await send(provider, from, to, data);
  await wait(provider, hash);
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
