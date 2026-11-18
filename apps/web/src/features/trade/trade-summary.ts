import type { SummaryRow } from "@/components/ui/SummaryList";
import { FEES } from "@/data/index-stats";
import { formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { cashFeeRate, quoteCash } from "@/lib/quote";
import type { TradeRequest } from "@/lib/trade";
import { formatUnits, unitsToNumber } from "@/lib/units";

const usdg = (value: number) => `${formatNumber(value, 2)} USDG`;
const fipo = (value: number) => `${formatNumber(value, 4)} fIPO`;

/** Rows describing a cash trade, shared by the live preview and the review dialog. */
export function cashSummaryRows(request: TradeRequest): SummaryRow[] {
  if (request.cashQuote) {
    const minting = request.direction === "Mint";
    const output = formatUnits(request.cashQuote.outputAmount, minting ? 18 : 6, 4);
    const fee = formatUnits(request.cashQuote.feeAmount, 6, 6);
    const input = unitsToNumber(request.cashQuote.inputAmount, minting ? 6 : 18);
    const received = unitsToNumber(request.cashQuote.outputAmount, minting ? 18 : 6);
    const effectiveNav = minting ? input / received : received / input;
    return [
      { label: "You pay", value: minting ? usdg(request.amount) : fipo(request.amount) },
      { label: "Protocol fee", value: `${fee} USDG${request.feeBps === undefined ? "" : ` (${formatPercent(request.feeBps / 100)})`}` },
      { label: "You receive", value: `${output} ${minting ? "fIPO" : "USDG"}`, strong: true },
      { label: "Effective NAV", value: formatUsd(effectiveNav) },
      { label: "Rebalance slippage cap", value: formatPercent(FEES.maxSlippage) },
      { label: "Quote block", value: request.cashQuote.blockNumber },
    ];
  }
  const { direction, amount, nav, offHours } = request;
  const feeRate = cashFeeRate();
  const quote = quoteCash(direction, amount, nav, feeRate);
  const minting = direction === "Mint";
  const format = minting ? fipo : usdg;

  return [
    { label: "You pay", value: minting ? usdg(amount) : fipo(amount) },
    { label: "Fee", value: `${formatUsd(quote.fee)} (${formatPercent(feeRate)})` },
    { label: "You receive", value: format(quote.net), strong: true },
    { label: `Minimum after ${formatPercent(FEES.maxSlippage)} slippage`, value: format(quote.minReceived) },
  ];
}

export function inKindSummaryRows(request: TradeRequest): SummaryRow[] {
  const { direction, amount, nav } = request;
  const feePercent = (request.feeBps ?? 0) / 100;
  const feeShares = amount * feePercent / 100;
  const minting = direction === "Mint";

  return [
    { label: "You pay", value: minting ? `Constituent tokens worth ${formatUsd(amount * nav)}` : fipo(amount) },
    { label: "Fee", value: `${fipo(feeShares)} (${formatPercent(feePercent)})` },
    { label: "You receive", value: minting ? fipo(amount - feeShares) : `Constituent tokens worth ${formatUsd((amount - feeShares) * nav)}`, strong: true },
  ];
}

export const summaryRows = (request: TradeRequest): SummaryRow[] =>
  request.mode === "Cash" ? cashSummaryRows(request) : inKindSummaryRows(request);

export const navRow = (nav: number): SummaryRow => ({ label: "NAV per fIPO", value: formatUsd(nav) });
