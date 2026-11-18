"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";
import { useIndexState } from "@/features/index-state/IndexStateProvider";
import { usePortfolio } from "@/features/portfolio/PortfolioProvider";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useOracleStatus } from "@/hooks/useOracleStatus";
import { useFeeRates } from "@/hooks/useFeeRates";
import { formatNumber, formatUsd } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { parseAmount, type Direction, type TradeMode } from "@/lib/quote";
import { maxAmount, validateTrade, type TradeRequest } from "@/lib/trade";
import { parseUnits, unitsToNumber } from "@/lib/units";
import { CashPreview, InKindPreview } from "./QuotePreview";
import { TradeModal } from "./TradeModal";
import { useTradeFlow } from "./useTradeFlow";
import { useCashQuote } from "./useCashQuote";
import styles from "./TradePanel.module.css";

const DIRECTIONS: readonly Direction[] = ["Mint", "Redeem"];
const MODES: readonly TradeMode[] = ["Cash", "In-kind"];

const inputLabel = (direction: Direction, mode: TradeMode) =>
  direction === "Mint" && mode === "Cash" ? "Amount in USDG" : "Amount in fIPO";

export function TradePanel() {
  const inputId = useId();
  const errorId = useId();
  const oracleStatus = useOracleStatus();
  const offHours = oracleStatus === "off-hours";
  const cashAvailable = oracleStatus === "live";
  const { data: indexState, assets } = useIndexState();
  const { address, openConnect } = useWallet();
  const { status, limits, usdgBalance, position } = usePortfolio();
  const { flow, review, confirm, cancel, close } = useTradeFlow();
  const feeRates = useFeeRates();

  const [direction, setDirection] = useState<Direction>("Mint");
  const [mode, setMode] = useState<TradeMode>("Cash");
  const [raw, setRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const cashQuote = useCashQuote(raw, direction, mode, cashAvailable);

  const connected = status === "ready";
  const amount = parseAmount(raw);
  const inKindInputAmount = mode === "In-kind" ? parseUnits(raw, 18) : null;
  const availabilityError = mode === "Cash" && oracleStatus !== "live"
    ? oracleStatus === null
      ? "Checking market and oracle availability."
      : oracleStatus === "off-hours"
        ? "Cash mint and redeem are unavailable outside regular US market hours. Use in-kind redemption to exit."
        : "Cash mint and redeem are paused because at least one oracle is unhealthy. Use in-kind redemption to exit."
    : mode === "In-kind" && !feeRates.data
      ? feeRates.error ? "Live fee configuration is unavailable. Try again before submitting." : "Reading live fee configuration."
      : null;
  const limitError = connected && amount !== null ? validateTrade(direction, mode, amount, limits) : null;
  const balanceError = address && status === "error" ? "Wallet balances are unavailable. Check the active network and try again." : null;
  const error = availabilityError ?? (touched && amount === null ? "Enter an amount greater than zero." : balanceError ?? limitError);
  const liveNav = indexState?.sharePriceUsd18 ? unitsToNumber(indexState.sharePriceUsd18, 18) : null;
  const request: TradeRequest | null = amount === null || (mode === "Cash" && !cashQuote.quote)
    || (mode === "In-kind" && (liveNav === null || !feeRates.data))
    ? null
    : {
        direction,
        mode,
        amount,
        nav: liveNav ?? 0,
        offHours,
        ...(cashQuote.quote ? { cashQuote: cashQuote.quote } : {}),
        ...(feeRates.data ? { feeBps: mode === "Cash" ? feeRates.data.cashBps : feeRates.data.inKindBps } : {}),
        ...(inKindInputAmount ? { inputAmount: inKindInputAmount } : {}),
      };

  const balanceLabel = direction === "Mint" && mode === "Cash" ? `${formatUsd(usdgBalance)} USDG` : `${formatNumber(position.shares, 2)} fIPO`;

  const handleSubmit = () => {
    setTouched(true);
    if (!address) return openConnect();
    if (request && !error) review(request);
  };

  const fillMax = () => setRaw(String(Math.floor(maxAmount(direction, mode, limits) * 100) / 100));

  return (
    <>
      <form
        className={styles.panel}
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        noValidate
      >
        <div className={styles.toggles}>
          <Tabs label="Direction" options={DIRECTIONS} value={direction} onChange={setDirection} />
          <Tabs label="Settlement" options={MODES} value={mode} onChange={setMode} />
        </div>

        <div className={styles.availability} role="status">
          <StatusChip tone={oracleStatus === "live" ? "solid" : "outline"}>
            {oracleStatus === "live" ? "Cash available" : oracleStatus === "off-hours" ? "Off-hours" : oracleStatus === "stale" ? "Oracle unhealthy" : "Checking"}
          </StatusChip>
          <span>
            {oracleStatus === "live"
              ? "Cash settlement is available and quotes are read from the deployed vault."
              : "In-kind redemption remains available without relying on a live price."}
          </span>
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor={inputId} className={styles.label}>
              {inputLabel(direction, mode)}
            </label>
            {connected && (
              <button type="button" className={styles.max} onClick={fillMax}>
                Max <Separator /> {balanceLabel}
              </button>
            )}
          </div>
          <input
            id={inputId}
            className={`${styles.input} tabular`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={raw}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setRaw(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${direction}-${mode}-${request !== null}`}
            className={styles.preview}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
          >
            {cashQuote.loading ? (
              <p className={styles.hint}>Reading the onchain preview…</p>
            ) : cashQuote.error ? (
              <p className={styles.hint}>The onchain preview is unavailable. Try again.</p>
            ) : request === null ? (
              <p className={styles.hint}>Enter an amount to see the onchain fee and output.</p>
            ) : mode === "Cash" ? (
              <CashPreview request={request} />
            ) : (
              <InKindPreview
                direction={direction}
                rawShares={request.inputAmount}
                inKindFeeBps={request.feeBps}
                data={indexState}
                assets={assets}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <Button type="submit" loading={status === "loading"} disabled={Boolean(address) && (request === null || Boolean(error))}>
          {address ? `Review ${direction.toLowerCase()}` : "Connect wallet"}
        </Button>
        <p className={styles.note}>
          Transactions settle onchain on Robinhood Chain. Cash quotes include the protocol fee and disclose the keeper rebalance slippage cap. In-kind redemption has no swap slippage.
        </p>
      </form>

      <TradeModal flow={flow} onConfirm={confirm} onCancel={cancel} onClose={close} />
    </>
  );
}
