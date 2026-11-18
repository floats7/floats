import { createPublicClient, http, parseAbi, type Address } from "viem";

import type { OptionsChainPricingReader } from "./authoritative-context.ts";
import type { Hex } from "./runtime.ts";

const priceAbi = parseAbi(["function currentPrice(address underlying) view returns (uint256 priceUsd18,bool healthy)"]);
const vaultAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function reservedCollateral() view returns (uint256)",
]);

export class RpcOptionsChainPricingReader implements OptionsChainPricingReader {
  private readonly client;

  constructor(rpcUrl: string, private readonly vault: Address) {
    this.client = createPublicClient({ transport: http(rpcUrl, { timeout: 5_000 }) });
  }

  async spot(priceSource: Hex, underlying: Hex) {
    const [priceUsd18, healthy] = await this.client.readContract({
      address: priceSource as Address,
      abi: priceAbi,
      functionName: "currentPrice",
      args: [underlying as Address],
    });
    return { priceUsd18, healthy };
  }

  async vaultAccounting() {
    const [totalAssets6, reservedCollateral6] = await Promise.all([
      this.client.readContract({ address: this.vault, abi: vaultAbi, functionName: "totalAssets" }),
      this.client.readContract({ address: this.vault, abi: vaultAbi, functionName: "reservedCollateral" }),
    ]);
    return { totalAssets6, reservedCollateral6 };
  }
}
