"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { floatApi, type OptionsSeriesDto } from "@/lib/api-client";
import styles from "./OptionsChain.module.css";
import { PayoffChart } from "./PayoffChart";
import { useWallet } from "@/features/wallet/WalletProvider";
import type { SignedOptionsQuoteDto } from "@/lib/api-client";
import { executeOptionsQuote } from "@/lib/options-transactions";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";

const SERIES_STATE: Readonly<Record<string, string>> = {
  "0": "Active",
  "1": "Trading closed",
  "2": "Suspended",
  "3": "Manual settlement",
  "4": "Settled",
  "5": "Archived",
};

export function OptionsChain({ underlying, embedded = false }: { readonly underlying?: string; readonly embedded?: boolean } = {}) {
  const { address, provider, openConnect } = useWallet();
  const [series, setSeries] = useState<readonly OptionsSeriesDto[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [size, setSize] = useState("1");
  const [quote, setQuote] = useState<SignedOptionsQuoteDto>();
  const [quoteError, setQuoteError] = useState<string>();
  const [quoting, setQuoting] = useState(false);
  const [side, setSide] = useState<"buy" | "sell-back">("buy");
  const [transactionStatus, setTransactionStatus] = useState<string>();
  const [transactionModal, setTransactionModal] = useState<{ phase: OnchainTransactionPhase; stepIndex: number; hash?: string; error?: string; explorerUrl?: string }>();
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000));

  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [quote]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    floatApi.getOptionsSeries(controller.signal).then((result) => {
      const filtered = underlying
        ? result.filter((item) => item.underlying.toLowerCase() === underlying.toLowerCase())
        : result;
      setSeries(filtered);
      setSelectedId((current) => current && filtered.some((item) => item.seriesId === current)
        ? current
        : filtered.find((item) => item.state === "0")?.seriesId);
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [reload, underlying]);

  const active = useMemo(() => series.filter((item) => item.state === "0"), [series]);
  const selected = series.find((item) => item.seriesId === selectedId);
  const quoteMetrics = selected && quote ? deriveQuoteMetrics(selected, quote) : undefined;
  const remainingQuoteSeconds = quote ? Math.max(0, quote.quote.validUntil - nowSeconds) : 0;

  const requestQuote = async () => {
    if (!selected || !address) return;
    const size18 = parseUnits18(size);
    if (!size18) {
      setQuoteError("Enter a positive size with no more than 18 decimals.");
      return;
    }
    setQuoting(true);
    setQuote(undefined);
    setQuoteError(undefined);
    try {
      setQuote(await floatApi.requestOptionsQuote({
        seriesId: selected.seriesId,
        buyer: address,
        side,
        size18,
      }));
    } catch {
      setQuoteError("Live quote is not available yet. The Options services may not be activated on this network.");
    } finally {
      setQuoting(false);
    }
  };

  const submitQuote = async () => {
    if (!quote || !provider || !address) return;
    if (quote.quote.validUntil <= Math.floor(Date.now() / 1_000)) {
      setQuoteError("This quote expired. Request a new quote before submitting.");
      return;
    }
    setTransactionModal({ phase: "pending", stepIndex: 0 });
    try {
      const config = await floatApi.getPublicConfig();
      if (!config.optionsMarketAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      const hash = await executeOptionsQuote({
        provider,
        account: address,
        market: config.optionsMarketAddress as `0x${string}`,
        usdg: config.usdgAddress as `0x${string}`,
        signed: quote,
        onStatus: (status) => setTransactionModal({ phase: "pending", stepIndex: status === "approval" ? 0 : status === "transaction" ? 1 : 2, explorerUrl: config.blockExplorerUrl }),
      });
      setTransactionModal({ phase: "success", stepIndex: 2, hash, explorerUrl: config.blockExplorerUrl });
      setTransactionStatus(undefined);
      setQuote(undefined);
    } catch {
      setTransactionStatus(undefined);
      setTransactionModal({ phase: "failed", stepIndex: 0, error: "The wallet transaction was rejected or failed simulation. No state was changed by the app." });
    }
  };

  if (loading) {
    return <div className={`container ${styles.state}`} role="status">Loading finalized option series…</div>;
  }
  if (error) {
    return (
      <div className={`container ${styles.state}`} role="alert">
        <p>Options data is temporarily unavailable.</p>
        <button type="button" onClick={() => setReload((value) => value + 1)}>Try again</button>
      </div>
    );
  }
  if (series.length === 0) {
    return (
      <div className={embedded ? undefined : "container"}>
        <EmptyState
          title="No finalized option series yet"
          description="The chain will populate automatically after an authorized series is created and finalized by the indexer."
        />
      </div>
    );
  }

  return (
    <Reveal className={`${embedded ? styles.embedded : "container"} ${styles.layout}`}>
      <section className={styles.chain} aria-labelledby="options-chain-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className="eyebrow">Canonical series</p>
            <h2 id="options-chain-title">Options chain</h2>
          </div>
          <p className={styles.count}><span className="tabular">{active.length}</span> active</p>
        </div>
        <div className={styles.scroller} role="region" aria-label="Multi-asset options chain" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Underlying</th>
                <th scope="col">Expiry</th>
                <th scope="col">Type</th>
                <th scope="col">Strike</th>
                <th scope="col">Cap</th>
                <th scope="col">Contract</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {series.map((item) => (
                <tr key={item.seriesId} data-selected={item.seriesId === selectedId}>
                  <td>{underlyingLabel(item.underlyingSymbol, item.underlying)}</td>
                  <td>
                    <button type="button" className={styles.selectRow} onClick={() => setSelectedId(item.seriesId)}>
                      {formatExpiry(item.expiry)}
                    </button>
                  </td>
                  <td>{item.kind === "0" ? "Capped call" : "Put"}</td>
                  <td className="tabular">{formatUsd18(item.strikeUsd18)}</td>
                  <td className="tabular">{item.kind === "0" ? formatUsd18(item.capUsd18) : "Not applicable"}</td>
                  <td className="tabular">{formatUnits18(item.contractSize18, underlyingLabel(item.underlyingSymbol, item.underlying))}</td>
                  <td><StatusChip tone={item.state === "0" ? "solid" : "outline"}>{SERIES_STATE[item.state] ?? "Unknown"}</StatusChip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className={styles.ticket} aria-labelledby="trade-ticket-title">
        <p className="eyebrow">Trade ticket</p>
        <h2 id="trade-ticket-title">Selected series</h2>
        {selected ? (
          <>
            <dl className={styles.terms}>
              <div><dt>Underlying</dt><dd>{underlyingLabel(selected.underlyingSymbol, selected.underlying)}</dd></div>
              <div><dt>Expiry</dt><dd>{formatExpiry(selected.expiry)}</dd></div>
              <div><dt>Strike</dt><dd className="tabular">{formatUsd18(selected.strikeUsd18)}</dd></div>
              <div><dt>Maximum payoff</dt><dd className="tabular">{formatMaximumPayoff(selected)}</dd></div>
              <div><dt>Settlement</dt><dd>USDG cash</dd></div>
            </dl>
            <PayoffChart series={selected} />
            <label className={styles.sizeField}>
              <span>Contract size</span>
              <input value={size} inputMode="decimal" onChange={(event) => setSize(event.target.value)} />
            </label>
            <label className={styles.sizeField}>
              <span>Action</span>
              <select value={side} onChange={(event) => {
                setSide(event.target.value as "buy" | "sell-back");
                setQuote(undefined);
              }}>
                <option value="buy">Buy</option>
                <option value="sell-back">Sell back</option>
              </select>
            </label>
            {quote && quoteMetrics && (
              <dl className={styles.quoteResult} aria-live="polite">
                <div><dt>{side === "buy" ? "Total premium" : "Sell-back payout"}</dt><dd>{formatUsdg6(quoteMetrics.totalPremium6)}</dd></div>
                <div><dt>Premium per unit</dt><dd>{formatUsdg6(quote.quote.premiumPerUnit6)}</dd></div>
                {side === "buy" && <div><dt>Maximum loss</dt><dd>{formatUsdg6(quoteMetrics.totalPremium6)}</dd></div>}
                {side === "buy" && <div><dt>Maximum gain</dt><dd>{formatUsdg6(quoteMetrics.maximumGain6)}</dd></div>}
                {side === "buy" && <div><dt>Breakeven at expiry</dt><dd>{formatUsd18(quoteMetrics.breakevenUsd18)}</dd></div>}
                <div><dt>Implied volatility</dt><dd>{(quote.volatility * 100).toFixed(2)}%</dd></div>
                <div><dt>IV source</dt><dd>{formatIvSource(quote.ivSource)}</dd></div>
                <div><dt>Pricing spread</dt><dd>{quote.spreadBps} bps</dd></div>
                <div><dt>Vault utilization</dt><dd>{(quote.utilizationBps / 100).toFixed(2)}%</dd></div>
                <div><dt>System status</dt><dd>{remainingQuoteSeconds > 0 ? "Executable" : "Quote expired"}</dd></div>
                <div><dt>Quote countdown</dt><dd>{remainingQuoteSeconds}s</dd></div>
              </dl>
            )}
            {quoteError && <p className={styles.quoteError} role="alert">{quoteError}</p>}
            {transactionStatus && <p className={styles.disclosure} role="status">{transactionStatus}</p>}
          </>
        ) : <p>Select an active series from the chain.</p>}
        <button
          type="button"
          className={styles.quoteButton}
          disabled={!selected || quoting}
          onClick={address ? requestQuote : openConnect}
        >
          {quoting ? "Requesting quote…" : address ? "Request live quote" : "Connect wallet to quote"}
        </button>
        <button type="button" className={`${styles.quoteButton} ${side === "buy" ? styles.buyAction : styles.sellAction}`} disabled={!quote || remainingQuoteSeconds === 0 || Boolean(transactionStatus)} onClick={submitQuote}>
          {quote ? `${side === "buy" ? "Buy" : "Sell back"} with this quote` : "Request a quote before submitting"}
        </button>
        <p className={styles.disclosure}>Signed premium includes the pricing spread shown above. The deployed market currently has no separate protocol trading fee. Buyers can lose the full premium.</p>
        <OnchainTransactionModal
          open={Boolean(transactionModal)}
          phase={transactionModal?.phase ?? "pending"}
          title={side === "buy" ? "Buy option" : "Sell option back"}
          steps={side === "buy" ? ["Approve exact USDG premium", "Confirm option purchase", "Wait for onchain confirmation"] : ["Confirm option sale", "Submit signed quote", "Wait for onchain confirmation"]}
          stepIndex={transactionModal?.stepIndex ?? 0}
          hash={transactionModal?.hash}
          explorerUrl={transactionModal?.explorerUrl}
          error={transactionModal?.error}
          onClose={() => setTransactionModal(undefined)}
        />
      </aside>
    </Reveal>
  );
}

function parseUnits18(value: string): string | undefined {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(value)) return undefined;
  const [whole = "0", fraction = ""] = value.split(".");
  const result = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0") || "0");
  return result > 0n && result <= (1n << 256n) - 1n ? result.toString() : undefined;
}

function formatUsdg6(value: string): string {
  const amount = BigInt(value);
  return `${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, "0")} USDG`;
}

function formatExpiry(value: string): string {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) return "Invalid expiry";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/New_York", timeZoneName: "short",
  }).format(new Date(seconds * 1_000));
}

