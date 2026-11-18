"use client";

import { useEffect, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import { floatApi, type OptionsVaultStateDto } from "@/lib/api-client";
import styles from "./OptionsVaultPanel.module.css";
import { useWallet } from "@/features/wallet/WalletProvider";
import { depositOptionsLiquidity, requestOptionsWithdrawal } from "@/lib/options-transactions";

export function OptionsVaultPanel() {
  const { address, provider, openConnect } = useWallet();
  const [state, setState] = useState<OptionsVaultStateDto | null>();
  const [error, setError] = useState(false);
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [transactionStatus, setTransactionStatus] = useState<string>();

  const submit = async () => {
    if (!address || !provider) return openConnect();
    const units = parseAmount(amount, action === "deposit" ? 6 : 18);
    if (!units) return setTransactionStatus("Enter a positive valid amount.");
    try {
      setTransactionStatus("Confirm the transaction in your wallet.");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsVaultAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      const hash = action === "deposit"
        ? await depositOptionsLiquidity({ provider, account: address, vault: config.optionsVaultAddress as `0x${string}`, usdg: config.usdgAddress as `0x${string}`, assets6: units })
        : await requestOptionsWithdrawal({ provider, account: address, vault: config.optionsVaultAddress as `0x${string}`, shares18: units, unlockAt: Math.floor(Date.now() / 1_000) + 7 * 86_400 });
      setTransactionStatus(`Confirmed ${hash.slice(0, 10)}…${hash.slice(-6)}`);
    } catch {
      setTransactionStatus("Transaction was rejected or failed simulation.");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    floatApi.getOptionsVaultState(controller.signal)
      .then(setState)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <Reveal className={`container ${styles.panel}`}>
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
            <input value={amount} inputMode="decimal" aria-label={action === "deposit" ? "USDG amount" : "LP share amount"} onChange={(event) => setAmount(event.target.value)} />
            <button type="button" onClick={submit} disabled={state.operationsPaused}>{address ? "Review in wallet" : "Connect wallet"}</button>
            <p>Withdrawals use future-dated requests so option liabilities remain fully covered.</p>
            {transactionStatus && <p role="status">{transactionStatus}</p>}
          </div>
        </>
      )}
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
