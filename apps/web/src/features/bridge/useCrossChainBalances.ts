"use client";

import { useEffect, useState } from "react";
import type { CrossChainRouteDto } from "@/lib/api-client";
import { useWallet } from "@/features/wallet/WalletProvider";

const BALANCE_OF_SELECTOR = "70a08231";

export function useCrossChainBalances(
  routes: readonly CrossChainRouteDto[],
): ReadonlyMap<string, bigint> {
  const { address, chainId, provider } = useWallet();
  const [balances, setBalances] = useState<ReadonlyMap<string, bigint>>(new Map());

  useEffect(() => {
    if (!address || !provider || !chainId) {
      setBalances(new Map());
      return;
    }
    const activeRoutes = routes.filter((route) => route.sourceChainId === chainId);
    if (activeRoutes.length === 0) {
      setBalances(new Map());
      return;
    }
    let active = true;
    const data = `0x${BALANCE_OF_SELECTOR}${address.slice(2).toLowerCase().padStart(64, "0")}`;
    void Promise.all(activeRoutes.map(async (route) => {
      const result = await provider.request<unknown>({
        method: "eth_call",
        params: [{ to: route.sourceTokenAddress, data }, "latest"],
      });
      if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) {
        throw new Error("BRIDGE_BALANCE_RPC_INVALID");
      }
      return [route.id, BigInt(result)] as const;
    })).then((entries) => {
      if (active) setBalances(new Map(entries));
    }).catch(() => {
      if (active) setBalances(new Map());
    });
    return () => { active = false; };
  }, [address, chainId, provider, routes]);

  return balances;
}