function formatUsd18(value: string): string {
  const amount = BigInt(value);
  const whole = amount / 10n ** 18n;
  const fraction = (amount % 10n ** 18n).toString().padStart(18, "0").slice(0, 2);
  return `$${whole.toLocaleString("en-US")}.${fraction}`;
}

function formatUnits18(value: string, symbol: string): string {
  const amount = BigInt(value);
  const whole = amount / 10n ** 18n;
  const fraction = (amount % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} ${symbol}` : `${whole} ${symbol}`;
}

function underlyingLabel(symbol: string | null, address: string): string {
  return symbol?.trim() || `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatMaximumPayoff(series: OptionsSeriesDto): string {
  const strike = BigInt(series.strikeUsd18);
  const maximum = series.kind === "0" ? BigInt(series.capUsd18) - strike : strike;
  const scaled = maximum * BigInt(series.contractSize18) / 10n ** 18n;
  return formatUsd18(scaled.toString());
}

function deriveQuoteMetrics(series: OptionsSeriesDto, signed: SignedOptionsQuoteDto) {
  const unit = 10n ** 18n;
  const premiumPerUnit6 = BigInt(signed.quote.premiumPerUnit6);
  const size18 = BigInt(signed.quote.size18);
  const totalPremium6 = signed.quote.side === 0
    ? (premiumPerUnit6 * size18 + unit - 1n) / unit
    : premiumPerUnit6 * size18 / unit;
  const maximumPayoffUsd18 = (series.kind === "0"
    ? BigInt(series.capUsd18) - BigInt(series.strikeUsd18)
    : BigInt(series.strikeUsd18)) * BigInt(series.contractSize18) / unit;
  const maximumPayoff6 = maximumPayoffUsd18 * size18 / unit / 10n ** 12n;
  const maximumGain6 = maximumPayoff6 > totalPremium6 ? maximumPayoff6 - totalPremium6 : 0n;
  const premiumUsd18 = premiumPerUnit6 * 10n ** 12n;
  const priceDeltaUsd18 = premiumUsd18 * unit / BigInt(series.contractSize18);
  const strikeUsd18 = BigInt(series.strikeUsd18);
  const breakevenUsd18 = series.kind === "0"
    ? strikeUsd18 + priceDeltaUsd18
    : strikeUsd18 > priceDeltaUsd18 ? strikeUsd18 - priceDeltaUsd18 : 0n;
  return {
    totalPremium6: totalPremium6.toString(),
    maximumGain6: maximumGain6.toString(),
    breakevenUsd18: breakevenUsd18.toString(),
  };
}

function formatIvSource(value: string): string {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
