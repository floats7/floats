"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import { floatApi } from "@/lib/api-client";
import { isAddress, type Eip1193Provider } from "@/lib/eip1193";
import { ConnectModal, type ConnectPhase } from "./ConnectModal";

interface WalletApi {
  address: string | null;
  openConnect: () => void;
  disconnect: () => void;
  provider: Eip1193Provider | null;
}

const WalletContext = createContext<WalletApi | null>(null);

export function useWallet(): WalletApi {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}

/** Owns the injected EIP-1193 connection and network/account synchronization. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConnectPhase>("closed");

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      const next = Array.isArray(accounts) ? accounts.find(isAddress) : undefined;
      setAddress(next?.toLowerCase() ?? null);
    };
    const chainChanged = () => setAddress(null);
    provider.on("accountsChanged", accountsChanged);
    provider.on("chainChanged", chainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    setPhase("connecting");
    try {
      const provider = window.ethereum;
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      const requiredChain = `0x${config.chainId.toString(16)}`;
      const activeChain = await provider.request<string>({ method: "eth_chainId" });
      if (activeChain.toLowerCase() !== requiredChain) {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: requiredChain }],
        });
      }
      const accounts = await provider.request<unknown[]>({ method: "eth_requestAccounts" });
      const account = accounts.find(isAddress);
      if (!account) throw new Error("WALLET_ACCOUNT_MISSING");
      setAddress(account.toLowerCase());
      setPhase("closed");
      notify("Wallet connected", "success");
    } catch {
      setPhase("rejected");
      notify("Wallet connection failed", "error");
    }
  }, [notify]);

  const close = useCallback(() => {
    setPhase("closed");
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    notify("Wallet disconnected");
  }, [notify]);

  const api = useMemo<WalletApi>(() => ({
    address,
    openConnect: () => setPhase("idle"),
    disconnect,
    provider: typeof window === "undefined" ? null : window.ethereum ?? null,
  }), [address, disconnect]);

  return (
    <WalletContext.Provider value={api}>
      {children}
      <ConnectModal phase={phase} onConnect={connect} onCancel={close} onClose={close} />
    </WalletContext.Provider>
  );
}
