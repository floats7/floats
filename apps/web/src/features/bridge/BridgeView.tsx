"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits, type Address, type Hex } from "viem";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  floatApi,
  type CrossChainMessageDto,
  type CrossChainNavDto,
  type PublicConfigDto,
} from "@/lib/api-client";
import { executeBridge, quoteBridge, type BridgeQuote } from "@/lib/bridge-transactions";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useCrossChainBalances } from "./useCrossChainBalances";
import styles from "./BridgeView.module.css";

interface BridgeState {
  readonly config: PublicConfigDto | null;
  readonly messages: readonly CrossChainMessageDto[];
  readonly nav: CrossChainNavDto | null;
  readonly loading: boolean;
  readonly failed: boolean;
}

const INITIAL_STATE: BridgeState = {
  config: null,
  messages: [],
  nav: null,
  loading: true,
  failed: false,
};
const EMPTY_ROUTES: PublicConfigDto["crossChainRoutes"] = [];
const REFRESH_INTERVAL_MS = 15_000;

export function BridgeView() {
  const { address, chainId, provider, openConnect, switchChain } = useWallet();
  const [state, setState] = useState<BridgeState>(INITIAL_STATE);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [transactionState, setTransactionState] = useState<"idle" | "quoting" | "ready" | "submitting" | "success" | "error">("idle");
  const [transactionMessage, setTransactionMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [config, messages, nav] = await Promise.all([
          floatApi.getPublicConfig(controller.signal),
          floatApi.getBridgeMessages(50, controller.signal),
          floatApi.getBridgeNav(undefined, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setState({ config, messages, nav, loading: false, failed: false });
          setSelectedRouteId((current) => current ?? config.crossChainRoutes[0]?.id ?? null);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState((current) => ({ ...current, loading: false, failed: true }));
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const route = state.config?.crossChainRoutes.find((candidate) => candidate.id === selectedRouteId)
    ?? state.config?.crossChainRoutes[0];
  const routeActive = Boolean(route);
  const routeBalances = useCrossChainBalances(state.config?.crossChainRoutes ?? EMPTY_ROUTES);
  const balance = route ? routeBalances.get(route.id) : undefined;
  const wrongSourceChain = Boolean(route && address && chainId !== route.sourceChainId);
  const reverseRoute = route && state.config?.crossChainRoutes.find((candidate) =>
    candidate.tokenSymbol === route.tokenSymbol
    && candidate.sourceEid === route.destinationEid
    && candidate.destinationEid === route.sourceEid
  );
  const navIsStale = Boolean(
    route
    && state.nav
    && Date.now() - new Date(state.nav.observedAt).getTime() > route.maximumNavAgeSeconds * 1_000,
  );
  const networkLabel = useMemo(
    () => route
      ? `${route.sourceNetworkName} (${route.sourceChainId}) / ${route.destinationNetworkName} (${route.destinationChainId})`
      : "Awaiting verified Zero coordinates",
    [route],
  );

  const resetQuote = () => {
    setQuote(null);
    setTransactionHash(null);
    setTransactionState("idle");
    setTransactionMessage(null);
  };

  const requestQuote = async () => {
    if (!route || !provider || !address) return openConnect();
    setTransactionState("quoting");
    setTransactionMessage(null);
    try {
      setQuote(await quoteBridge({ provider, account: address as Address, route, amount }));
      setTransactionState("ready");
    } catch (error) {
      setQuote(null);
      setTransactionState("error");
      setTransactionMessage(bridgeError(error));
    }
  };

  const submit = async () => {
    if (!route || !provider || !address || !quote) return;
    setTransactionState("submitting");
    setTransactionMessage("Confirm the transaction in your wallet.");
    try {
      const hash = await executeBridge({
        provider,
        account: address as Address,
        route,
        quote,
        onStep: (step) => setTransactionMessage(stepLabel(step.type)),
      });
      setTransactionHash(hash);
      setTransactionState("success");
      setTransactionMessage("Source transaction confirmed. Destination delivery is now tracked by message GUID.");
    } catch (error) {
      setTransactionState("error");
      setTransactionMessage(bridgeError(error));
    }
  };

  return (
    <main className={`container ${styles.layout}`}>
      <section className={styles.routeCard} aria-labelledby="bridge-route-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">Route status</p>
            <h2 id="bridge-route-heading">Robinhood Chain / Zero</h2>
          </div>
          <StatusChip tone={routeActive ? "solid" : "outline"}>
            {routeActive ? "Route active" : "Activation pending"}
          </StatusChip>
        </div>
        <dl className={styles.routeFacts}>
          <div><dt>Network IDs</dt><dd>{networkLabel}</dd></div>
          <div><dt>Assets</dt><dd>{route?.tokenSymbol ?? "fIPO and FLOATS pending"}</dd></div>
          <div><dt>Custody</dt><dd>Canonical assets remain backed on Robinhood Chain</dd></div>
        </dl>
        {route ? (
          <div className={styles.routeControls}>
            <label>
              <span>Asset route</span>
              <select value={route.id} onChange={(event) => { setSelectedRouteId(event.target.value); resetQuote(); }}>
                {state.config?.crossChainRoutes.map((candidate) => (
                  <option value={candidate.id} key={candidate.id}>
                    {candidate.tokenSymbol}: {candidate.sourceNetworkName} to {candidate.destinationNetworkName}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.networkSwitch} role="group" aria-label="Bridge direction">
              <button type="button" aria-pressed="true">
                {route.sourceNetworkName}<span>Source</span>
              </button>
              <button
                type="button"
                aria-pressed="false"
                disabled={!reverseRoute}
                onClick={() => { if (reverseRoute) { setSelectedRouteId(reverseRoute.id); resetQuote(); } }}
              >
                {route.destinationNetworkName}<span>{reverseRoute ? "Switch direction" : "Return route pending"}</span>
              </button>
            </div>
          </div>
        ) : null}
        <div className={styles.notice} role="status">
          <Icon name="info" />
          <p>{routeActive
            ? "This route is configured. Connect a wallet on the required source network to continue."
            : "Sending is intentionally disabled. Floats will not fall back to an unverified bridge or placeholder contract."}</p>
        </div>
        {route ? (
          <div className={styles.tradeForm}>
            <label>
              <span>Amount in {route.tokenSymbol}{balance !== undefined && !wrongSourceChain ? ` · Balance ${formatUnits(balance, route.tokenDecimals)}` : ""}</span>
              <input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); resetQuote(); }} placeholder="0.00" disabled={transactionState === "submitting"} />
            </label>
            {balance !== undefined && !wrongSourceChain ? (
              <div className={styles.shortcuts} aria-label="Amount shortcuts">
                {[25, 50, 100].map((percentage) => (
                  <button type="button" key={percentage} onClick={() => { setAmount(formatUnits(balance * BigInt(percentage) / 100n, route.tokenDecimals)); resetQuote(); }}>{percentage}%</button>
                ))}
              </div>
            ) : null}
            <dl className={styles.quoteFacts}>
              <div><dt>Expected minimum</dt><dd>{quote ? `${formatUnits(quote.minimumReceivedLocal, route.tokenDecimals)} ${route.tokenSymbol}` : "Request a quote"}</dd></div>
              <div><dt>Native fee</dt><dd>{quote ? `${formatUnits(quote.nativeFee, 18)} native` : "Request a quote"}</dd></div>
              <div><dt>Approval</dt><dd>{quote ? (quote.approvalRequired ? "Required" : "Not required") : (route.sourceRequiresApproval ? "Checked with quote" : "Not required")}</dd></div>
            </dl>
            {transactionMessage ? <p className={styles.transactionMessage} role="status">{transactionMessage}</p> : null}
            {transactionHash ? (
              <a className={styles.receiptLink} href={`${route.sourceExplorerUrl.replace(/\/$/, "")}/tx/${transactionHash}`} target="_blank" rel="noreferrer">View source transaction <Icon name="external-link" /></a>
            ) : null}
            <button className={styles.primaryAction} type="button" disabled={transactionState === "quoting" || transactionState === "submitting" || transactionState === "success"} onClick={() => void (wrongSourceChain ? switchChain(route.sourceChainId).catch((error) => setTransactionMessage(bridgeError(error))) : quote ? submit() : requestQuote())}>
              {!address ? "Connect wallet" : wrongSourceChain ? `Switch to ${route.sourceNetworkName}` : transactionState === "quoting" ? "Requesting quote" : transactionState === "submitting" ? "Transaction pending" : transactionState === "success" ? "Source confirmed" : quote ? "Send with this quote" : "Request live quote"}
            </button>
          </div>
        ) : <button className={styles.primaryAction} type="button" disabled>Bridge not active</button>}
        <Link className={styles.canonicalAction} href="/markets/index">
          Mint fIPO on Robinhood Chain <Icon name="arrow-right" />
        </Link>
      </section>

      <section className={styles.navCard} aria-labelledby="mirrored-nav-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">Mirrored state</p>
            <h2 id="mirrored-nav-heading">Latest NAV</h2>
          </div>
          <StatusChip tone={state.nav?.state === "mirrored" && !navIsStale ? "solid" : "outline"}>
            {navIsStale ? "Stale" : state.nav?.state ?? "Unavailable"}
          </StatusChip>
        </div>
        {state.nav ? (
          <dl className={styles.navFacts}>
            <div><dt>NAV</dt><dd>{format18(state.nav.nav18)}</dd></div>
            <div><dt>Sequence</dt><dd>{state.nav.sequence}</dd></div>
            <div><dt>Observed</dt><dd>{formatTime(state.nav.observedAt)}</dd></div>
          </dl>
        ) : (
          <p className={styles.emptyCopy}>{state.loading ? "Loading mirrored state…" : "No canonical NAV mirror has been observed."}</p>
        )}
        <p className={styles.disclaimer}>
          fIPO on Zero is an OFT representation of canonical fIPO locked by the adapter on Robinhood Chain.
        </p>
        {routeBalances.size > 0 ? (
          <div className={styles.walletBalances}>
            <p className="eyebrow">Wallet balances</p>
            <dl>{state.config?.crossChainRoutes.filter((candidate) => routeBalances.has(candidate.id)).map((candidate) => (
              <div key={candidate.id}>
                <dt>{candidate.tokenSymbol} on {candidate.sourceNetworkName}</dt>
                <dd>{formatUnits(routeBalances.get(candidate.id) ?? 0n, candidate.tokenDecimals)}</dd>
              </div>
            ))}</dl>
          </div>
        ) : null}
      </section>

      <section className={styles.history} aria-labelledby="bridge-history-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">Public activity</p>
            <h2 id="bridge-history-heading">Bridge messages</h2>
          </div>
          <span className={styles.count}>{state.messages.length} records</span>
        </div>
        {state.failed ? <p className={styles.emptyCopy}>Bridge read models are temporarily unavailable.</p> : null}
        {!state.failed && !state.loading && state.messages.length === 0 ? (
          <p className={styles.emptyCopy}>No canonical cross-chain messages have been indexed.</p>
        ) : null}
        {state.messages.length > 0 ? (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Message</th><th>Route</th><th>Amount</th><th>State</th><th>Updated</th></tr></thead>
              <tbody>{state.messages.map((message) => {
                const messageScanUrl = scanUrl(state.config, message);
                return (
                <tr key={`${message.sourceEid}:${message.guid}`}>
                  <td>{messageScanUrl ? (
                    <a className={styles.messageLink} href={messageScanUrl} target="_blank" rel="noreferrer">
                      <code>{compact(message.guid)}</code><Icon name="external-link" />
                    </a>
                  ) : <code>{compact(message.guid)}</code>}</td>
                  <td>{message.sourceChainId} / {message.destinationChainId}</td>
                  <td><code>{message.amountLocal}</code></td>
                  <td><StatusChip tone={message.state === "delivered" ? "solid" : "outline"}>{message.state}</StatusChip></td>
                  <td>{formatTime(message.updatedAt)}</td>
                </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function compact(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function format18(value: string): string {
  const padded = value.padStart(19, "0");
  const whole = padded.slice(0, -18);
  const fraction = padded.slice(-18).slice(0, 4).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function scanUrl(
  config: PublicConfigDto | null,
  message: CrossChainMessageDto,
): string | null {
  const route = config?.crossChainRoutes.find((candidate) =>
    candidate.sourceEid === message.sourceEid
    && candidate.destinationEid === message.destinationEid
  );
  if (!route) return null;
  const base = route.layerZeroScanUrl.replace(/\/$/, "");
  return `${base}/tx/${message.guid}`;
}

function bridgeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "BRIDGE_UNKNOWN_ERROR";
  if (message.includes("WRONG_SOURCE_CHAIN")) return "Switch your wallet to the configured source network and try again.";
  if (message.includes("AMOUNT")) return "Enter a valid positive amount within the token decimal limit.";
  if (message.includes("TIMEOUT")) return "The wallet transaction is still pending. Check the source explorer before retrying.";
  if (message.includes("REVERTED")) return "The transaction reverted. No successful bridge send was recorded.";
  if (message.includes("rejected") || message.includes("4001")) return "The wallet request was rejected. No transaction was submitted.";
  return "The live quote or transaction could not be completed. No fallback route was used.";
}

function stepLabel(type: "approval-submitted" | "approval-confirmed" | "send-submitted" | "send-confirmed"): string {
  if (type === "approval-submitted") return "Token approval submitted.";
  if (type === "approval-confirmed") return "Token approval confirmed. Submit the bridge transaction.";
  if (type === "send-submitted") return "Bridge transaction submitted.";
  return "Source bridge transaction confirmed.";
}
