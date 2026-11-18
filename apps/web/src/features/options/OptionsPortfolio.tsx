"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi, type OptionsPortfolioDto } from "@/lib/api-client";
import { usePortfolio } from "@/features/portfolio/PortfolioProvider";
import { formatUnits } from "@/lib/units";
import styles from "./OptionsPortfolio.module.css";
import { cancelOptionsWithdrawal, claimOptionsPosition, claimOptionsWithdrawal } from "@/lib/options-transactions";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import { Tabs } from "@/components/ui/Tabs";

const PORTFOLIO_TABS = ["positions", "withdrawals"] as const;
type PortfolioTab = typeof PORTFOLIO_TABS[number];

interface PortfolioTransactionState {
  readonly phase: OnchainTransactionPhase;
  readonly title: string;
  readonly stepIndex: number;
  readonly hash?: string;
  readonly explorerUrl?: string;
  readonly error?: string;
}

export function OptionsPortfolio({ embedded = false }: { readonly embedded?: boolean }) {
  const { address, provider, openConnect } = useWallet();
  const { notify } = useToast();
  const { walletData, walletDataStatus, verifyWalletData } = usePortfolio();
  const portfolio = walletData?.optionsPortfolio;
  const [transaction, setTransaction] = useState<PortfolioTransactionState>();
  const [activeTab, setActiveTab] = useState<PortfolioTab>("positions");

  const authorize = async () => {
    try {
      await verifyWalletData();
    } catch {
      notify("Wallet data verification failed", "error");
    }
  };

  return (
    <Reveal className={`${embedded ? styles.embedded : "container"} ${styles.section}`}>
      <div className={styles.heading}>
        <p className="eyebrow">Wallet portfolio</p>
        <h2>Your option positions.</h2>
      </div>
      {!address ? (
        <EmptyState
          title="Connect a wallet to continue"
          description="Positions and withdrawal requests are returned only after wallet ownership is proven."
          action={<Button onClick={openConnect}>Connect wallet</Button>}
        />
      ) : portfolio === undefined ? (
        <EmptyState
          title="Verify wallet data"
          description="Your wallet is connected. One read-only signature unlocks private history and positions for this wallet session."
          action={<Button onClick={authorize} loading={walletDataStatus === "loading"}>Verify wallet data</Button>}
        />
      ) : (
        <div className={styles.tableCard}>
          <Tabs
            fullWidth
            label="Option portfolio records"
            options={PORTFOLIO_TABS}
            value={activeTab}
            onChange={setActiveTab}
            optionLabel={(tab) => tab === "positions"
              ? `Open positions · ${portfolio.positions.length}`
              : `LP withdrawals · ${portfolio.withdrawals.length}`}
          />
          {activeTab === "positions"
            ? <PortfolioTable portfolio={portfolio} provider={provider} account={address} notify={notify} setTransaction={setTransaction} />
            : <WithdrawalTable portfolio={portfolio} provider={provider} account={address} notify={notify} setTransaction={setTransaction} />}
        </div>
      )}
      <OnchainTransactionModal open={Boolean(transaction)} phase={transaction?.phase ?? "pending"} title={transaction?.title ?? "Portfolio transaction"} steps={["Confirm transaction in wallet", "Wait for onchain confirmation"]} stepIndex={transaction?.stepIndex ?? 0} hash={transaction?.hash} explorerUrl={transaction?.explorerUrl} error={transaction?.error} onClose={() => setTransaction(undefined)} />
    </Reveal>
  );
}

