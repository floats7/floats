import type { Eip1193Provider } from "./eip1193";
import type { TradeOutcome, TradeRequest } from "./trade";
import { computeOutcome } from "./trade";

export type TradeFailureCode = "user-rejected" | "transaction-reverted" | "unsupported-flow" | "unknown";

export class TradeError extends Error {
  public constructor(readonly code: TradeFailureCode) {
    super(code);
  }
}

export interface TradeReceipt {
  readonly hash: string;
  readonly date: string;
  readonly outcome: TradeOutcome;
}

export interface TradeStep {
  readonly id: string;
  readonly label: string;
}

const WALLET_STEP: TradeStep = { id: "wallet", label: "Confirm in your wallet" };
const SETTLE_STEP: TradeStep = { id: "settle", label: "Settling onchain" };

export function stepsFor(request: Pick<TradeRequest, "direction" | "mode">): readonly TradeStep[] {
  if (request.direction === "Redeem") return [WALLET_STEP, SETTLE_STEP];
  if (request.mode !== "Cash") return [WALLET_STEP, SETTLE_STEP];
  return [
    { id: "approve", label: "Approve exact USDG spending" },
    WALLET_STEP,
    SETTLE_STEP,
  ];
}

interface ExecuteTradeOptions {
  readonly provider: Eip1193Provider;
  readonly account: string;
  readonly vaultAddress: string;
  readonly usdgAddress: string;
  readonly onStep: (index: number) => void;
}

export async function executeTrade(
  request: TradeRequest,
  options: ExecuteTradeOptions,
): Promise<TradeReceipt> {
  const { provider, account, vaultAddress, usdgAddress, onStep } = options;
  if (request.mode === "In-kind") {
    if (request.direction !== "Redeem" || !request.inputAmount) {
      throw new TradeError("unsupported-flow");
    }
    onStep(0);
    const transactionHash = await send(
      provider,
      account,
      vaultAddress,
      encodeRedeemInKind(BigInt(request.inputAmount), account),
    );
    onStep(1);
    await waitForReceipt(provider, transactionHash);
    return {
      hash: transactionHash,
      date: new Date().toISOString().slice(0, 10),
      outcome: computeOutcome(request),
    };
  }
  if (!request.cashQuote) throw new TradeError("unsupported-flow");
  const amount = BigInt(request.cashQuote.inputAmount);

  let transactionHash: string;
  if (request.direction === "Mint") {
    onStep(0);
    const approvalHash = await send(provider, account, usdgAddress, encodeApprove(vaultAddress, amount));
    await waitForReceipt(provider, approvalHash);
    onStep(1);
    transactionHash = await send(provider, account, vaultAddress, encodeDeposit(amount, account));
  } else {
    onStep(0);
    transactionHash = await send(provider, account, vaultAddress, encodeRedeem(amount, account));
  }

  onStep(request.direction === "Mint" ? 2 : 1);
  await waitForReceipt(provider, transactionHash);
  return {
    hash: transactionHash,
    date: new Date().toISOString().slice(0, 10),
    outcome: computeOutcome(request),
  };
}

async function send(
  provider: Eip1193Provider,
  from: string,
  to: string,
  data: string,
): Promise<string> {
  try {
    const hash = await provider.request<unknown>({
      method: "eth_sendTransaction",
      params: [{ from, to, data }],
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new TradeError("unknown");
    }
    return hash;
  } catch (error) {
    if (isProviderCode(error, 4001)) throw new TradeError("user-rejected");
    throw error instanceof TradeError ? error : new TradeError("unknown");
  }
}

async function waitForReceipt(provider: Eip1193Provider, hash: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await provider.request<{ status?: string } | null>({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt) {
      if (receipt.status !== "0x1") throw new TradeError("transaction-reverted");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }
  throw new TradeError("unknown");
}

function encodeApprove(spender: string, amount: bigint): string {
  return `0x095ea7b3${wordAddress(spender)}${wordUint(amount)}`;
}

function encodeDeposit(amount: bigint, receiver: string): string {
  return `0x6e553f65${wordUint(amount)}${wordAddress(receiver)}`;
}

function encodeRedeem(shares: bigint, receiver: string): string {
  return `0xba087652${wordUint(shares)}${wordAddress(receiver)}${wordAddress(receiver)}`;
}

function encodeRedeemInKind(shares: bigint, receiver: string): string {
  return `0xa4bfc6b6${wordUint(shares)}${wordAddress(receiver)}${wordAddress(receiver)}`;
}

function wordAddress(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new TradeError("unknown");
  return value.slice(2).toLowerCase().padStart(64, "0");
}

function wordUint(value: bigint): string {
  if (value < 0n || value >= 1n << 256n) throw new TradeError("unknown");
  return value.toString(16).padStart(64, "0");
}

function isProviderCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
