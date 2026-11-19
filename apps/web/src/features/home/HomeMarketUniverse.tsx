"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { changeOver } from "@/data/series";
import { buildMarketSeries } from "@/features/markets/market-history";
import { useMarkets } from "@/features/markets/useMarkets";
import { decimalUnitsToNumber } from "@/lib/units";
import type { MarketHistoryPointDto } from "@/lib/api-client";
import { marketCandidatePublicSymbol } from "@/lib/market-candidate";

export interface HomeMarketItem {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly price: number | null;
  readonly dailyChange: number | null;
  readonly indexWeightBps: number | null;
  readonly isIndex: boolean;
}

const HomeMarketUniverseContext = createContext<readonly HomeMarketItem[]>([]);

export function HomeMarketUniverseProvider({ children }: { readonly children: ReactNode }) {
  const { markets, candidates, historyByMarketId } = useMarkets();
  const items = useMemo(() => {
    const finalizedAddresses = new Set(markets.map((market) => market.address.toLowerCase()));
    const finalizedSymbols = new Set(markets.map((market) => market.symbol.toUpperCase()));
    const marketItems = markets.map((market): HomeMarketItem => {
      const candidate = candidates.find((item) => item.tokenAddress?.toLowerCase() === market.address.toLowerCase())
        ?? candidates.find((item) => item.symbol.toUpperCase() === market.symbol.toUpperCase());
      const history = market.kind === "index"
        ? historyByMarketId[market.id]
        : candidate ? historyByMarketId[candidate.id] : historyByMarketId[market.id];
      return toHomeMarketItem({
        id: market.id,
        symbol: market.symbol,
        name: market.name,
        priceUsd18: market.priceUsd18,
        history,
        indexWeightBps: market.targetWeightBps,
        isIndex: market.kind === "index",
      });
    });
    const candidateItems = candidates
      .filter((candidate) => !candidate.tokenAddress || !finalizedAddresses.has(candidate.tokenAddress.toLowerCase()))
      .filter((candidate) => !finalizedSymbols.has(candidate.symbol.toUpperCase()))
      .map((candidate): HomeMarketItem => toHomeMarketItem({
        id: candidate.id,
        symbol: marketCandidatePublicSymbol(candidate),
        name: candidate.name,
        priceUsd18: null,
        history: historyByMarketId[candidate.id],
        indexWeightBps: null,
        isIndex: false,
      }));
    return [...marketItems, ...candidateItems];
  }, [markets, candidates, historyByMarketId]);
  return <HomeMarketUniverseContext.Provider value={items}>{children}</HomeMarketUniverseContext.Provider>;
}

export function useHomeMarketUniverse(): readonly HomeMarketItem[] {
  return useContext(HomeMarketUniverseContext);
}

function toHomeMarketItem(input: {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly priceUsd18: string | null;
  readonly history?: readonly MarketHistoryPointDto[];
  readonly indexWeightBps: number | null;
  readonly isIndex: boolean;
}): HomeMarketItem {
  const history = input.history ?? [];
  const day = buildMarketSeries(history)["1D"];
  const latest = history.at(-1);
  const price = latest
    ? decimalUnitsToNumber(latest.valueUsd18, 18)
    : input.priceUsd18 ? decimalUnitsToNumber(input.priceUsd18, 18) : null;
  return {
    id: input.id,
    symbol: input.symbol,
    name: input.name,
    price,
    dailyChange: day.length >= 2 ? changeOver(day) : null,
    indexWeightBps: input.indexWeightBps,
    isIndex: input.isIndex,
  };
}
