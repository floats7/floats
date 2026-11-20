import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import type { Eip1193Provider } from "./eip1193";

const erc20Abi = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);
const vaultAbi = parseAbi([
  "function previewDeposit(uint256 assets) view returns (uint256 shares)",
  "function previewRedeem(uint256 shares) view returns (uint256 assets)",
  "function deposit(uint256 assets,address receiver) returns (uint256 shares)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256 assets)",
  "function requestWithdrawal(uint256 shares,address receiver) returns (uint256 requestId)",
  "function cancelWithdrawal(uint256 requestId)",
  "function processWithdrawal(uint256 requestId) returns (uint256 assets)",
  "function claimWithdrawal(uint256 requestId) returns (uint256 assets)",
]);

export async function previewFusd(input: {
  provider: Eip1193Provider;
  vault: Address;
  mode: "deposit" | "redeem";
  amount: bigint;
}): Promise<bigint> {
  const functionName = input.mode === "deposit" ? "previewDeposit" : "previewRedeem";
  const data = encodeFunctionData({ abi: vaultAbi, functionName, args: [input.amount] } as never);
  const result = await input.provider.request<unknown>({
    method: "eth_call",
    params: [{ to: input.vault, data }, "latest"],
  });
  if (typeof result !== "string" || !result.startsWith("0x")) throw new Error("INVALID_FUSD_PREVIEW");
  return decodeFunctionResult({ abi: vaultAbi, functionName, data: result as Hex } as never) as bigint;
}

export async function executeFusd(input: {
  provider: Eip1193Provider;
  account: Address;
  vault: Address;
  usdg: Address;
  mode: "deposit" | "redeem" | "queue";
  amount: bigint;
  onStep(step: "approval" | "transaction" | "confirming"): void;
}): Promise<Hex> {
  if (input.mode === "deposit") {
    input.onStep("approval");
    const approval = await send(input.provider, input.account, input.usdg, encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [input.vault, input.amount],
    }));
    await wait(input.provider, approval);
  }

  input.onStep("transaction");
  const data = input.mode === "deposit"
    ? encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [input.amount, input.account] })
    : input.mode === "redeem"
      ? encodeFunctionData({
          abi: vaultAbi,
          functionName: "redeem",
          args: [input.amount, input.account, input.account],
        })
      : encodeFunctionData({
          abi: vaultAbi,
          functionName: "requestWithdrawal",
          args: [input.amount, input.account],
        });
  const hash = await send(input.provider, input.account, input.vault, data);
  input.onStep("confirming");
  await wait(input.provider, hash);
  return hash;
}

export async function executeFusdWithdrawalAction(input: {
  provider: Eip1193Provider;
  account: Address;
  vault: Address;
  requestId: bigint;
  action: "cancel" | "process" | "claim";
  onStep(step: "transaction" | "confirming"): void;
}): Promise<Hex> {
  input.onStep("transaction");
  const functionName = input.action === "cancel"
    ? "cancelWithdrawal"
    : input.action === "process"
      ? "processWithdrawal"
      : "claimWithdrawal";
  const hash = await send(input.provider, input.account, input.vault, encodeFunctionData({
    abi: vaultAbi,
    functionName,
    args: [input.requestId],
  } as never));
  input.onStep("confirming");
  await wait(input.provider, hash);
  return hash;
}

async function send(
  provider: Eip1193Provider,
  from: Address,
  to: Address,
  data: Hex,
): Promise<Hex> {
  await provider.request({ method: "eth_estimateGas", params: [{ from, to, data }] });
  const hash = await provider.request<unknown>({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error("INVALID_TRANSACTION_HASH");
  }
  return hash as Hex;
}

async function wait(provider: Eip1193Provider, hash: Hex): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await provider.request<{ status?: string } | null>({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("TRANSACTION_REVERTED");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }
  throw new Error("TRANSACTION_TIMEOUT");
}
