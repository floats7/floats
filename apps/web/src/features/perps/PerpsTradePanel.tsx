"use client";

import { useEffect, useState } from "react";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import { useWallet } from "@/features/wallet/WalletProvider";
import { BalanceShortcuts } from "@/features/wallet/BalanceShortcuts";
import { useTokenBalance } from "@/features/wallet/useTokenBalance";
import { floatApi, type PerpsMarketDto, type PerpsTradePreviewDto, type PublicConfigDto } from "@/lib/api-client";
import { executePerpsTrade, fundPerpsMargin } from "@/lib/perps-transactions";
import { formatUnits } from "@/lib/units";
import styles from "@/features/markets/SpotTradePanel.module.css";

export function PerpsTradePanel({ market }: { readonly market: PerpsMarketDto }) {
  const { address, chainId, provider, openConnect, switchChain } = useWallet();
  const [config, setConfig] = useState<PublicConfigDto>();
  const [side, setSide] = useState<"long" | "short">("long");
  const [margin, setMargin] = useState("10");
  const [leverage, setLeverage] = useState(1);
  const [marginMode, setMarginMode] = useState<"isolated" | "cross">("isolated");
  const [preview, setPreview] = useState<PerpsTradePreviewDto>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ phase: OnchainTransactionPhase; stepIndex: number; title: string; hash?: string; error?: string }>();
  const [positionMode, setPositionMode] = useState<"isolated" | "cross">();
  const [accessAllowed, setAccessAllowed] = useState(true);
  const usdgBalance = useTokenBalance(config?.usdgAddress);
  const wrongChain = Boolean(address && config && chainId !== config.chainId);
  const canIncrease = market.marketState === "active" && market.sessionState !== "closed" && market.oracleHealth === "live";
  const maximumLeverage = Math.max(1, Math.floor(market.maxLeverageBps / 10_000));
  const marginAssets6 = parseUnits(margin, 6);
  const positionSize18 = marginAssets6 && market.markPriceUsd18
    ? marginAssets6 * 10n ** 12n * BigInt(leverage) * 10n ** 18n / BigInt(market.markPriceUsd18)
    : undefined;

  useEffect(() => { void floatApi.getPublicConfig().then(setConfig).catch(() => setStatus("Network configuration is temporarily unavailable.")); }, []);
  useEffect(() => { void floatApi.getPerpsAccess().then((access) => setAccessAllowed(access.allowed)).catch(() => setAccessAllowed(false)); }, []);
  useEffect(() => {
    if (!address) { setPositionMode(undefined); return; }
    const controller = new AbortController();
    void floatApi.getPerpsPositions(address, controller.signal).then((wallet) => {
      const position = wallet?.positions.find((candidate) => candidate.marketId === market.marketId && BigInt(candidate.size18) !== 0n);
      setPositionMode(position?.marginMode);
      if (position?.marginMode) setMarginMode(position.marginMode);
    }).catch(() => setPositionMode(undefined));
    return () => controller.abort();
  }, [address, market.marketId]);

  const fundMargin = async () => {
    if (!address || !provider || !config?.perps) return openConnect();
    if (wrongChain) return switchChain(config.chainId);
    const assets6 = parseUnits(margin, 6);
    if (!assets6) return setStatus("Enter a positive USDG margin amount.");
    const fundingTitle = marginMode === "cross" ? "Fund Cross margin" : "Fund isolated margin";
    setBusy(true);
    setModal({ phase: "pending", stepIndex: 0, title: fundingTitle });
    try {
      const hash = await fundPerpsMargin({
        provider,
        account: address,
        usdg: config.usdgAddress as `0x${string}`,
        marginAccount: config.perps.marginAccountAddress as `0x${string}`,
        marketId: market.marketId as `0x${string}`,
        mode: marginMode,
        assets6,
        onStatus: (next) => setModal({
          phase: "pending",
          stepIndex: next === "approval" ? 0 : next === "deposit" ? 1 : next === "mode" ? 2 : next === "allocate" ? (marginMode === "cross" ? 3 : 2) : (marginMode === "cross" ? 4 : 3),
          title: fundingTitle,
        }),
      });
      setModal({ phase: "success", stepIndex: marginMode === "cross" ? 4 : 3, title: fundingTitle, hash });
      setStatus(`${marginMode === "cross" ? "Cross" : "Isolated"} margin is ready for this market.`);
    } catch {
      setModal({ phase: "failed", stepIndex: 0, title: fundingTitle, error: "Margin funding was rejected or failed simulation." });
    } finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (!address) return openConnect();
    const magnitude = positionSize18;
    if (!magnitude) return setStatus("Enter a positive position size.");
    setBusy(true);
    setPreview(undefined);
    try {
      setPreview(await floatApi.requestPerpsPreview({
        account: address,
        marketId: market.marketId,
        sizeDelta18: (side === "long" ? magnitude : -magnitude).toString(),
      }));
      setStatus(undefined);
    } catch {
      setStatus("A live onchain preview is unavailable. Check margin, market session, and oracle status.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!address || !provider || !config?.perps || !preview) return;
    if (wrongChain) return switchChain(config.chainId);
    const magnitude = positionSize18;
    if (!magnitude) return;
    setBusy(true);
    setModal({ phase: "pending", stepIndex: 0, title: `${side === "long" ? "Open long" : "Open short"} ${market.symbol}` });
    try {
      const hash = await executePerpsTrade({
        provider,
        account: address,
        market: config.perps.marketAddress as `0x${string}`,
        marketId: market.marketId as `0x${string}`,
        sizeDelta18: side === "long" ? magnitude : -magnitude,
        executionPriceUsd18: BigInt(preview.executionPriceUsd18),
        onStatus: (next) => setModal({ phase: "pending", stepIndex: next === "transaction" ? 0 : 1, title: `${side === "long" ? "Open long" : "Open short"} ${market.symbol}` }),
      });
      setModal({ phase: "success", stepIndex: 1, title: `${side === "long" ? "Open long" : "Open short"} ${market.symbol}`, hash });
      setPreview(undefined);
    } catch {
      setModal({ phase: "failed", stepIndex: 0, title: "Perps transaction", error: "The position transaction was rejected or failed simulation." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Perps side">
        <button type="button" role="tab" data-side="buy" aria-selected={side === "long"} onClick={() => { setSide("long"); setPreview(undefined); }}>Long</button>
        <button type="button" role="tab" data-side="sell" aria-selected={side === "short"} onClick={() => { setSide("short"); setPreview(undefined); }}>Short</button>
      </div>
      <p className={styles.note}>{market.isolatedOnly ? "Isolated margin only" : "Isolated margin is the default"} · Maximum {(market.maxLeverageBps / 10_000).toFixed(0)}×</p>
      {!market.isolatedOnly && <div className={styles.tabs} role="tablist" aria-label="Margin mode">
        <button type="button" role="tab" aria-selected={marginMode === "isolated"} disabled={Boolean(positionMode)} onClick={() => setMarginMode("isolated")}>Isolated</button>
        <button type="button" role="tab" aria-selected={marginMode === "cross"} disabled={Boolean(positionMode)} onClick={() => setMarginMode("cross")}>Cross</button>
      </div>}
      {positionMode && <p className={styles.note}>Margin mode is locked to {positionMode === "isolated" ? "Isolated" : "Cross"} while this position is open. Close the position before changing it.</p>}
      {market.isolatedOnly && <p className={styles.note}>Cross margin is unavailable for this market because its live risk configuration requires isolated collateral.</p>}
      <p className={styles.note}>Session: {market.sessionState === "regular" ? "Open" : market.sessionState === "extended" ? "Extended" : market.sessionState === "overnight" ? "Overnight" : "Closed — reduce only"}{market.marketState === "reduce_only" ? " · Reduce only" : ""}</p>
      <p className={styles.note}>Oracle: {market.oracleHealth === "live" ? "Live" : "Unavailable — new positions are blocked"}</p>
      {!accessAllowed && <p className={styles.note} role="alert">Perpetual trading is unavailable in your jurisdiction. Public market information remains visible.</p>}
      {wrongChain && <p className={styles.note} role="alert">Switch to the configured Floats network before funding margin or submitting a position.</p>}
      <label><span>Margin in USDG</span><input value={margin} inputMode="decimal" onChange={(event) => { setMargin(event.target.value); setPreview(undefined); }} /></label>
      <BalanceShortcuts balance={usdgBalance} decimals={6} onSelect={(value) => { setMargin(value); setPreview(undefined); }} />
      <button type="button" disabled={busy || !accessAllowed} onClick={address ? fundMargin : openConnect}>{wrongChain ? "Switch network" : address ? `Fund ${marginMode === "cross" ? "Cross" : "Isolated"} margin` : "Connect wallet"}</button>
      <label><span>Leverage: {leverage}×</span><input type="range" min="1" max={maximumLeverage} step="1" value={leverage} onChange={(event) => { setLeverage(Number(event.target.value)); setPreview(undefined); }} /></label>
      <p className={styles.note}>Estimated position size: {positionSize18 ? formatUnits(positionSize18.toString(), 18, 6) : "0"} {market.symbol.replace("-PERP", "")}</p>
      {preview && <dl className={styles.quote}>
        <div><dt>Mark price</dt><dd>${formatUnits(preview.markPriceUsd18, 18, 4)}</dd></div>
        <div><dt>Estimated execution</dt><dd>${formatUnits(preview.executionPriceUsd18, 18, 4)}</dd></div>
        <div><dt>Spread</dt><dd>{(preview.spreadBps / 100).toFixed(2)}%</dd></div>
        <div><dt>Trading fee</dt><dd>{formatUnits(preview.feeUsd6, 6, 6)} USDG</dd></div>
        <div><dt>Resulting notional</dt><dd>${formatUnits(preview.resultingNotionalUsd18, 18, 2)}</dd></div>
        <div><dt>Required initial margin</dt><dd>${formatUnits(preview.requiredInitialMarginUsd18, 18, 2)}</dd></div>
        <div><dt>Estimated liquidation price</dt><dd>{preview.liquidationPriceUsd18 === "0" ? "Cross portfolio health" : `$${formatUnits(preview.liquidationPriceUsd18, 18, 4)}`}</dd></div>
      </dl>}
      {status && <p role="status">{status}</p>}
      {!preview
        ? <button type="button" disabled={busy || !canIncrease || !accessAllowed} title={canIncrease ? undefined : market.oracleHealth !== "live" ? "The official onchain oracle is unavailable. Existing positions can still be reviewed below the chart." : "New positions are disabled; existing positions can still be reduced or closed below the chart."} onClick={review}>{busy ? "Reading onchain preview…" : canIncrease && accessAllowed ? "Review position" : "New positions unavailable"}</button>
        : <button type="button" className={side === "long" ? styles.buyAction : styles.sellAction} disabled={busy} onClick={submit}>{wrongChain ? "Switch network" : side === "long" ? "Open long" : "Open short"}</button>}
      <p className={styles.note}>Perpetual positions use USDG margin. Leverage, funding, price gaps, liquidation, and market-hours restrictions can reduce or exhaust your margin.</p>
      <OnchainTransactionModal open={Boolean(modal)} phase={modal?.phase ?? "pending"} title={modal?.title ?? "Perps transaction"} steps={modal?.title?.startsWith("Fund ") ? (marginMode === "cross" ? ["Approve exact USDG amount", "Deposit collateral", "Select Cross mode", "Allocate Cross collateral", "Wait for confirmation"] : ["Approve exact USDG amount", "Deposit collateral", "Allocate isolated margin", "Wait for confirmation"]) : ["Confirm position in wallet", "Wait for confirmation"]} stepIndex={modal?.stepIndex ?? 0} hash={modal?.hash} explorerUrl={config?.blockExplorerUrl} error={modal?.error} onClose={() => setModal(undefined)} />
    </div>
  );
}

function parseUnits(value: string, decimals: number): bigint | undefined {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return undefined;
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals) return undefined;
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return units > 0n ? units : undefined;
}
