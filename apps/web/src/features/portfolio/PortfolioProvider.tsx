"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Position } from "@/data/types";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useWalletBalances } from "@/features/wallet/useWalletBalances";
import type { AccountLimits } from "@/lib/trade";
import { floatApi, type WalletDataDto } from "@/lib/api-client";

export type PortfolioStatus = "disconnected" | "loading" | "ready" | "error";

interface PortfolioApi {
  status: PortfolioStatus;
  usdgBalance: number;
  position: Position;
  limits: AccountLimits;
  walletData?: WalletDataDto;
  walletDataStatus: "idle" | "loading" | "ready" | "error";
  refreshWalletData: () => Promise<void>;
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
  const [walletData, setWalletData] = useState<WalletDataDto>();
  const [walletDataStatus, setWalletDataStatus] = useState<PortfolioApi["walletDataStatus"]>("idle");
  const status: PortfolioStatus = !address ? "disconnected" : balances.status;

  useEffect(() => {
    setWalletData(undefined);
    setWalletDataStatus("idle");
  }, [address]);

  const refreshWalletData = useCallback(async () => {
    if (!address) return;
    setWalletDataStatus("loading");
    try {
      setWalletData(await floatApi.getWalletData(address));
      setWalletDataStatus("ready");
    } catch {
      setWalletDataStatus("error");
      throw new Error("Wallet data could not be loaded");
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    void refreshWalletData().catch(() => undefined);
  }, [address, refreshWalletData]);

  const value = useMemo<PortfolioApi>(
    () => ({
      status,
      usdgBalance: balances.usdg,
      position: { shares: balances.shares, costBasis: 0 },
      limits: { usdgBalance: balances.usdg, shares: balances.shares, maxInKindMint: 0 },
      walletData,
      walletDataStatus,
      refreshWalletData,
    }),
    [status, balances.usdg, balances.shares, walletData, walletDataStatus, refreshWalletData],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}
