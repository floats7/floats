"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi, type MarketAssetDto, type PublicConfigDto, type SpotRouteDto } from "@/lib/api-client";
import { executeSpot, quoteSpot, type SpotQuote } from "@/lib/spot-transactions";
import { formatUnits } from "@/lib/units";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import styles from "./SpotTradePanel.module.css";
import { useTokenBalance } from "@/features/wallet/useTokenBalance";
import { BalanceShortcuts } from "@/features/wallet/BalanceShortcuts";

const SLIPPAGE_BPS = 100;

export function SpotTradePanel({ market }: { readonly market: MarketAssetDto }) {
  const { address, provider, openConnect } = useWallet();
  const [config, setConfig] = useState<PublicConfigDto>();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<SpotQuote>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [transactionModal, setTransactionModal] = useState<{ phase: OnchainTransactionPhase; stepIndex: number; hash?: string; error?: string }>();

  useEffect(() => { void floatApi.getPublicConfig().then(setConfig); }, []);
  const route = config?.spotRoutes.find((candidate) => candidate.tokenAddress.toLowerCase() === market.address.toLowerCase());
  const inputDecimals = side === "buy" ? 6 : market.decimals;
  const outputDecimals = side === "buy" ? market.decimals : 6;
  const inputSymbol = side === "buy" ? "USDG" : market.symbol;
  const outputSymbol = side === "buy" ? market.symbol : "USDG";
  const inputBalance = useTokenBalance(side === "buy" ? config?.usdgAddress : market.address);

  const requestQuote = async () => {
    if (!provider || !route || !config) return address ? undefined : openConnect();
    const units = parseAmount(amount, inputDecimals);
    if (!units) return setStatus("Enter a positive valid amount.");
    setBusy(true);
    setQuote(undefined);
    setStatus("Reading the approved Uniswap route.");
    try {
      setQuote(await quoteSpot({ provider, route, usdg: config.usdgAddress as `0x${string}`, side, amountIn: units, slippageBps: SLIPPAGE_BPS }));
      setStatus(undefined);
    } catch {
      setStatus("A live route quote is unavailable for this amount.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!provider || !address || !route || !config || !quote) return;
    setBusy(true);
    setTransactionModal({ phase: "pending", stepIndex: 0 });
    try {
      const hash = await executeSpot({
        provider, account: address, route, usdg: config.usdgAddress as `0x${string}`, side, quote,
        onStatus: (next) => setTransactionModal({ phase: "pending", stepIndex: next === "approval" ? 0 : next === "transaction" ? 1 : 2 }),
      });
      setTransactionModal({ phase: "success", stepIndex: 2, hash });
      setStatus(undefined);
      setQuote(undefined);
    } catch {
      setTransactionModal({ phase: "failed", stepIndex: 0, error: "The swap was rejected or failed simulation. No swap was submitted by the app." });
    } finally {
      setBusy(false);
    }
  };

  if (!route) return <p>This asset has no approved direct spot route.</p>;
  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Spot action">
        <button type="button" role="tab" data-side="buy" aria-selected={side === "buy"} onClick={() => { setSide("buy"); setQuote(undefined); }}>Buy</button>
        <button type="button" role="tab" data-side="sell" aria-selected={side === "sell"} onClick={() => { setSide("sell"); setQuote(undefined); }}>Sell</button>
      </div>
      <label><span>Pay with {inputSymbol}</span><input value={amount} inputMode="decimal" onChange={(event) => { setAmount(event.target.value); setQuote(undefined); }} /></label>
      <BalanceShortcuts balance={inputBalance} decimals={inputDecimals} onSelect={(value) => { setAmount(value); setQuote(undefined); }} />
      {quote && <dl className={styles.quote}><div><dt>Estimated output</dt><dd>{formatUnits(quote.amountOut.toString(), outputDecimals, 6)} {outputSymbol}</dd></div><div><dt>Minimum received</dt><dd>{formatUnits(quote.minimumOut.toString(), outputDecimals, 6)} {outputSymbol}</dd></div><div><dt>Slippage limit</dt><dd>1.00%</dd></div><div><dt>Venue</dt><dd>Uniswap V3</dd></div></dl>}
      {status && <p role="status">{status}</p>}
      {!quote ? <button type="button" disabled={busy} onClick={address ? requestQuote : openConnect}>{busy ? "Requesting quote…" : address ? "Review quote" : "Connect wallet"}</button> : <button type="button" className={side === "buy" ? styles.buyAction : styles.sellAction} disabled={busy} onClick={submit}>{busy ? "Processing…" : `${side === "buy" ? "Buy" : "Sell"} ${market.symbol}`}</button>}
      <p className={styles.note}>Direct spot execution uses the approved USDG pool. The wallet receives the output token directly; Floats never takes custody.</p>
      <OnchainTransactionModal
        open={Boolean(transactionModal)}
        phase={transactionModal?.phase ?? "pending"}
        title={`${side === "buy" ? "Buy" : "Sell"} ${market.symbol}`}
        steps={["Approve exact token amount", "Confirm swap in wallet", "Wait for onchain confirmation"]}
        stepIndex={transactionModal?.stepIndex ?? 0}
        hash={transactionModal?.hash}
        explorerUrl={config?.blockExplorerUrl}
        error={transactionModal?.error}
        onClose={() => setTransactionModal(undefined)}
      />
    </div>
  );
}

function parseAmount(value: string, decimals: number): bigint | undefined {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return undefined;
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals) return undefined;
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return units > 0n ? units : undefined;
}
