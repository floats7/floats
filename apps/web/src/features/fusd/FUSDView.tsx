"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusChip } from "@/components/ui/StatusChip";
import { Icon } from "@/components/ui/Icon";
import { OnchainTransactionModal, type OnchainTransactionPhase } from "@/features/transactions/OnchainTransactionModal";
import { BalanceShortcuts } from "@/features/wallet/BalanceShortcuts";
import { useTokenBalance } from "@/features/wallet/useTokenBalance";
import { useWallet } from "@/features/wallet/WalletProvider";
import { floatApi, type FUSDActivityDto, type FUSDStateDto, type FUSDWalletDto, type PublicConfigDto } from "@/lib/api-client";
import { executeFusd, executeFusdWithdrawalAction, previewFusd } from "@/lib/fusd-transactions";
import { formatUnits, parseUnits } from "@/lib/units";
import styles from "./FUSDView.module.css";

type Action = "deposit" | "redeem" | "queue";
interface ViewState {
  readonly config?: PublicConfigDto;
  readonly vault?: FUSDStateDto;
  readonly activity: readonly FUSDActivityDto[];
  readonly loading: boolean;
  readonly error?: string;
}

const REFRESH_INTERVAL_MS = 15_000;

export function FUSDView() {
  const { address, chainId, provider, openConnect, switchChain } = useWallet();
  const [state, setState] = useState<ViewState>({ loading: true, activity: [] });
  const [wallet, setWallet] = useState<FUSDWalletDto | null>(null);
  const [recordsTab, setRecordsTab] = useState<"activity" | "withdrawals">("activity");
  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<bigint>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [transaction, setTransaction] = useState<{
    phase: OnchainTransactionPhase;
    stepIndex: number;
    hash?: string;
    error?: string;
    title?: string;
  }>();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [config, vault, activity] = await Promise.all([
        floatApi.getPublicConfig(signal),
        floatApi.getFusdState(signal),
        floatApi.getFusdActivity(50, signal).catch(() => []),
      ]);
      setState({ config, ...(vault ? { vault } : {}), activity, loading: false });
    } catch {
      setState((current) => ({ ...current, loading: false, error: "Live fUSD state is unavailable." }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialTimer = window.setTimeout(() => void load(controller.signal), 0);
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    void floatApi.getFusdWallet(address, controller.signal).then(setWallet).catch(() => setWallet(null));
    return () => controller.abort();
  }, [address]);

  const usdgBalance = useTokenBalance(state.config?.usdgAddress);
  const fusdBalance = useTokenBalance(state.config?.fusdVaultAddress);
  const inputBalance = action === "deposit" ? usdgBalance : fusdBalance;
  const inputDecimals = action === "deposit" ? 6 : 18;
  const inputSymbol = action === "deposit" ? "USDG" : "fUSD";
  const outputDecimals = action === "deposit" ? 18 : 6;
  const outputSymbol = action === "deposit" ? "fUSD" : "USDG";
  const wrongChain = Boolean(address && state.config && chainId !== state.config.chainId);
  const depositsDisabled = state.vault?.depositsPaused ?? true;

  const allocation = useMemo(() => {
    if (!state.vault) return { liquidBps: 0, strategyBps: 0 };
    const liquid = BigInt(state.vault.liquidAssets6);
    const strategy = BigInt(state.vault.strategyAssets6);
    const gross = liquid + strategy;
    if (gross === 0n) return { liquidBps: state.vault.targetBufferBps, strategyBps: 10_000 - state.vault.targetBufferBps };
    const liquidBps = Number(liquid * 10_000n / gross);
    return { liquidBps, strategyBps: 10_000 - liquidBps };
  }, [state.vault]);

  const resetQuote = (nextAction?: Action) => {
    if (nextAction) setAction(nextAction);
    setPreview(undefined);
    setMessage(undefined);
  };

  const review = async () => {
    if (!provider || !state.config?.fusdVaultAddress) return openConnect();
    const units = parseUnits(amount, inputDecimals);
    if (!units) return setMessage("Enter a positive valid amount.");
    setBusy(true);
    try {
      setPreview(await previewFusd({
        provider,
        vault: state.config.fusdVaultAddress as `0x${string}`,
        mode: action === "deposit" ? "deposit" : "redeem",
        amount: BigInt(units),
      }));
      setMessage(undefined);
    } catch {
      setMessage("The live onchain preview is unavailable for this amount.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!provider || !address || !state.config?.fusdVaultAddress || !preview) return;
    const units = parseUnits(amount, inputDecimals);
    if (!units) return;
    setBusy(true);
    setTransaction({ phase: "pending", stepIndex: action === "deposit" ? 0 : 1 });
    try {
      const hash = await executeFusd({
        provider,
        account: address as `0x${string}`,
        vault: state.config.fusdVaultAddress as `0x${string}`,
        usdg: state.config.usdgAddress as `0x${string}`,
        mode: action,
        amount: BigInt(units),
        onStep: (step) => setTransaction({
          phase: "pending",
          stepIndex: step === "approval" ? 0 : step === "transaction" ? 1 : 2,
        }),
      });
      setTransaction({ phase: "success", stepIndex: 2, hash });
      setAmount("");
      setPreview(undefined);
      await load();
    } catch {
      setTransaction({
        phase: "failed",
        stepIndex: 0,
        error: "The fUSD transaction was rejected or failed simulation. No state was changed by the app.",
      });
    } finally {
      setBusy(false);
    }
  };

  const submitWithdrawalAction = async (
    requestId: string,
    requestAction: "cancel" | "process" | "claim",
  ) => {
    if (!provider || !address || !state.config?.fusdVaultAddress) return openConnect();
    if (wrongChain) return switchChain(state.config.chainId);
    const title = requestAction === "cancel"
      ? "Cancel withdrawal"
      : requestAction === "process"
        ? "Process withdrawal"
        : "Claim withdrawal";
    setBusy(true);
    setTransaction({ phase: "pending", stepIndex: 1, title });
    try {
      const hash = await executeFusdWithdrawalAction({
        provider,
        account: address as `0x${string}`,
        vault: state.config.fusdVaultAddress as `0x${string}`,
        requestId: BigInt(requestId),
        action: requestAction,
        onStep: (step) => setTransaction({
          phase: "pending",
          stepIndex: step === "transaction" ? 1 : 2,
          title,
        }),
      });
      setTransaction({ phase: "success", stepIndex: 2, hash, title });
      await load();
      setWallet(await floatApi.getFusdWallet(address));
    } catch {
      setTransaction({
        phase: "failed",
        stepIndex: 1,
        title,
        error: "The withdrawal action was rejected or reverted. No completed state change was recorded by the app.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <main className={`container ${styles.shell}`}><p>Reading fUSD mainnet state…</p></main>;
  if (!state.config?.fusdVaultAddress || !state.vault) {
    return <main className={`container ${styles.shell}`}><p className={styles.unavailable}>fUSD is not configured on this environment.</p></main>;
  }

  const vault = state.vault;
  const explorerBase = state.config.blockExplorerUrl.replace(/\/$/, "");
  const contracts = [
    { label: "fUSD vault", address: state.config.fusdVaultAddress },
    { label: "Morpho strategy", address: state.config.fusdStrategyAddress },
    { label: "Rate oracle", address: state.config.fusdRateOracleAddress },
    { label: "fUSD to fIPO router", address: state.config.fusdToFipoRouterAddress },
    { label: "Steakhouse Morpho vault", address: vault.morphoVaultAddress },
  ].filter((contract): contract is { label: string; address: string } => Boolean(contract.address));
  return (
    <main className={`container ${styles.shell}`}>
      <section className={styles.overview}>
        <div className={styles.overviewHeading}>
          <div><p className="eyebrow">Mainnet vault</p><h2>fUSD</h2></div>
          <StatusChip tone={vault.depositsPaused ? "outline" : "solid"}>{vault.depositsPaused ? "Shadow release" : "Deposits active"}</StatusChip>
        </div>
        <dl className={styles.metrics}>
          <Metric label="Total assets" value={`${formatUnits(vault.totalAssets6, 6, 2)} USDG`} />
          <Metric label="Share price" value={vault.totalSupply18 === "0" ? "No active supply" : `$${formatUnits(vault.pricePerShare18, 18, 6)}`} />
          <Metric label="TVL cap" value={`${formatUnits(vault.tvlCap6, 6, 0)} USDG`} />
          <Metric label="Queued withdrawals" value={`${formatUnits(vault.queuedWithdrawalAssets6, 6, 2)} USDG`} />
        </dl>
        <div className={styles.allocation}>
          <div className={styles.allocationHeader}><h3>Capital allocation</h3><span>Block {vault.blockNumber}</span></div>
          <div className={styles.allocationBar} aria-label={`${allocation.liquidBps / 100}% liquid, ${allocation.strategyBps / 100}% strategy`}>
            <span style={{ width: `${allocation.liquidBps / 100}%` }} />
          </div>
          <dl className={styles.allocationFacts}>
            <div><dt>Liquid buffer</dt><dd>{formatUnits(vault.liquidAssets6, 6, 2)} USDG · {(allocation.liquidBps / 100).toFixed(2)}%</dd></div>
            <div><dt>Steakhouse Morpho</dt><dd>{formatUnits(vault.strategyAssets6, 6, 2)} USDG · {(allocation.strategyBps / 100).toFixed(2)}%</dd></div>
          </dl>
        </div>
        <div className={styles.capacity}>
          <div className={styles.allocationHeader}>
            <h3>Deposit capacity</h3>
            <StatusChip tone={vault.capacityReady ? "solid" : "outline"}>{vault.capacityReady ? "Canary ready" : "Capacity gated"}</StatusChip>
          </div>
          <dl className={styles.capacityFacts}>
            <div><dt>External capacity</dt><dd>{formatUnits(vault.externalCapacity6, 6, 6)} USDG</dd></div>
            <div><dt>Required for current cap</dt><dd>{formatUnits(vault.requiredExternalCapacity6, 6, 6)} USDG</dd></div>
            <div><dt>Public deposits</dt><dd>{vault.depositsPaused ? "Paused by governance" : "Active"}</dd></div>
          </dl>
          <p>
            {vault.requiredExternalCapacity6 === "0"
              ? "The current governed beta keeps all USDG liquid, so no external strategy capacity is required."
              : "Capacity is read directly from the configured Morpho vault. Public deposits remain unavailable until external capacity covers the current fUSD allocation and a governed canary succeeds."}
          </p>
        </div>
        <div className={styles.contracts}>
          <div className={styles.allocationHeader}><h3>Verified contracts</h3><span>Mainnet</span></div>
          <ul>
            {contracts.map((contract) => (
              <li key={contract.address}>
                <span>{contract.label}</span>
                <a href={`${explorerBase}/address/${contract.address}`} target="_blank" rel="noreferrer">
                  <code>{contract.address}</code><Icon name="external-link" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className={styles.transactionPanel}>
        <p className="eyebrow">Transaction panel</p>
        <h2>Deposit or withdraw</h2>
        <div className={styles.tabs} role="tablist" aria-label="fUSD action">
          {(["deposit", "redeem", "queue"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={action === item} onClick={() => resetQuote(item)}>
              {item === "deposit" ? "Deposit" : item === "redeem" ? "Redeem" : "Queue"}
            </button>
          ))}
        </div>
        {action === "deposit" && depositsDisabled ? (
          <div className={styles.pauseNotice}><Icon name="info" /><p>{vault.capacityReady ? "External capacity is available, but deposits remain paused until the governed canary succeeds." : `External capacity is ${formatUnits(vault.externalCapacity6, 6, 6)} USDG. Deposits remain paused until it covers the required allocation.`} Withdrawals remain available.</p></div>
        ) : null}
        <label className={styles.amountField}>
          <span>Amount in {inputSymbol}</span>
          <input value={amount} inputMode="decimal" placeholder="0.00" onChange={(event) => { setAmount(event.target.value); setPreview(undefined); }} />
        </label>
        <BalanceShortcuts balance={inputBalance} decimals={inputDecimals} onSelect={(value) => { setAmount(value); setPreview(undefined); }} />
        <dl className={styles.quote}>
          <div><dt>Expected output</dt><dd>{preview === undefined ? "Review onchain" : `${formatUnits(preview, outputDecimals, 6)} ${outputSymbol}`}</dd></div>
          <div><dt>Custody</dt><dd>Non-custodial</dd></div>
        </dl>
        {message ? <p className={styles.message} role="status">{message}</p> : null}
        <button
          className={styles.primaryAction}
          type="button"
          disabled={busy || (action === "deposit" && depositsDisabled)}
          onClick={() => void (!address ? openConnect() : wrongChain ? switchChain(state.config!.chainId) : preview ? submit() : review())}
        >
          {action === "deposit" && depositsDisabled ? "Deposits paused" : !address ? "Connect wallet" : wrongChain ? "Switch to Robinhood Chain" : busy ? "Reading onchain state" : preview ? action === "deposit" ? "Deposit USDG" : action === "redeem" ? "Redeem fUSD" : "Request withdrawal" : "Review onchain"}
        </button>
      </aside>

      <section className={styles.yield}>
        <p className="eyebrow">Yield composition</p>
        <h2>No blended headline rate.</h2>
        <div className={styles.yieldGrid}>
          <YieldItem title="Native strategy APY" value="Awaiting verified live source" body="Yield generated by the approved Steakhouse USDG Morpho vault. The UI does not infer an APY from short-term share-price movement." />
          <YieldItem title="External incentives" value="Not included" body="Robinhood or third-party rewards are shown only after contract eligibility is independently confirmed." />
          <YieldItem title="Net APY" value="Not published" body={`Net APY will deduct the ${(vault.performanceFeeBps / 100).toFixed(2)}% performance fee from verified realized strategy yield.`} />
        </div>
      </section>

      <section className={styles.risk}>
        <p className="eyebrow">Risk and controls</p>
        <h2>Withdrawal liquidity is designed, not assumed.</h2>
        <div className={styles.riskGrid}>
          <p>Target liquid buffer: {(vault.targetBufferBps / 100).toFixed(2)}% of managed assets.</p>
          <p>Excess USDG is allocated only while the configured strategy remains active.</p>
          <p>Queued liabilities are reserved before idle assets can be reinvested.</p>
          <p>Guardian emergency exit pauses deposits and disables reinvestment before recovering strategy assets.</p>
        </div>
        <div className={styles.riskTableWrap}>
          <table className={styles.riskTable}>
            <thead><tr><th>Risk</th><th>Current exposure</th><th>Protocol control</th><th>Withdrawal effect</th></tr></thead>
            <tbody>
              <RiskRow
                risk="Liquidity"
                exposure={`${(allocation.strategyBps / 100).toFixed(2)}% allocated to strategy`}
                control={`${(vault.targetBufferBps / 100).toFixed(2)}% target buffer and an onchain withdrawal queue`}
                effect="Instant redemption depends on available USDG; excess requests can wait in the queue."
              />
              <RiskRow
                risk="Strategy"
                exposure={`${formatUnits(vault.strategyAssets6, 6, 2)} USDG in the approved Morpho vault`}
                control="One immutable adapter, share-price checks, a TVL cap, and guardian emergency exit"
                effect="A strategy impairment can reduce the USDG recoverable per fUSD share."
              />
              <RiskRow
                risk="USDG"
                exposure={`${formatUnits(vault.totalAssets6, 6, 2)} USDG-denominated assets`}
                control="The vault accepts only the configured canonical USDG contract"
                effect="Issuer, redemption, or peg impairment is not absorbed by Floats."
              />
              <RiskRow
                risk="Smart contracts"
                exposure="fUSD vault, strategy adapter, USDG, Morpho, and underlying lending markets"
                control="Paused launch, bounded cap, timelocked governance, and public contract evidence"
                effect="A contract failure can delay withdrawals or cause partial loss."
              />
              <RiskRow
                risk="Variable yield"
                exposure="Borrow-market yield; external incentives are excluded"
                control="No fixed APY promise and performance fees apply only to realized gains"
                effect="Yield can fall to zero and does not guarantee USDG principal growth."
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.records}>
        <div className={styles.recordsHeader}>
          <div><p className="eyebrow">Onchain records</p><h2>Activity and withdrawal queue</h2></div>
          <div className={styles.recordTabs} role="tablist" aria-label="fUSD records">
            <button type="button" role="tab" aria-selected={recordsTab === "activity"} onClick={() => setRecordsTab("activity")}>Public activity</button>
            <button type="button" role="tab" aria-selected={recordsTab === "withdrawals"} onClick={() => setRecordsTab("withdrawals")}>My withdrawals</button>
          </div>
        </div>
        {recordsTab === "activity" ? (
          state.activity.length ? <div className={styles.tableWrap}><table><thead><tr><th>Action</th><th>Wallet</th><th>Assets</th><th>Block</th><th>Transaction</th></tr></thead><tbody>{state.activity.map((item) => <tr key={`${item.transactionHash}:${item.eventName}`}><td>{item.eventName}</td><td><code>{shortAddress(item.walletAddress ?? item.receiverAddress)}</code></td><td>{item.assets6 ? `${formatUnits(item.assets6, 6, 4)} USDG` : "—"}</td><td>{item.blockNumber}</td><td><a href={`${explorerBase}/tx/${item.transactionHash}`} target="_blank" rel="noreferrer"><Icon name="external-link" />View</a></td></tr>)}</tbody></table></div>
          : <p className={styles.emptyRecord}>No indexed fUSD activity yet.</p>
        ) : !address ? <p className={styles.emptyRecord}>Connect a wallet to view its withdrawal requests.</p>
          : wallet?.withdrawals.length ? <div className={styles.tableWrap}><table><thead><tr><th>Request</th><th>Shares</th><th>Assets</th><th>State</th><th>Updated</th><th>Action</th></tr></thead><tbody>{wallet.withdrawals.map((item) => <tr key={item.requestId}><td>#{item.requestId}</td><td>{formatUnits(item.shares18, 18, 6)} fUSD</td><td>{item.assets6 ? `${formatUnits(item.assets6, 6, 4)} USDG` : "Pending"}</td><td>{item.state}</td><td>{new Date(item.updatedAt).toLocaleString()}</td><td><div className={styles.requestActions}>{item.state === "FUSDWithdrawalRequested" ? <><button type="button" disabled={busy} onClick={() => void submitWithdrawalAction(item.requestId, "cancel")}>Cancel</button><button type="button" disabled={busy} onClick={() => void submitWithdrawalAction(item.requestId, "process")}>Process</button></> : item.state === "FUSDWithdrawalProcessed" ? <button type="button" disabled={busy} onClick={() => void submitWithdrawalAction(item.requestId, "claim")}>Claim</button> : <span>Complete</span>}</div></td></tr>)}</tbody></table></div>
          : <p className={styles.emptyRecord}>This wallet has no indexed fUSD withdrawal requests.</p>}
      </section>

      <OnchainTransactionModal
        open={Boolean(transaction)}
        phase={transaction?.phase ?? "pending"}
        title={transaction?.title ?? (action === "deposit" ? "Deposit USDG" : action === "redeem" ? "Redeem fUSD" : "Request withdrawal")}
        steps={["Approve exact amount", "Confirm in wallet", "Wait for onchain confirmation"]}
        stepIndex={transaction?.stepIndex ?? 0}
        hash={transaction?.hash}
        explorerUrl={state.config.blockExplorerUrl}
        error={transaction?.error}
        onClose={() => setTransaction(undefined)}
      />
    </main>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd className="tabular">{value}</dd></div>;
}

function YieldItem({ title, value, body }: { readonly title: string; readonly value: string; readonly body: string }) {
  return <article><h3>{title}</h3><strong>{value}</strong><p>{body}</p></article>;
}

function RiskRow({ risk, exposure, control, effect }: {
  readonly risk: string;
  readonly exposure: string;
  readonly control: string;
  readonly effect: string;
}) {
  return <tr><th scope="row">{risk}</th><td>{exposure}</td><td>{control}</td><td>{effect}</td></tr>;
}

function shortAddress(value: string | null): string {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Protocol";
}
