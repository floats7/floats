"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import { useWallet } from "@/features/wallet/WalletProvider";
import { BalanceShortcuts } from "@/features/wallet/BalanceShortcuts";
import { useTokenBalance } from "@/features/wallet/useTokenBalance";
import { floatApi, type PerpsActivityDto, type PerpsTradePreviewDto, type PerpsWalletDto, type PublicConfigDto } from "@/lib/api-client";
import { changeIsolatedPerpsMargin, executePerpsTrade } from "@/lib/perps-transactions";
import { formatUnits, parseUnits } from "@/lib/units";
import { formatUtcMarketOpen, isUsMarketOpen, nextUsMarketOpen } from "@/lib/market-hours";
import styles from "./PerpsPositions.module.css";

export function PerpsPositions({ marketId }: { readonly marketId?: string }) {
  const { address, chainId, provider, openConnect, switchChain } = useWallet();
  const [wallet, setWallet] = useState<PerpsWalletDto | null>();
  const [activity, setActivity] = useState<readonly PerpsActivityDto[]>([]);
  const [config, setConfig] = useState<PublicConfigDto>();
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [review, setReview] = useState<{ position: PerpsWalletDto["positions"][number]; percent: 25 | 50 | 100; delta18: bigint; preview: PerpsTradePreviewDto }>();
  const [marginEdit, setMarginEdit] = useState<{ position: PerpsWalletDto["positions"][number]; action: "add" | "remove"; amount: string }>();
  const [modal, setModal] = useState<{ phase: OnchainTransactionPhase; stepIndex: number; hash?: string; error?: string }>();
  const usdgBalance = useTokenBalance(config?.usdgAddress);
  const wrongChain = Boolean(address && config && chainId !== config.chainId);
  const underlyingMarketOpen = isUsMarketOpen(new Date());
  const nextOpen = !underlyingMarketOpen ? formatUtcMarketOpen(nextUsMarketOpen(new Date())) : undefined;

  useEffect(() => { void floatApi.getPublicConfig().then(setConfig); }, []);

  useEffect(() => {
    if (!address) {
      setWallet(undefined);
      return;
    }
    const controller = new AbortController();
    setError(false);
    Promise.all([
      floatApi.getPerpsPositions(address, controller.signal),
      floatApi.getPerpsActivity(100, controller.signal),
    ])
      .then(([positions, nextActivity]) => { setWallet(positions); setActivity(nextActivity); })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, [address, refresh]);

  const reviewReduction = async (position: PerpsWalletDto["positions"][number], percent: 25 | 50 | 100) => {
    if (!address) return;
    const size = BigInt(position.size18);
    const magnitude = (size < 0n ? -size : size) * BigInt(percent) / 100n;
    const delta18 = size > 0n ? -magnitude : magnitude;
    try {
      const preview = await floatApi.requestPerpsPreview({ account: address, marketId: position.marketId, sizeDelta18: delta18.toString() });
      setReview({ position, percent, delta18, preview });
    } catch {
      setError(true);
    }
  };

  const submitReduction = async () => {
    if (!review || !address || !provider || !config?.perps) return;
    if (wrongChain) return switchChain(config.chainId);
    setModal({ phase: "pending", stepIndex: 0 });
    try {
      const hash = await executePerpsTrade({
        provider,
        account: address,
        market: config.perps.marketAddress as `0x${string}`,
        marketId: review.position.marketId as `0x${string}`,
        sizeDelta18: review.delta18,
        executionPriceUsd18: BigInt(review.preview.executionPriceUsd18),
        onStatus: (next) => setModal({ phase: "pending", stepIndex: next === "transaction" ? 0 : 1 }),
      });
      setModal({ phase: "success", stepIndex: 1, hash });
      setReview(undefined);
      setRefresh((value) => value + 1);
    } catch {
      setModal({ phase: "failed", stepIndex: 0, error: "The reduce or close transaction was rejected or failed simulation." });
    }
  };

  const submitMargin = async () => {
    if (!marginEdit || !address || !provider || !config?.perps) return;
    if (wrongChain) return switchChain(config.chainId);
    const assets6 = parseUnits(marginEdit.amount, 6);
    if (!assets6) return;
    const adding = marginEdit.action === "add";
    setModal({ phase: "pending", stepIndex: 0 });
    try {
      const hash = await changeIsolatedPerpsMargin({
        provider,
        account: address,
        usdg: config.usdgAddress as `0x${string}`,
        marginAccount: config.perps.marginAccountAddress as `0x${string}`,
        marketId: marginEdit.position.marketId as `0x${string}`,
        action: marginEdit.action,
        assets6: BigInt(assets6),
        onStatus: (status) => setModal({ phase: "pending", stepIndex: status === "approval" ? 0 : status === "deposit" ? 1 : status === "margin" ? (adding ? 2 : 0) : (adding ? 3 : 1) }),
      });
      setModal({ phase: "success", stepIndex: adding ? 3 : 1, hash });
      setMarginEdit(undefined);
      setRefresh((value) => value + 1);
    } catch {
      setModal({ phase: "failed", stepIndex: 0, error: adding ? "Adding margin was rejected or failed simulation." : "Removing this amount would make the position unsafe, or the transaction was rejected." });
    }
  };

  if (!address) return <EmptyState title="Connect a wallet to view Perps positions" description="Position ownership is read directly from the connected address. No message signature is required." action={<button type="button" onClick={openConnect}>Connect wallet</button>} />;
  if (error) return <EmptyState title={underlyingMarketOpen ? "Positions are updating" : "Market is closed"} description={underlyingMarketOpen ? "We are waiting for the latest onchain market price. Try again shortly." : `Your position remains onchain. Live health and trading resume when the market opens ${nextOpen}.`} action={<button type="button" onClick={() => setRefresh((value) => value + 1)}>Check again</button>} />;
  if (wallet === undefined) return <p role="status">Reading onchain Perps positions…</p>;

  const positions = wallet?.positions.filter((position) => !marketId || position.marketId === marketId) ?? [];
  const funding = activity.filter((item) => item.eventName === "PerpsFundingUpdated" && (!marketId || item.marketId === marketId));
  if (!positions.length && !funding.length) return <EmptyState title="No Perps records yet" description="Open positions and finalized funding updates will appear here." />;

  return (
    <div className={styles.wrapper}>
      {!underlyingMarketOpen && <p role="status">Market is closed. Your position remains onchain. Live health and position changes resume when trading opens {nextOpen}.</p>}
      {wrongChain && <p role="alert">Switch to the configured Floats network before changing a position or its margin.</p>}
      <div className={styles.collateral}>
        <div><span>Free collateral</span><strong>{formatUnits(wallet!.collateral.freeCollateral6, 6, 2)} USDG</strong></div>
        <div><span>Cross collateral</span><strong>{formatUnits(wallet!.collateral.crossCollateral6, 6, 2)} USDG</strong></div>
        <div><span>Cross health</span><strong data-risk={riskTone(wallet!.collateral.crossHealth.marginRatio18, wallet!.collateral.crossHealth.liquidatable)}>{wallet!.collateral.crossHealth.liquidatable ? "Liquidatable" : formatRatio(wallet!.collateral.crossHealth.marginRatio18)}</strong></div>
      </div>
      {positions.length > 0 && <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Side / size</th><th>Mode</th><th>Entry</th><th>Equity</th><th>Margin ratio</th><th>Liquidation</th><th>Position actions</th></tr></thead>
          <tbody>{positions.map((position) => {
            const size = BigInt(position.size18);
            return <tr key={position.marketId}>
              <td><strong>{size > 0n ? "Long" : "Short"}</strong><br />{formatUnits((size < 0n ? -size : size).toString(), 18, 6)}</td>
              <td>{position.marginMode === "isolated" ? "Isolated" : "Cross"}</td>
              <td>${formatUnits(position.entryPriceUsd18, 18, 4)}</td>
              <td>{position.healthAvailable ? `$${formatSigned(position.equityUsd18, 18, 2)}` : "Updates when market opens"}</td>
              <td>{position.healthAvailable ? <span data-risk={riskTone(position.marginRatio18, position.liquidatable)}>{position.liquidatable ? "Liquidatable" : formatRatio(position.marginRatio18)}</span> : "Waiting for live price"}</td>
              <td>{!position.healthAvailable ? "Waiting for live price" : position.marginMode === "cross" ? "Portfolio health" : `$${formatUnits(position.liquidationPriceUsd18, 18, 4)}`}</td>
              <td><div className={styles.actions}>{position.marginMode === "isolated" && <><button type="button" onClick={() => setMarginEdit({ position, action: "add", amount: "" })}>Add margin</button><button type="button" disabled={!position.healthAvailable} title={position.healthAvailable ? undefined : `Available when the market opens ${nextOpen}.`} onClick={() => setMarginEdit({ position, action: "remove", amount: "" })}>Remove margin</button></>}{([25, 50, 100] as const).map((percent) => <button type="button" key={percent} disabled={!position.healthAvailable} title={position.healthAvailable ? undefined : `Available when the market opens ${nextOpen}.`} onClick={() => void reviewReduction(position, percent)}>{percent === 100 ? "Close" : `Reduce ${percent}%`}</button>)}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {review && <div className={styles.review}>
        <div><span>Action</span><strong>{review.percent === 100 ? "Close position" : `Reduce ${review.percent}%`}</strong></div>
        <div><span>Estimated execution</span><strong>${formatUnits(review.preview.executionPriceUsd18, 18, 4)}</strong></div>
        <div><span>Trading fee</span><strong>{formatUnits(review.preview.feeUsd6, 6, 6)} USDG</strong></div>
        <button type="button" onClick={() => void submitReduction()}>{review.percent === 100 ? "Confirm close" : "Confirm reduce"}</button>
        <button type="button" onClick={() => setReview(undefined)}>Cancel</button>
      </div>}
      {marginEdit && <div className={styles.review}>
        <div><span>Margin action</span><strong>{marginEdit.action === "add" ? "Add isolated margin" : "Remove isolated margin"}</strong></div>
        <div><span>Current isolated margin</span><strong>{formatUnits(marginEdit.position.isolatedMargin6, 6, 2)} USDG</strong></div>
        <label><span>Amount in USDG</span><input inputMode="decimal" value={marginEdit.amount} onChange={(event) => setMarginEdit({ ...marginEdit, amount: event.target.value })} /></label>
        <BalanceShortcuts balance={marginEdit.action === "add" ? usdgBalance : BigInt(marginEdit.position.isolatedMargin6)} decimals={6} onSelect={(amount) => setMarginEdit({ ...marginEdit, amount })} />
        <p>{marginEdit.action === "remove" ? "The contract rejects any removal that would leave this position below its required health." : "USDG is deposited into your margin account and allocated to this position in the same wallet flow."}</p>
        <button type="button" disabled={!parseUnits(marginEdit.amount, 6)} onClick={() => void submitMargin()}>Confirm {marginEdit.action}</button>
        <button type="button" onClick={() => setMarginEdit(undefined)}>Cancel</button>
      </div>}
      {funding.length > 0 && <div className={styles.tableWrap}>
        <h3>Funding history</h3>
        <table><thead><tr><th>Time</th><th>Rate</th><th>Funding index</th><th>Long OI</th><th>Short OI</th></tr></thead>
          <tbody>{funding.map((item) => <tr key={`${item.transactionHash}-${item.logIndex}`}>
            <td>{new Date(item.observedAt).toLocaleString()}</td>
            <td>{formatFunding(payloadString(item.payload, "fundingRate18"))}</td>
            <td>{formatSigned(payloadString(item.payload, "cumulativeFundingIndex18"), 18, 8)}</td>
            <td>${formatUnits(payloadString(item.payload, "longOpenInterestUsd18"), 18, 2)}</td>
            <td>${formatUnits(payloadString(item.payload, "shortOpenInterestUsd18"), 18, 2)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <OnchainTransactionModal open={Boolean(modal)} phase={modal?.phase ?? "pending"} title={marginEdit ? `${marginEdit.action === "add" ? "Add" : "Remove"} isolated margin` : "Reduce Perps position"} steps={marginEdit?.action === "add" ? ["Approve exact USDG amount", "Deposit collateral", "Allocate isolated margin", "Wait for confirmation"] : marginEdit?.action === "remove" ? ["Confirm safe margin removal", "Wait for confirmation"] : ["Confirm position change in wallet", "Wait for onchain confirmation"]} stepIndex={modal?.stepIndex ?? 0} hash={modal?.hash} explorerUrl={config?.blockExplorerUrl} error={modal?.error} onClose={() => setModal(undefined)} />
    </div>
  );
}

function formatRatio(value: string): string {
  const ratio = BigInt(value);
  if (ratio > 1000n * 10n ** 18n) return "Critical";
  return `${(Number(ratio / 10n ** 14n) / 100).toFixed(2)}%`;
}

function riskTone(value: string, liquidatable: boolean): "safe" | "warning" | "danger" {
  if (liquidatable) return "danger";
  const ratio = BigInt(value);
  if (ratio >= 8n * 10n ** 17n) return "warning";
  return "safe";
}

function formatSigned(value: string, decimals: number, precision: number): string {
  const amount = BigInt(value);
  return `${amount < 0n ? "-" : ""}${formatUnits((amount < 0n ? -amount : amount).toString(), decimals, precision)}`;
}

function payloadString(payload: Readonly<Record<string, unknown>>, key: string): string {
  const value = payload[key];
  return typeof value === "string" && /^-?[0-9]+$/.test(value) ? value : "0";
}

function formatFunding(value: string): string {
  const rate = BigInt(value);
  const sign = rate > 0n ? "+" : rate < 0n ? "-" : "";
  const absolute = rate < 0n ? -rate : rate;
  return `${sign}${(Number(absolute / 10n ** 12n) / 10_000).toFixed(4)}% / hour`;
}
