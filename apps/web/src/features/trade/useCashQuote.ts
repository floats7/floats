"use client";

import { useEffect, useState } from "react";
import { floatApi, type CashQuoteDto } from "@/lib/api-client";
import { parseUnits } from "@/lib/units";
import type { Direction, TradeMode } from "@/lib/quote";

interface CashQuoteState {
  readonly quote: CashQuoteDto | null;
  readonly loading: boolean;
  readonly error: boolean;
}

const EMPTY: CashQuoteState = { quote: null, loading: false, error: false };

export function useCashQuote(raw: string, direction: Direction, mode: TradeMode, enabled = true): CashQuoteState {
  const [state, setState] = useState<CashQuoteState>(EMPTY);

  useEffect(() => {
    if (mode !== "Cash" || !enabled) {
      setState(EMPTY);
      return;
    }
    const amount = parseUnits(raw, direction === "Mint" ? 6 : 18);
    if (!amount) {
      setState(EMPTY);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setState({ quote: null, loading: true, error: false });
      void floatApi
        .quoteCash(direction === "Mint" ? "deposit" : "redeem", amount, controller.signal)
        .then((quote) => setState({ quote, loading: false, error: false }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState({ quote: null, loading: false, error: true });
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [raw, direction, mode, enabled]);

  return state;
}
