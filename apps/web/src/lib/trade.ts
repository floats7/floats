import type { Constituent, TransactionType } from "@/data/types";
import type { CashQuoteDto } from "./api-client";
import { formatNumber, formatUsd } from "./format";
import { cashFeeRate, quoteCash, type Direction, type TradeMode } from "./quote";
import { unitsToNumber } from "./units";

export interface TradeRequest {
  direction: Direction;
  mode: TradeMode;
  amount: number;
  nav: number;
  offHours: boolean;
  cashQuote?: CashQuoteDto;
  feeBps?: number;
  inputAmount?: string;
}

/** Signed balance changes a trade produces for the connected account. */
export interface TradeOutcome {
  sharesDelta: number;
  usdgDelta: number;
  notional: number;
}

export interface AccountLimits {
  usdgBalance: number;
  shares: number;
  maxInKindMint: number;
}

export const tradeType = ({ mode, direction }: Pick<TradeRequest, "mode" | "direction">): TransactionType =>
  `${mode} ${direction.toLowerCase()}` as TransactionType;

export function computeOutcome(request: TradeRequest): TradeOutcome {
  const { direction, mode, amount, nav, offHours } = request;
  const minting = direction === "Mint";

  if (mode === "Cash") {
    if (request.cashQuote) {
      const output = unitsToNumber(request.cashQuote.outputAmount, minting ? 18 : 6);
      return minting
        ? { sharesDelta: output, usdgDelta: -amount, notional: amount }
        : { sharesDelta: -amount, usdgDelta: output, notional: amount * nav };
    }
    const quote = quoteCash(direction, amount, nav, cashFeeRate());
    return minting
      ? { sharesDelta: quote.net, usdgDelta: -amount, notional: amount }
      : { sharesDelta: -amount, usdgDelta: quote.net, notional: quote.gross };
  }

  const feeBps = request.feeBps ?? 0;
  const netShares = amount - amount * feeBps / 10_000;
  return { sharesDelta: minting ? netShares : -amount, usdgDelta: 0, notional: amount * nav };
}

/** Largest amount the account can enter for the chosen direction and settlement. */
export function maxAmount(direction: Direction, mode: TradeMode, limits: AccountLimits): number {
  if (direction === "Redeem") return limits.shares;
  return mode === "Cash" ? limits.usdgBalance : limits.maxInKindMint;
}

/** Returns a user-facing reason the amount cannot be traded, or null when it is valid. */
export function validateTrade(direction: Direction, mode: TradeMode, amount: number, limits: AccountLimits): string | null {
  if (direction === "Redeem") {
    return amount > limits.shares ? `Exceeds your balance of ${formatNumber(limits.shares, 2)} fIPO.` : null;
  }
  if (mode === "In-kind") {
    if (direction === "Mint") return "In-kind mint is not implemented by the deployed vault.";
    return amount > limits.maxInKindMint
      ? `You hold enough constituent tokens for up to ${formatNumber(limits.maxInKindMint, 2)} fIPO.`
      : null;
  }
  if (amount > limits.usdgBalance) return `Exceeds your balance of ${formatUsd(limits.usdgBalance)} USDG.`;
  return null;
}

/** How many fIPO the wallet's constituent tokens can mint in-kind. */
export function maxInKindMintShares(nav: number, constituents: readonly Constituent[], tokenUnits: Readonly<Record<string, number>>): number {
  return Math.min(
    ...constituents.map((item) => {
      const unitsPerShare = (nav * item.actualWeight) / 100 / item.price;
      return (tokenUnits[item.ticker] ?? 0) / unitsPerShare;
    }),
  );
}
