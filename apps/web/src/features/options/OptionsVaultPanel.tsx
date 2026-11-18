"use client";

import { useEffect, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { floatApi, type OptionsVaultStateDto } from "@/lib/api-client";
import styles from "./OptionsVaultPanel.module.css";
import { useWallet } from "@/features/wallet/WalletProvider";
import { depositOptionsLiquidity, describeOptionsVaultError, requestOptionsWithdrawal } from "@/lib/options-transactions";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import { useTokenBalance } from "@/features/wallet/useTokenBalance";
import { BalanceShortcuts } from "@/features/wallet/BalanceShortcuts";

export function OptionsVaultPanel({ embedded = false }: { readonly embedded?: boolean }) {
  const { address, provider, openConnect } = useWallet();
  const [state, setState] = useState<OptionsVaultStateDto | null>();
  const [error, setError] = useState(false);
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [transactionStatus, setTransactionStatus] = useState<string>();
  const [transactionModal, setTransactionModal] = useState<{ phase: OnchainTransactionPhase; stepIndex: number; hash?: string; error?: string; explorerUrl?: string }>();
  const [config, setConfig] = useState<Awaited<ReturnType<typeof floatApi.getPublicConfig>>>();
  const inputBalance = useTokenBalance(action === "deposit" ? config?.usdgAddress : config?.optionsVaultAddress ?? undefined);

  const submit = async () => {
    if (!address || !provider) return openConnect();
    const units = parseAmount(amount, action === "deposit" ? 6 : 18);
    if (!units) return setTransactionStatus("Enter a positive valid amount.");
    if (inputBalance !== undefined && units > inputBalance) {
      return setTransactionStatus(action === "deposit"
        ? "The amount exceeds your USDG balance."
        : "The amount exceeds your Options Vault LP share balance.");
    }
    setTransactionModal({ phase: "pending", stepIndex: 0 });
    try {
      setTransactionStatus(undefined);
      const liveConfig = config ?? await floatApi.getPublicConfig();
      if (!liveConfig.optionsVaultAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      const hash = action === "deposit"
        ? await depositOptionsLiquidity({ provider, account: address, vault: liveConfig.optionsVaultAddress as `0x${string}`, usdg: liveConfig.usdgAddress as `0x${string}`, assets6: units, onStatus: (next) => setTransactionModal({ phase: "pending", stepIndex: next === "approval" ? 0 : next === "transaction" ? 1 : 2, explorerUrl: liveConfig.blockExplorerUrl }) })
        : await requestOptionsWithdrawal({ provider, account: address, vault: liveConfig.optionsVaultAddress as `0x${string}`, shares18: units, unlockAt: Math.floor(Date.now() / 1_000) + 7 * 86_400, onStatus: (next) => setTransactionModal({ phase: "pending", stepIndex: next === "transaction" ? 0 : 1, explorerUrl: liveConfig.blockExplorerUrl }) });
      setTransactionModal({ phase: "success", stepIndex: action === "deposit" ? 2 : 1, hash, explorerUrl: liveConfig.blockExplorerUrl });
    } catch (reason) {
      const message = action === "withdraw"
        ? describeOptionsVaultError(reason)
        : "The deposit was rejected or failed simulation. No state was changed by the app.";
      setTransactionStatus(message);
      setTransactionModal({ phase: "failed", stepIndex: 0, error: message });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([floatApi.getOptionsVaultState(controller.signal), floatApi.getPublicConfig(controller.signal)])
      .then(([nextState, nextConfig]) => { setState(nextState); setConfig(nextConfig); })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <Reveal className={`${embedded ? styles.embedded : "container"} ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">Liquidity provider vault</p>
          <h2>Fully reserved underwriting.</h2>
        </div>
        {state && <StatusChip tone={state.operationsPaused ? "outline" : "solid"}>{state.operationsPaused ? "Paused" : "Operational"}</StatusChip>}
      </div>

      {state === undefined && !error && <p role="status">Loading finalized vault accounting…</p>}
      {error && <p role="alert">Options vault accounting is temporarily unavailable.</p>}
      {state === null && !error && <p>The Options vault has not been activated on this network.</p>}
      {state && (
        <>
          <dl className={styles.metrics}>
            <Metric label="LP equity" value={formatUsdg6(state.totalAssets6)} />
            <Metric label="Reserved collateral" value={formatUsdg6(state.reservedCollateral6)} />
            <Metric label="Claimable liability" value={formatUsdg6(state.claimableCollateral6)} />
            <Metric label="Queued withdrawals" value={formatUsdg6(state.payableWithdrawalAssets6)} />
            <Metric label="Utilization" value={`${(state.utilizationBps / 100).toFixed(2)}%`} />
          </dl>
          <div className={styles.actions}>
            <select value={action} onChange={(event) => setAction(event.target.value as "deposit" | "withdraw")}>
              <option value="deposit">Deposit USDG</option>
              <option value="withdraw">Request withdrawal</option>
            </select>
            <label className={styles.amountField}>
              <span>{action === "deposit" ? "USDG amount" : "LP share amount"}</span>
              <input value={amount} inputMode="decimal" aria-label={action === "deposit" ? "USDG amount" : "LP share amount"} onChange={(event) => { setAmount(event.target.value); setTransactionStatus(undefined); }} />
            </label>
            <BalanceShortcuts balance={inputBalance} decimals={action === "deposit" ? 6 : 18} onSelect={setAmount} />
            <button type="button" className={action === "deposit" ? styles.depositAction : styles.withdrawAction} onClick={submit} disabled={state.operationsPaused}>{address ? "Review in wallet" : "Connect wallet"}</button>
            <p>Withdrawals use future-dated requests so option liabilities remain fully covered.</p>
            {transactionStatus && <p role="status">{transactionStatus}</p>}
          </div>
        </>
      )}
      <OnchainTransactionModal
        open={Boolean(transactionModal)}
        phase={transactionModal?.phase ?? "pending"}
        title={action === "deposit" ? "Deposit Options liquidity" : "Request LP withdrawal"}
        steps={action === "deposit" ? ["Approve exact USDG amount", "Confirm vault deposit", "Wait for onchain confirmation"] : ["Confirm withdrawal request", "Wait for onchain confirmation"]}
        stepIndex={transactionModal?.stepIndex ?? 0}
        hash={transactionModal?.hash}
        explorerUrl={transactionModal?.explorerUrl}
        error={transactionModal?.error}
        onClose={() => setTransactionModal(undefined)}
      />
    </Reveal>
  );
}

function parseAmount(value: string, decimals: number): bigint | undefined {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return undefined;
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals) return undefined;
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return result > 0n ? result : undefined;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd className="tabular">{value}</dd></div>;
}

function formatUsdg6(value: string): string {
  const amount = BigInt(value);
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${fraction} USDG`;
}
