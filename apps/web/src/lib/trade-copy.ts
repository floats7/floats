import type { Direction, TradeMode } from "./quote";

export type RetailTradeAction = "Buy" | "Sell";

export function retailTradeAction(direction: Direction): RetailTradeAction {
  return direction === "Mint" ? "Buy" : "Sell";
}

export function settlementDescription(direction: Direction, mode: TradeMode): string {
  if (mode === "Cash") return direction === "Mint" ? "Cash mint" : "Cash redeem";
  return direction === "Mint" ? "In-kind mint" : "In-kind redeem";
}
