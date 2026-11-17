"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { CONSTITUENTS } from "@/data/constituents";
import { INDEX_STATS } from "@/data/index-stats";
import { usePortfolio } from "@/features/portfolio/PortfolioProvider";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useOracleStatus } from "@/hooks/useOracleStatus";
import { formatNumber, formatUsd } from "@/lib/format";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { parseAmount, quoteInKind, type Direction, type TradeMode } from "@/lib/quote";
import { maxAmount, validateTrade, type TradeRequest } from "@/lib/trade";
import { parseUnits } from "@/lib/units";
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
  const offHours = useOracleStatus() === "off-hours";
  const { address, openConnect } = useWallet();
  const { status, limits, usdgBalance, position } = usePortfolio();
  const { flow, review, confirm, cancel, close } = useTradeFlow();

  const [direction, setDirection] = useState<Direction>("Mint");
  const [mode, setMode] = useState<TradeMode>("Cash");
  const [raw, setRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const cashQuote = useCashQuote(raw, direction, mode);

  const connected = status === "ready";
  const amount = parseAmount(raw);
  const inKindInputAmount = mode === "In-kind" ? parseUnits(raw, 18) : null;
  const limitError = connected && amount !== null ? validateTrade(direction, mode, amount, limits) : null;
  const balanceError = address && status === "error" ? "Wallet balances are unavailable. Check the active network and try again." : null;
  const error = touched && amount === null ? "Enter an amount greater than zero." : balanceError ?? limitError;
  const request: TradeRequest | null = amount === null || (mode === "Cash" && !cashQuote.quote)
    ? null
    : {
        direction,
        mode,
        amount,
        nav: INDEX_STATS.nav,
        offHours,
        ...(cashQuote.quote ? { cashQuote: cashQuote.quote } : {}),
        ...(inKindInputAmount ? { inputAmount: inKindInputAmount } : {}),
      };

  const balanceLabel = direction === "Mint" && mode === "Cash" ? `${formatUsd(usdgBalance)} USDG` : `${formatNumber(position.shares, 2)} fIPO`;

  const handleSubmit = () => {
    setTouched(true);
    if (!address) return openConnect();
    if (request && !limitError) review(request);
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
              <InKindPreview direction={direction} quote={quoteInKind(request.amount, request.nav, CONSTITUENTS)} />
            )}
          </motion.div>
        </AnimatePresence>

        <Button type="submit" loading={status === "loading"} disabled={Boolean(address) && (request === null || Boolean(error))}>
          {address ? `Review ${direction.toLowerCase()}` : "Connect wallet"}
        </Button>
        <p className={styles.note}>
          Transactions settle onchain on Robinhood Chain. Review the fee and slippage limit before you confirm.
          {offHours && mode === "Cash" ? " An off-hours surcharge is included in the fee." : ""}
        </p>
      </form>

      <TradeModal flow={flow} onConfirm={confirm} onCancel={cancel} onClose={close} />
    </>
  );
}
