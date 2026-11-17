"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Position } from "@/data/types";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useWalletBalances } from "@/features/wallet/useWalletBalances";
import type { AccountLimits } from "@/lib/trade";

export type PortfolioStatus = "disconnected" | "loading" | "ready" | "error";

interface PortfolioApi {
  status: PortfolioStatus;
  usdgBalance: number;
  position: Position;
  limits: AccountLimits;
}

const PortfolioContext = createContext<PortfolioApi | null>(null);

export function usePortfolio(): PortfolioApi {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return context;
}

/** Balances and history for the connected wallet, updated by completed trades. */
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const balances = useWalletBalances();
  const status: PortfolioStatus = !address ? "disconnected" : balances.status;

  const value = useMemo<PortfolioApi>(
    () => ({
      status,
      usdgBalance: balances.usdg,
      position: { shares: balances.shares, costBasis: 0 },
      limits: { usdgBalance: balances.usdg, shares: balances.shares, maxInKindMint: 0 },
    }),
    [status, balances.usdg, balances.shares],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}
