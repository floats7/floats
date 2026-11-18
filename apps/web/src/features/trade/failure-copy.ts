import type { TradeFailureCode } from "@/lib/wallet-transactions";

export interface FailureCopy {
  title: string;
  body: string;
  /** Whether editing the amount is a sensible way to recover. */
  canEdit: boolean;
}

export const FAILURE_COPY: Record<TradeFailureCode, FailureCopy> = {
  "user-rejected": {
    title: "Request rejected",
    body: "You declined the transaction in your wallet. No funds moved and nothing changed in your balances.",
    canEdit: false,
  },
  "transaction-reverted": {
    title: "Transaction reverted",
    body: "The network rejected the transaction and its state changes were rolled back. Check the current quote, balance, allowance, and vault status before trying again.",
    canEdit: false,
  },
  "unsupported-flow": {
    title: "Flow not available",
    body: "This settlement path is not enabled for real wallet execution yet. Buy with cash, or sell with cash or in-kind settlement.",
    canEdit: true,
  },
  unknown: {
    title: "Something went wrong",
    body: "The transaction could not be completed. Check your wallet activity before trying again.",
    canEdit: false,
  },
};
