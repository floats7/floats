import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const vaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function queuedWithdrawalAssets() view returns (uint256)",
  "function pricePerShare18() view returns (uint256)",
  "function tvlCap() view returns (uint256)",
  "function targetBufferBps() view returns (uint256)",
  "function performanceFeeBps() view returns (uint256)",
  "function depositsPaused() view returns (bool)",
  "function strategyActive() view returns (bool)",
]);
const strategyAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function morphoVault() view returns (address)",
]);
const morphoVaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function maxDeposit(address receiver) view returns (uint256)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const BPS = 10_000n;

export interface FUSDState {
  readonly blockNumber: string;
  readonly vaultAddress: Address;
  readonly strategyAddress: Address;
  readonly morphoVaultAddress: Address;
  readonly totalAssets6: string;
  readonly totalSupply18: string;
  readonly liquidAssets6: string;
  readonly strategyAssets6: string;
  readonly queuedWithdrawalAssets6: string;
  readonly pricePerShare18: string;
  readonly tvlCap6: string;
  readonly targetBufferBps: number;
  readonly performanceFeeBps: number;
  readonly depositsPaused: boolean;
  readonly strategyActive: boolean;
  readonly externalCapacity6: string;
  readonly requiredExternalCapacity6: string;
  readonly capacityReady: boolean;
}

export class FUSDReader {
  readonly #client;

  public constructor(
    rpcUrl: URL,
    private readonly vaultAddress: Address,
    private readonly strategyAddress: Address,
  ) {
    this.#client = createPublicClient({ transport: http(rpcUrl.toString(), { timeout: 8_000 }) });
  }

  public async readState(): Promise<FUSDState> {
    const blockNumber = await this.#client.getBlockNumber();
    const readVault = (functionName: string) => this.#client.readContract({
      address: this.vaultAddress,
      abi: vaultAbi,
      functionName,
      blockNumber,
    } as never);
    const assetAddress = await this.#client.readContract({
      address: this.vaultAddress,
      abi: vaultAbi,
      functionName: "asset",
      blockNumber,
    });
    const [
      totalAssets,
      totalSupply,
      liquidAssets,
      strategyAssets,
      queuedWithdrawalAssets,
      pricePerShare,
      tvlCap,
      targetBufferBps,
      performanceFeeBps,
      depositsPaused,
      strategyActive,
      morphoVaultAddress,
    ] = await Promise.all([
      readVault("totalAssets"),
      readVault("totalSupply"),
      this.#client.readContract({
        address: assetAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [this.vaultAddress],
        blockNumber,
      }),
      this.#client.readContract({
        address: this.strategyAddress,
        abi: strategyAbi,
        functionName: "totalAssets",
        blockNumber,
      }),
      readVault("queuedWithdrawalAssets"),
      readVault("pricePerShare18"),
      readVault("tvlCap"),
      readVault("targetBufferBps"),
      readVault("performanceFeeBps"),
      readVault("depositsPaused"),
      readVault("strategyActive"),
      this.#client.readContract({
        address: this.strategyAddress,
        abi: strategyAbi,
        functionName: "morphoVault",
        blockNumber,
      }),
    ]);
    const [morphoAsset, externalCapacity] = await Promise.all([
      this.#client.readContract({
        address: morphoVaultAddress,
        abi: morphoVaultAbi,
        functionName: "asset",
        blockNumber,
      }),
      this.#client.readContract({
        address: morphoVaultAddress,
        abi: morphoVaultAbi,
        functionName: "maxDeposit",
        args: [this.strategyAddress],
        blockNumber,
      }),
    ]);
    if (getAddress(morphoAsset) !== getAddress(assetAddress)) {
      throw new Error("FUSD_MORPHO_ASSET_MISMATCH");
    }
    const totalAssetsValue = BigInt(String(totalAssets));
    const tvlCapValue = BigInt(String(tvlCap));
    const targetBufferValue = BigInt(String(targetBufferBps));
    const remainingInternalCapacity = tvlCapValue > totalAssetsValue ? tvlCapValue - totalAssetsValue : 0n;
    const requiredExternalCapacity = remainingInternalCapacity * (BPS - targetBufferValue) / BPS;
    const externalCapacityValue = BigInt(String(externalCapacity));
    return {
      blockNumber: blockNumber.toString(),
      vaultAddress: this.vaultAddress,
      strategyAddress: this.strategyAddress,
      morphoVaultAddress,
      totalAssets6: String(totalAssets),
      totalSupply18: String(totalSupply),
      liquidAssets6: String(liquidAssets),
      strategyAssets6: String(strategyAssets),
      queuedWithdrawalAssets6: String(queuedWithdrawalAssets),
      pricePerShare18: String(pricePerShare),
      tvlCap6: String(tvlCap),
      targetBufferBps: Number(targetBufferBps),
      performanceFeeBps: Number(performanceFeeBps),
      depositsPaused: Boolean(depositsPaused),
      strategyActive: Boolean(strategyActive),
      externalCapacity6: externalCapacityValue.toString(),
      requiredExternalCapacity6: requiredExternalCapacity.toString(),
      capacityReady: requiredExternalCapacity === 0n
        || (externalCapacityValue > 0n && externalCapacityValue >= requiredExternalCapacity),
    };
  }
}
