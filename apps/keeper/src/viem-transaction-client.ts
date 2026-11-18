import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";

import type {
  Hex,
  SimulationResult,
  TransactionClient,
  TransactionReceipt,
  TransactionRequest,
} from "./types.ts";

interface KeeperPublicClient {
  call(input: { account: Account; to: Hex; data: Hex; value: bigint }): Promise<unknown>;
  estimateGas(input: { account: Account; to: Hex; data: Hex; value: bigint }): Promise<bigint>;
  getTransactionCount(input: { address: Hex; blockTag: "pending" }): Promise<number>;
  waitForTransactionReceipt(input: {
    hash: Hex;
    confirmations: number;
    timeout: number;
  }): Promise<{ blockNumber: bigint; status: "success" | "reverted" }>;
}

interface KeeperWalletClient {
  sendTransaction(input: {
    account: Account;
    to: Hex;
    data: Hex;
    value: bigint;
    gas: bigint;
    nonce: number;
  }): Promise<Hex>;
}

export class ViemTransactionClient implements TransactionClient {
  private pending: { readonly request: TransactionRequest; readonly gas: bigint } | undefined;

  constructor(
    private readonly account: Account,
    private readonly publicClient: KeeperPublicClient,
    private readonly walletClient: KeeperWalletClient,
  ) {}

  async simulate(request: TransactionRequest): Promise<SimulationResult> {
    try {
      await this.publicClient.call({ account: this.account, ...request });
      const gasEstimate = await this.publicClient.estimateGas({ account: this.account, ...request });
      this.pending = { request, gas: gasEstimate };
      return { success: true, gasEstimate };
    } catch (error) {
      this.pending = undefined;
      const revertData = extractRevertData(error);
      return { success: false, gasEstimate: 0n, ...(revertData ? { revertData } : {}) };
    }
  }

  async send(request: TransactionRequest): Promise<{ hash: Hex; nonce: bigint }> {
    if (!this.pending || !sameRequest(this.pending.request, request)) {
      throw new Error("Transaction must be simulated immediately before broadcast");
    }
    const nonce = await this.publicClient.getTransactionCount({
      address: this.account.address,
      blockTag: "pending",
    });
    const gas = this.pending.gas + this.pending.gas / 5n;
    this.pending = undefined;
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      ...request,
      gas,
      nonce,
    });
    return { hash, nonce: BigInt(nonce) };
  }

  async receipt(hash: Hex): Promise<TransactionReceipt | undefined> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000,
      });
      return { hash, blockNumber: receipt.blockNumber, success: receipt.status === "success" };
    } catch (error) {
      if (isReceiptNotFound(error)) return undefined;
      throw error;
    }
  }
}

export function createViemTransactionClient(input: {
  readonly rpcUrl: string;
  readonly account: Account;
}): ViemTransactionClient {
  const transport = http(input.rpcUrl, { timeout: 10_000, retryCount: 1 });
  return new ViemTransactionClient(
    input.account,
    createPublicClient({ transport }) as PublicClient as unknown as KeeperPublicClient,
    createWalletClient({ account: input.account, transport }) as WalletClient as unknown as KeeperWalletClient,
  );
}

function sameRequest(left: TransactionRequest, right: TransactionRequest): boolean {
  return left.to.toLowerCase() === right.to.toLowerCase()
    && left.data.toLowerCase() === right.data.toLowerCase()
    && left.value === right.value;
}

function extractRevertData(error: unknown): Hex | undefined {
  if (!error || typeof error !== "object") return undefined;
  const data = "data" in error ? (error as { data?: unknown }).data : undefined;
  return typeof data === "string" && /^0x[0-9a-fA-F]*$/.test(data) ? data as Hex : undefined;
}

function isReceiptNotFound(error: unknown): boolean {
  return error instanceof Error && /not found|could not be found|timed out|timeout/i.test(error.message);
}
