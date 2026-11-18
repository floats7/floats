import type { MarketAssetDto } from "@/lib/api-client";

export type MarketProductId = "mint-redeem" | "options" | "liquidity" | "spot";

export interface MarketProductCapability {
  readonly id: MarketProductId;
  readonly label: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}

export type MarketAsset = MarketAssetDto;
