import { RobinhoodJsonRpcSource } from "../../indexer/src/json-rpc-source.ts";
import type { Address, Hex } from "../../indexer/src/types.ts";

export type CashQuoteDirection = "deposit" | "redeem";

export interface VaultCashQuote {
  readonly blockNumber: string;
  readonly direction: CashQuoteDirection;
  readonly inputAmount: string;
  readonly outputAmount: string;
  readonly feeAmount: string;
}

const SELECTOR = {
  previewDeposit: "0xef8b30f7",
  previewRedeem: "0x4cdad506",
  convertToAssets: "0x07a2d13a",
  feeModule: "0xbae41cbf",
  calculateFee: "0x82300ee3",
} as const;

export class VaultQuoteReader {
  readonly #source: RobinhoodJsonRpcSource;

  public constructor(rpcUrl: URL, private readonly vaultAddress: Address) {
    this.#source = new RobinhoodJsonRpcSource(rpcUrl, [vaultAddress]);
  }

  public async quoteCash(direction: CashQuoteDirection, amount: bigint): Promise<VaultCashQuote> {
    if (amount <= 0n || amount > (1n << 256n) - 1n) throw new Error("QUOTE_AMOUNT_INVALID");
    const blockNumber = await this.#source.getHeadBlockNumber();

    if (direction === "deposit") {
      const [shares, feeModule] = await Promise.all([
        this.#callUint(SELECTOR.previewDeposit, [amount], blockNumber),
        this.#callAddress(SELECTOR.feeModule, blockNumber),
      ]);
      const fee = await this.#callUintAt(
        feeModule,
        SELECTOR.calculateFee,
        [amount, 0n],
        blockNumber,
      );
      return {
        blockNumber: blockNumber.toString(),
        direction,
        inputAmount: amount.toString(),
        outputAmount: shares.toString(),
        feeAmount: fee.toString(),
      };
    }

    const [netAssets, grossAssets] = await Promise.all([
      this.#callUint(SELECTOR.previewRedeem, [amount], blockNumber),
      this.#callUint(SELECTOR.convertToAssets, [amount], blockNumber),
    ]);
    return {
      blockNumber: blockNumber.toString(),
      direction,
      inputAmount: amount.toString(),
      outputAmount: netAssets.toString(),
      feeAmount: (grossAssets - netAssets).toString(),
    };
  }

  async #callUint(selector: Hex, args: readonly bigint[], blockNumber: bigint): Promise<bigint> {
    return this.#callUintAt(this.vaultAddress, selector, args, blockNumber);
  }

  async #callUintAt(
    address: Address,
    selector: Hex,
    args: readonly bigint[],
    blockNumber: bigint,
  ): Promise<bigint> {
    const result = await this.#source.callContract(address, encodeCall(selector, args), blockNumber);
    return decodeUint(result);
  }

  async #callAddress(selector: Hex, blockNumber: bigint): Promise<Address> {
    const result = await this.#source.callContract(this.vaultAddress, selector, blockNumber);
    if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(result)) throw new Error("RPC_ADDRESS_RESULT_INVALID");
    return `0x${result.slice(-40).toLowerCase()}` as Address;
  }
}

function encodeCall(selector: Hex, args: readonly bigint[]): Hex {
  return `${selector}${args.map((value) => value.toString(16).padStart(64, "0")).join("")}` as Hex;
}

function decodeUint(value: Hex): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("RPC_UINT_RESULT_INVALID");
  return BigInt(value);
}
