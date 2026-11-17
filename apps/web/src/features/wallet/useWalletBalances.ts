"use client";

import { useEffect, useState } from "react";
import { floatApi } from "@/lib/api-client";
import type { Eip1193Provider } from "@/lib/eip1193";
import { unitsToNumber } from "@/lib/units";
import { useWallet } from "./WalletProvider";

interface WalletBalancesState {
  readonly status: "disconnected" | "loading" | "ready" | "error";
  readonly usdg: number;
  readonly shares: number;
}

const EMPTY: WalletBalancesState = { status: "disconnected", usdg: 0, shares: 0 };
const BALANCE_OF_SELECTOR = "70a08231";
const REFRESH_INTERVAL_MS = 15_000;

export function useWalletBalances(): WalletBalancesState {
  const { address, provider } = useWallet();
  const [state, setState] = useState<WalletBalancesState>(EMPTY);

  useEffect(() => {
    if (!address || !provider) {
      setState(EMPTY);
      return;
    }

    let active = true;
    const load = async () => {
      setState((current) => current.status === "ready" ? current : { ...current, status: "loading" });
      try {
        const config = await floatApi.getPublicConfig();
        const [usdgRaw, sharesRaw] = await Promise.all([
          readBalance(provider, config.usdgAddress, address),
          readBalance(provider, config.vaultAddress, address),
        ]);
        if (active) {
          setState({
            status: "ready",
            usdg: unitsToNumber(usdgRaw, 6),
            shares: unitsToNumber(sharesRaw, 18),
          });
        }
      } catch {
        if (active) setState((current) => ({ ...current, status: "error" }));
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [address, provider]);

  return state;
}

async function readBalance(provider: Eip1193Provider, token: string, account: string): Promise<string> {
  const data = `0x${BALANCE_OF_SELECTOR}${account.slice(2).toLowerCase().padStart(64, "0")}`;
  const result = await provider.request<unknown>({
    method: "eth_call",
    params: [{ to: token, data }, "latest"],
  });
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result)) {
    throw new Error("Invalid balance response");
  }
  return BigInt(result).toString();
}
