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
  verifyWalletData: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioApi | null>(null);

export function usePortfolio(): PortfolioApi {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return context;
}

/** Balances and history for the connected wallet, updated by completed trades. */
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { address, provider } = useWallet();
  const balances = useWalletBalances();
  const [walletData, setWalletData] = useState<WalletDataDto>();
  const [walletDataStatus, setWalletDataStatus] = useState<PortfolioApi["walletDataStatus"]>("idle");
  const status: PortfolioStatus = !address ? "disconnected" : balances.status;

  useEffect(() => {
    setWalletData(undefined);
    setWalletDataStatus("idle");
  }, [address]);

  const verifyWalletData = useCallback(async () => {
    if (!address || !provider || walletDataStatus === "loading") return;
    setWalletDataStatus("loading");
    try {
      const challenge = await floatApi.getWalletDataChallenge(address);
      const signature = await provider.request<unknown>({ method: "personal_sign", params: [challenge.message, address] });
      if (typeof signature !== "string") throw new Error("Invalid wallet signature");
      setWalletData(await floatApi.getWalletData(challenge.message, signature));
      setWalletDataStatus("ready");
    } catch {
      setWalletDataStatus("error");
      throw new Error("Wallet data verification failed");
    }
  }, [address, provider, walletDataStatus]);

  const value = useMemo<PortfolioApi>(
    () => ({
      status,
      usdgBalance: balances.usdg,
      position: { shares: balances.shares, costBasis: 0 },
      limits: { usdgBalance: balances.usdg, shares: balances.shares, maxInKindMint: 0 },
      walletData,
      walletDataStatus,
      verifyWalletData,
    }),
    [status, balances.usdg, balances.shares, walletData, walletDataStatus, verifyWalletData],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}