function PortfolioTable({ portfolio, provider, account, notify, setTransaction }: {
  portfolio: OptionsPortfolioDto;
  provider: ReturnType<typeof useWallet>["provider"];
  account: string;
  notify: (message: string, tone?: "success" | "error") => void;
  setTransaction: (state: PortfolioTransactionState) => void;
}) {
  const claim = async (seriesId: string, size18: string) => {
    setTransaction({ phase: "pending", title: "Claim option position", stepIndex: 0 });
    try {
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsMarketAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      const hash = await claimOptionsPosition({ provider, account, market: config.optionsMarketAddress as `0x${string}`, seriesId: seriesId as `0x${string}`, size18: BigInt(size18), onStatus: (next) => setTransaction({ phase: "pending", title: "Claim option position", stepIndex: next === "transaction" ? 0 : 1, explorerUrl: config.blockExplorerUrl }) });
      setTransaction({ phase: "success", title: "Claim option position", stepIndex: 1, hash, explorerUrl: config.blockExplorerUrl });
      notify("Option claim confirmed", "success");
    } catch {
      setTransaction({ phase: "failed", title: "Claim option position", stepIndex: 0, error: "The option claim is not available or failed simulation." });
      notify("Claim is not available or failed simulation", "error");
    }
  };
  return (
    <div className={styles.tabPanel} role="tabpanel" aria-label="Open option positions">
      {portfolio.positions.length === 0 ? <p>No open option positions.</p> : (
        <div className={styles.scroller} role="region" aria-label="Open option positions" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Series</th><th scope="col">Size</th><th scope="col">Net cash flow</th><th scope="col">Action</th></tr></thead>
            <tbody>{portfolio.positions.map((position) => (
              <tr key={position.seriesId}>
                <td className="tabular">{shortId(position.seriesId)}</td>
                <td className="tabular">{formatUnits(position.size18, 18, 4)} {position.underlyingSymbol ?? shortId(position.underlying)}</td>
                <td className="tabular">{formatSignedUsdg(position.netCashFlow6)}</td>
                <td><Button onClick={() => claim(position.seriesId, position.size18)}>Claim if settled</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WithdrawalTable({ portfolio, provider, account, notify, setTransaction }: {
  portfolio: OptionsPortfolioDto;
  provider: ReturnType<typeof useWallet>["provider"];
  account: string;
  notify: (message: string, tone?: "success" | "error") => void;
  setTransaction: (state: PortfolioTransactionState) => void;
}) {
  const claim = async (requestId: string) => {
    setTransaction({ phase: "pending", title: "Claim LP withdrawal", stepIndex: 0 });
    try {
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsVaultAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      const hash = await claimOptionsWithdrawal({ provider, account, vault: config.optionsVaultAddress as `0x${string}`, requestId: BigInt(requestId), onStatus: (next) => setTransaction({ phase: "pending", title: "Claim LP withdrawal", stepIndex: next === "transaction" ? 0 : 1, explorerUrl: config.blockExplorerUrl }) });
      setTransaction({ phase: "success", title: "Claim LP withdrawal", stepIndex: 1, hash, explorerUrl: config.blockExplorerUrl });
      notify("Withdrawal claim confirmed", "success");
    } catch {
      setTransaction({ phase: "failed", title: "Claim LP withdrawal", stepIndex: 0, error: "The withdrawal is not claimable or failed simulation." });
      notify("Withdrawal is not claimable or failed simulation", "error");
    }
  };
  const cancel = async (requestId: string) => {
    setTransaction({ phase: "pending", title: "Cancel LP withdrawal", stepIndex: 0 });
    try {
      if (!provider) throw new Error("WALLET_PROVIDER_MISSING");
      const config = await floatApi.getPublicConfig();
      if (!config.optionsVaultAddress) throw new Error("OPTIONS_NOT_ACTIVE");
      const hash = await cancelOptionsWithdrawal({ provider, account, vault: config.optionsVaultAddress as `0x${string}`, requestId: BigInt(requestId), onStatus: (next) => setTransaction({ phase: "pending", title: "Cancel LP withdrawal", stepIndex: next === "transaction" ? 0 : 1, explorerUrl: config.blockExplorerUrl }) });
      setTransaction({ phase: "success", title: "Cancel LP withdrawal", stepIndex: 1, hash, explorerUrl: config.blockExplorerUrl });
      notify("Withdrawal request cancelled", "success");
    } catch {
      setTransaction({ phase: "failed", title: "Cancel LP withdrawal", stepIndex: 0, error: "The withdrawal cancellation failed simulation." });
      notify("Withdrawal cancellation failed simulation", "error");
    }
  };
  return (
    <div className={styles.tabPanel} role="tabpanel" aria-label="LP withdrawals">
      {portfolio.withdrawals.length === 0 ? <p>No withdrawal requests.</p> : (
        <div className={styles.scroller} role="region" aria-label="LP withdrawal requests" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Request</th><th scope="col">State</th><th scope="col">Shares</th><th scope="col">Action</th></tr></thead>
            <tbody>{portfolio.withdrawals.map((withdrawal) => (
              <tr key={withdrawal.requestId}>
                <td className="tabular">{withdrawal.requestId}</td>
                <td>{withdrawal.state.replace(/^Withdrawal/, "")}</td>
                <td className="tabular">{formatUnits(withdrawal.shares, 18, 4)}</td>
                <td>
                  {withdrawal.state === "WithdrawalFinalized" && <Button onClick={() => claim(withdrawal.requestId)}>Claim</Button>}
                  {withdrawal.state === "WithdrawalRequested" && <Button onClick={() => cancel(withdrawal.requestId)}>Cancel</Button>}
                  {withdrawal.state !== "WithdrawalFinalized" && withdrawal.state !== "WithdrawalRequested" && "Complete"}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatSignedUsdg(value: string): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "+";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${formatUnits(absolute.toString(), 6, 2)} USDG`;
}
