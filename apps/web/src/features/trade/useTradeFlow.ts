"use client";

import { useCallback, useReducer, useRef } from "react";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi } from "@/lib/api-client";
import type { TradeRequest } from "@/lib/trade";
import { executeTrade, TradeError, type TradeFailureCode, type TradeReceipt } from "@/lib/wallet-transactions";

export type TradePhase = "review" | "pending" | "success" | "failed";

export interface TradeFlow {
  open: boolean;
  phase: TradePhase;
  request: TradeRequest | null;
  stepIndex: number;
  receipt: TradeReceipt | null;
  failure: TradeFailureCode | null;
}

type Action =
  | { type: "review"; request: TradeRequest }
  | { type: "start" }
  | { type: "step"; index: number }
  | { type: "succeed"; receipt: TradeReceipt }
  | { type: "fail"; code: TradeFailureCode }
  | { type: "close" };

const INITIAL: TradeFlow = { open: false, phase: "review", request: null, stepIndex: 0, receipt: null, failure: null };

/** Dialog content survives `close` so the exit animation never shows an empty shell. */
function reducer(state: TradeFlow, action: Action): TradeFlow {
  switch (action.type) {
    case "review":
      return { ...INITIAL, open: true, request: action.request };
    case "start":
      return { ...state, phase: "pending", stepIndex: 0, failure: null };
    case "step":
      return { ...state, stepIndex: action.index };
    case "succeed":
      return { ...state, phase: "success", receipt: action.receipt };
    case "fail":
      return { ...state, phase: "failed", failure: action.code };
    case "close":
      return { ...state, open: false };
  }
}

export function useTradeFlow() {
  const { address, provider } = useWallet();
  const [flow, dispatch] = useReducer(reducer, INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const review = useCallback((request: TradeRequest) => dispatch({ type: "review", request }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const confirm = useCallback(async () => {
    const request = flow.request;
    if (!request) return;

    if (!address || !provider) return;
    abortRef.current = new AbortController();
    dispatch({ type: "start" });
    try {
      const config = await floatApi.getPublicConfig(abortRef.current.signal);
      const receipt = await executeTrade(request, {
        provider,
        account: address,
        vaultAddress: config.vaultAddress,
        usdgAddress: config.usdgAddress,
        onStep: (index) => dispatch({ type: "step", index }),
      });
      dispatch({ type: "succeed", receipt: { ...receipt, explorerUrl: config.blockExplorerUrl } });
    } catch (error) {
      dispatch({ type: "fail", code: error instanceof TradeError ? error.code : "unknown" });
    }
  }, [flow.request, address, provider]);

  return { flow, review, confirm, cancel, close };
}
