"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusChip } from "@/components/ui/StatusChip";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import { BalanceShortcuts } from "@/features/wallet/BalanceShortcuts";
import { useTokenBalance } from "@/features/wallet/useTokenBalance";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi, type PerpsLpStateDto, type PerpsLpWithdrawalDto, type PublicConfigDto } from "@/lib/api-client";
import { depositPerpsLiquidity, managePerpsLiquidityWithdrawal, requestPerpsLiquidityWithdrawal } from "@/lib/perps-transactions";
import { formatUnits, parseUnits } from "@/lib/units";
import styles from "./PerpsLiquidityPanel.module.css";

type Action = "deposit" | "withdraw";
type WithdrawalState = "queued" | "ready" | "processed" | "claimed" | "cancelled";
interface Withdrawal {
  readonly requestId: string;
  readonly shares18: string;
  readonly assets6?: string;
  readonly unlockAt: number;
  readonly state: WithdrawalState;
}

export function PerpsLiquidityPanel() {
  const { address, chainId, provider, openConnect, switchChain } = useWallet();
  const [config, setConfig] = useState<PublicConfigDto>();
  const [vault, setVault] = useState<PerpsLpStateDto | null>();
  const [withdrawalRows, setWithdrawalRows] = useState<readonly PerpsLpWithdrawalDto[]>([]);
  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [transaction, setTransaction] = useState<{ phase: OnchainTransactionPhase; stepIndex: number; hash?: string; error?: string; title: string }>();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadError(false);
    const [nextConfig, nextVault] = await Promise.all([
      floatApi.getPublicConfig(signal),
      floatApi.getPerpsLpState(signal),
    ]);
    setConfig(nextConfig);
    setVault(nextVault);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setLoadError(true);
    });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!address) { setWithdrawalRows([]); return; }
    const controller = new AbortController();
    void floatApi.getPerpsLpWithdrawals(address, controller.signal).then(setWithdrawalRows).catch(() => setWithdrawalRows([]));
    return () => controller.abort();
  }, [address]);

  const usdgBalance = useTokenBalance(config?.usdgAddress);
  const shareBalance = useTokenBalance(config?.perps?.liquidityVaultAddress);
  const inputBalance = action === "deposit" ? usdgBalance : shareBalance;
  const inputDecimals = action === "deposit" ? 6 : 18;
  const wrongChain = Boolean(address && config && chainId !== config.chainId);
  const withdrawals = useMemo(() => withdrawalRows.map((item): Withdrawal => ({
    requestId: item.requestId,
    shares18: item.shares18,
    ...(item.assets6 ? { assets6: item.assets6 } : {}),
    unlockAt: Math.floor(new Date(item.unlockAt).getTime() / 1000),
    state: item.state === "queued" && new Date(item.unlockAt).getTime() <= Date.now() ? "ready" : item.state,
  })), [withdrawalRows]);

  const submit = async () => {
    if (!address || !provider) return openConnect();
    if (!config?.perps || !vault) return setMessage("Perps LP is not configured on this network.");
    if (wrongChain) return switchChain(config.chainId);
    const units = parseUnits(amount, inputDecimals);
    if (!units) return setMessage("Enter a positive valid amount.");
    if (inputBalance !== undefined && BigInt(units) > inputBalance) return setMessage("The amount exceeds your wallet balance.");
    setBusy(true);
    setMessage(undefined);
    const title = action === "deposit" ? "Deposit Perps liquidity" : "Request LP withdrawal";
    setTransaction({ phase: "pending", stepIndex: 0, title });
    try {
      const hash = action === "deposit"
        ? await depositPerpsLiquidity({
          provider, account: address, usdg: config.usdgAddress as `0x${string}`, vault: vault.vaultAddress as `0x${string}`, assets6: BigInt(units),
          onStatus: (status) => setTransaction({ phase: "pending", stepIndex: status === "approval" ? 0 : status === "transaction" ? 1 : 2, title }),
        })
        : await requestPerpsLiquidityWithdrawal({
          provider, account: address, vault: vault.vaultAddress as `0x${string}`, shares18: BigInt(units),
          onStatus: (status) => setTransaction({ phase: "pending", stepIndex: status === "transaction" ? 0 : 1, title }),
        });
      setTransaction({ phase: "success", stepIndex: action === "deposit" ? 2 : 1, hash, title });
      setAmount("");
      await load();
      setWithdrawalRows(await floatApi.getPerpsLpWithdrawals(address));
    } catch {
      setTransaction({ phase: "failed", stepIndex: 0, title, error: "The transaction was rejected or failed simulation. No completed state change was recorded." });
    } finally {
      setBusy(false);
    }
  };

  const manage = async (requestId: string, requestAction: "cancel" | "claim") => {
    if (!address || !provider || !vault || !config) return openConnect();
    if (wrongChain) return switchChain(config.chainId);
    const title = requestAction === "cancel" ? "Cancel LP withdrawal" : "Claim LP withdrawal";
    setBusy(true);
    setTransaction({ phase: "pending", stepIndex: 0, title });
    try {
      const hash = await managePerpsLiquidityWithdrawal({ provider, account: address, vault: vault.vaultAddress as `0x${string}`, requestId: BigInt(requestId), action: requestAction });
      setTransaction({ phase: "success", stepIndex: 1, hash, title });
      await load();
      setWithdrawalRows(await floatApi.getPerpsLpWithdrawals(address));
    } catch {
      setTransaction({ phase: "failed", stepIndex: 0, title, error: "The withdrawal action was rejected or reverted." });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <section className={styles.unavailable}><p>Perps LP state is temporarily unavailable.</p><button type="button" onClick={() => void load().catch(() => setLoadError(true))}>Try again</button></section>;
  if (vault === undefined) return <section className={styles.unavailable}>Reading Perps LP state…</section>;
  if (!vault || !config?.perps) return <section className={styles.unavailable}>Perps LP is not configured on this environment.</section>;
  const utilization = Number(BigInt(vault.utilizationBps)) / 100;
  return (
    <main className={styles.shell}>
      <section className={styles.overview}>
        <div className={styles.heading}><div><p className="eyebrow">Perpetual markets</p><h2>Perps liquidity</h2></div><StatusChip tone={vault.operationsPaused ? "outline" : "solid"}>{vault.operationsPaused ? "Paused" : "Operational"}</StatusChip></div>
        <p className={styles.intro}>Supply USDG to settle profitable traders and earn protocol trading revenue. LP capital can absorb trader gains and bad debt, so returns are not guaranteed.</p>
        <dl className={styles.metrics}>
          <Metric label="Managed assets" value={`${formatUnits(vault.managedAssets6, 6, 2)} USDG`} />
          <Metric label="Available liquidity" value={`${formatUnits(vault.availableLiquidity6, 6, 2)} USDG`} />
          <Metric label="Trader liabilities" value={`${formatUnits(vault.reservedTraderLiability6, 6, 2)} USDG`} />
          <Metric label="Utilization" value={`${utilization.toFixed(2)}%`} />
          <Metric label="Queued withdrawals" value={`${formatUnits(vault.payableWithdrawalAssets6, 6, 2)} USDG`} />
          <Metric label="Recognized bad debt" value={`${formatUnits(vault.recognizedBadDebt6, 6, 2)} USDG`} />
          <Metric label="Net market exposure" value={`$${formatUnits(vault.netExposureUsd18, 18, 2)}`} />
          <Metric label="Long / short OI" value={`$${formatUnits(vault.totalLongOpenInterestUsd18, 18, 0)} / $${formatUnits(vault.totalShortOpenInterestUsd18, 18, 0)}`} />
          <Metric label="Realized annualized return" value={vault.realizedApyBps === null ? "Collecting 24h history" : `${formatSignedBps(vault.realizedApyBps)}%`} />
        </dl>
        <div className={styles.risk}><h3>Understand the LP risk</h3><p>Withdrawals are delayed and processed only when free liquidity remains after trader liabilities. During stressed markets, processing can take longer and LP share value may fall.</p></div>
      </section>

      <aside className={styles.panel}>
        <p className="eyebrow">Transaction panel</p><h2>Manage liquidity</h2>
        <div className={styles.tabs} role="tablist" aria-label="Perps liquidity action">
          <button type="button" role="tab" aria-selected={action === "deposit"} onClick={() => { setAction("deposit"); setAmount(""); setMessage(undefined); }}>Deposit</button>
          <button type="button" role="tab" aria-selected={action === "withdraw"} onClick={() => { setAction("withdraw"); setAmount(""); setMessage(undefined); }}>Request withdrawal</button>
        </div>
        <label className={styles.amount}><span>{action === "deposit" ? "Amount in USDG" : "LP share amount"}</span><input value={amount} inputMode="decimal" placeholder="0.00" onChange={(event) => { setAmount(event.target.value); setMessage(undefined); }} /></label>
        <BalanceShortcuts balance={inputBalance} decimals={inputDecimals} onSelect={setAmount} />
        <button type="button" className={styles.primary} disabled={busy || vault.operationsPaused} onClick={submit}>{address ? "Review in wallet" : "Connect wallet"}</button>
        <p className={styles.help}>{action === "deposit" ? "An exact USDG approval is requested before the vault deposit." : `Requests unlock after at least ${formatDelay(vault.minimumWithdrawalDelaySeconds)} and wait for protocol processing.`}</p>
        {message && <p className={styles.error} role="status">{message}</p>}
      </aside>

      <section className={styles.records}>
        <div className={styles.heading}><div><p className="eyebrow">Wallet records</p><h2>LP withdrawals</h2></div></div>
        {!address ? <p className={styles.empty}>Connect a wallet to see its withdrawal requests.</p> : withdrawals.length === 0 ? <p className={styles.empty}>No withdrawal requests found for this wallet.</p> : (
          <div className={styles.tableWrap}><table><thead><tr><th>Request</th><th>Shares</th><th>Unlocks</th><th>Status</th><th>Action</th></tr></thead><tbody>{withdrawals.map((item) => <tr key={item.requestId}><td>#{item.requestId}</td><td>{formatUnits(item.shares18, 18, 4)}</td><td>{new Date(item.unlockAt * 1000).toLocaleString("en-US")}</td><td>{item.state === "ready" ? "Waiting for protocol processing" : item.state}</td><td>{item.state === "queued" || item.state === "ready" ? <button type="button" disabled={busy} onClick={() => manage(item.requestId, "cancel")}>Cancel</button> : item.state === "processed" ? <button type="button" disabled={busy} onClick={() => manage(item.requestId, "claim")}>Claim {item.assets6 ? `${formatUnits(item.assets6, 6, 2)} USDG` : ""}</button> : "—"}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <OnchainTransactionModal open={Boolean(transaction)} phase={transaction?.phase ?? "pending"} title={transaction?.title ?? "Perps liquidity transaction"} steps={transaction?.title.includes("Deposit") ? ["Approve exact USDG amount", "Confirm vault deposit", "Wait for confirmation"] : ["Confirm withdrawal action", "Wait for confirmation"]} stepIndex={transaction?.stepIndex ?? 0} hash={transaction?.hash} explorerUrl={config.blockExplorerUrl} error={transaction?.error} onClose={() => setTransaction(undefined)} />
    </main>
  );
}

function formatDelay(seconds: number): string { const hours = seconds / 3600; return hours >= 24 && Number.isInteger(hours / 24) ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours.toFixed(hours < 1 ? 1 : 0)} hours`; }
function formatSignedBps(bps: number): string { return `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)}`; }
function Metric({ label, value }: { readonly label: string; readonly value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
