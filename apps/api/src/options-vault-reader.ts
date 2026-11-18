import { RobinhoodJsonRpcSource } from "../../indexer/src/json-rpc-source.ts";
import type { Address, Hex } from "../../indexer/src/types.ts";

export interface OptionsVaultState {
  readonly blockNumber: string;
  readonly totalAssets6: string;
  readonly reservedCollateral6: string;
  readonly claimableCollateral6: string;
  readonly payableWithdrawalAssets6: string;
  readonly totalSupply18: string;
  readonly utilizationBps: number;
  readonly operationsPaused: boolean;
}

const SELECTOR = {
  totalAssets: "0x01e1d114",
  reservedCollateral: "0xe1fb8ccf",
  claimableCollateral: "0xb9930b9c",
  payableWithdrawalAssets: "0x93dc32a2",
  totalSupply: "0x18160ddd",
  operationsPaused: "0xbb373698",
} as const satisfies Record<string, Hex>;

export class OptionsVaultReader {
  readonly #source: RobinhoodJsonRpcSource;

  constructor(
    rpcUrl: URL,
    private readonly vaultAddress: Address,
    fetchImplementation?: typeof globalThis.fetch,
  ) {
    this.#source = new RobinhoodJsonRpcSource(rpcUrl, [vaultAddress], fetchImplementation);
  }

  async readState(): Promise<OptionsVaultState> {
    const blockNumber = await this.#source.getHeadBlockNumber();
    const [totalAssets, reserved, claimable, payableWithdrawals, totalSupply, paused] =
      await Promise.all([
        this.#readUint(SELECTOR.totalAssets, blockNumber),
        this.#readUint(SELECTOR.reservedCollateral, blockNumber),
        this.#readUint(SELECTOR.claimableCollateral, blockNumber),
        this.#readUint(SELECTOR.payableWithdrawalAssets, blockNumber),
        this.#readUint(SELECTOR.totalSupply, blockNumber),
        this.#readBool(SELECTOR.operationsPaused, blockNumber),
      ]);
    const capital = totalAssets + reserved;
    const utilizationBps = capital === 0n ? 0 : Number(reserved * 10_000n / capital);
    return {
      blockNumber: blockNumber.toString(),
      totalAssets6: totalAssets.toString(),
      reservedCollateral6: reserved.toString(),
      claimableCollateral6: claimable.toString(),
      payableWithdrawalAssets6: payableWithdrawals.toString(),
      totalSupply18: totalSupply.toString(),
      utilizationBps,
      operationsPaused: paused,
    };
  }

  async #readUint(selector: Hex, blockNumber: bigint): Promise<bigint> {
    const value = await this.#source.callContract(this.vaultAddress, selector, blockNumber);
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("RPC_UINT_RESULT_INVALID");
    return BigInt(value);
  }

  async #readBool(selector: Hex, blockNumber: bigint): Promise<boolean> {
    const value = await this.#readUint(selector, blockNumber);
    if (value !== 0n && value !== 1n) throw new Error("RPC_BOOL_RESULT_INVALID");
    return value === 1n;
  }
}
