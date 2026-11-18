"use client";

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";

const BALANCE_OF_SELECTOR = "70a08231";

export function useTokenBalance(token?: string): bigint | undefined {
  const { address, provider } = useWallet();
  const [balance, setBalance] = useState<bigint>();

  useEffect(() => {
    if (!address || !provider || !token) {
      setBalance(undefined);
      return;
    }
    let active = true;
    const data = `0x${BALANCE_OF_SELECTOR}${address.slice(2).toLowerCase().padStart(64, "0")}`;
    provider.request<unknown>({ method: "eth_call", params: [{ to: token, data }, "latest"] })
      .then((result) => {
        if (active && typeof result === "string" && /^0x[0-9a-fA-F]+$/.test(result)) setBalance(BigInt(result));
      })
      .catch(() => { if (active) setBalance(undefined); });
    return () => { active = false; };
  }, [address, provider, token]);

  return balance;
}
