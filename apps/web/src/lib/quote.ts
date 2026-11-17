import { FEES } from "@/data/index-stats";
import type { Constituent } from "@/data/types";

export type Direction = "Mint" | "Redeem";
export type TradeMode = "Cash" | "In-kind";

export interface CashQuote {
  gross: number;
  fee: number;
  net: number;
  minReceived: number;
}

export interface InKindLeg {
  ticker: string;
  units: number;
}

export interface InKindQuote {
  feeShares: number;
  netShares: number;
  legs: InKindLeg[];
}

const percentOf = (value: number, percent: number) => (value * percent) / 100;

/** Cash flows pay the off-hours surcharge; in-kind flows never do. */
export const cashFeeRate = (offHours: boolean) => FEES.cashRate + (offHours ? FEES.offHoursSurcharge : 0);

export function parseAmount(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Minting spends USDG and yields fIPO at NAV; redeeming is the reverse. */
export function quoteCash(direction: Direction, amount: number, nav: number, feeRate: number): CashQuote {
  const gross = direction === "Mint" ? amount : amount * nav;
  const fee = percentOf(gross, feeRate);
  const net = gross - fee;
  const output = direction === "Mint" ? net / nav : net;
  return { gross, fee, net: output, minReceived: output * (1 - FEES.maxSlippage / 100) };
}

export const inKindFeeShares = (shares: number) => percentOf(shares, FEES.inKindRate);

export function quoteInKind(shares: number, nav: number, constituents: readonly Constituent[]): InKindQuote {
  const feeShares = inKindFeeShares(shares);
  const legs = constituents.map((item) => ({
    ticker: item.ticker,
    units: (shares * nav * item.actualWeight) / 100 / item.price,
  }));
  return { feeShares, netShares: shares - feeShares, legs };
}
