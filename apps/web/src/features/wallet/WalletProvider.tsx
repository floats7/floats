"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppKit } from "@reown/appkit/react";
import { useToast } from "@/components/ui/Toast";
import { floatApi } from "@/lib/api-client";
import { getInjectedProvider, isAddress, type Eip1193Provider } from "@/lib/eip1193";
import { ConnectModal, type ConnectPhase } from "./ConnectModal";
import { getWalletConnectAppKit } from "./wallet-connect";

interface WalletApi {
  address: string | null;
  chainId: number | null;
  openConnect: () => void;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
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
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [phase, setPhase] = useState<ConnectPhase>("closed");
  const appKitRef = useRef<AppKit | null>(null);
  const unsubscribeAccountRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const injectedProvider = getInjectedProvider();
    if (!injectedProvider?.on) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      const next = Array.isArray(accounts) ? accounts.find(isAddress) : undefined;
      setAddress(next?.toLowerCase() ?? null);
    };
    const chainChanged = (...args: unknown[]) => {
      const value = args[0];
      if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) setChainId(Number.parseInt(value, 16));
    };
    injectedProvider.on("accountsChanged", accountsChanged);
    injectedProvider.on("chainChanged", chainChanged);
    return () => {
      injectedProvider.removeListener?.("accountsChanged", accountsChanged);
      injectedProvider.removeListener?.("chainChanged", chainChanged);
    };
  }, []);

  useEffect(() => () => unsubscribeAccountRef.current?.(), []);

  const connectBrowserWallet = useCallback(async () => {
    setPhase("connecting");
    try {
      const provider = getInjectedProvider();
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
      setChainId(config.chainId);
      setProvider(provider);
      setPhase("closed");
      notify("Wallet connected", "success");
    } catch {
      setPhase("rejected");
      notify("Wallet connection failed", "error");
    }
  }, [notify]);

  const connectWalletConnect = useCallback(async () => {
    setPhase("connecting");
    try {
      const appKit = await getWalletConnectAppKit();
      appKitRef.current = appKit;
      unsubscribeAccountRef.current?.();
      unsubscribeAccountRef.current = appKit.subscribeAccount((account) => {
        if (!account.isConnected || !isAddress(account.address)) return;
        const walletProvider = appKit.getWalletProvider();
        if (!isEip1193Provider(walletProvider)) return;
        setAddress(account.address.toLowerCase());
        setProvider(walletProvider);
        void walletProvider.request<string>({ method: "eth_chainId" }).then((value) => setChainId(Number.parseInt(value, 16)));
        setPhase("closed");
        notify("Wallet connected", "success");
      }, "eip155");
      setPhase("closed");
      await appKit.open({ view: "Connect" });
    } catch (error) {
      console.error("WalletConnect initialization failed", error);
      setPhase("rejected");
      notify("WalletConnect failed to open", "error");
    }
  }, [notify]);

  const close = useCallback(() => {
    setPhase("closed");
  }, []);

  const disconnect = useCallback(() => {
    if (appKitRef.current && provider !== getInjectedProvider()) {
      void appKitRef.current.disconnect("eip155");
    }
    setAddress(null);
    setChainId(null);
    setProvider(null);
    notify("Wallet disconnected");
  }, [notify, provider]);

  const switchChain = useCallback(async (nextChainId: number) => {
    if (!provider || !Number.isSafeInteger(nextChainId) || nextChainId <= 0) throw new Error("WALLET_CHAIN_INVALID");
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${nextChainId.toString(16)}` }] });
    setChainId(nextChainId);
  }, [provider]);

  const api = useMemo<WalletApi>(() => ({
    address,
    chainId,
    openConnect: () => setPhase("idle"),
    disconnect,
    switchChain,
    provider,
  }), [address, chainId, disconnect, provider, switchChain]);

  return (
    <WalletContext.Provider value={api}>
      {children}
      <ConnectModal
        phase={phase}
        onBrowserConnect={connectBrowserWallet}
        onWalletConnect={connectWalletConnect}
        onCancel={close}
        onClose={close}
      />
    </WalletContext.Provider>
  );
}

function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return typeof value === "object" && value !== null && "request" in value && typeof value.request === "function";
}
