"use client";

import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { SummaryList } from "@/components/ui/SummaryList";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";
import { shortAddress } from "@/lib/address";
import type { TradeRequest } from "@/lib/trade";
import { stepsFor, type TradeFailureCode, type TradeReceipt } from "@/lib/wallet-transactions";
import { FAILURE_COPY } from "./failure-copy";
import { navRow, summaryRows } from "./trade-summary";
import { retailTradeAction, settlementDescription } from "@/lib/trade-copy";
import styles from "./TradeModalSteps.module.css";

const verb = (request: TradeRequest) => retailTradeAction(request.direction).toLowerCase();

interface ReviewStepProps {
  request: TradeRequest;
  onConfirm: () => void;
  onClose: () => void;
}

export function ReviewStep({ request, onConfirm, onClose }: ReviewStepProps) {
  const rows = request.mode === "Cash" ? summaryRows(request) : [...summaryRows(request), navRow(request.nav)];

  return (
    <div className={styles.stack}>
      <SummaryList rows={rows} />
      {request.mode === "Cash" && (
        <p className={styles.note}>
          The displayed cash quote is read from the vault at block {request.cashQuote?.blockNumber}. Wallet confirmation uses the exact base-unit amount.
        </p>
      )}
      <p className={styles.note}>Settlement method: {settlementDescription(request.direction, request.mode)}.</p>
      <div className={styles.actions}>
        <Button onClick={onConfirm}>Confirm {verb(request)}</Button>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface PendingStepProps {
  request: TradeRequest;
  stepIndex: number;
  onCancel: () => void;
}

export function PendingStep({ request, stepIndex, onCancel }: PendingStepProps) {
  const steps = stepsFor(request);
  const settling = stepIndex === steps.length - 1;

  return (
    <div className={styles.center} aria-live="polite">
      <StatusIcon status="pending" />
      <h3 className={styles.heading}>{steps[stepIndex]?.label}</h3>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.id} className={styles.step} data-state={index < stepIndex ? "done" : index === stepIndex ? "active" : "todo"}>
            <span className={styles.marker} aria-hidden="true">
              {index < stepIndex ? <Icon name="check" size={12} /> : index + 1}
            </span>
            {step.label}
            <span className="visually-hidden">{index < stepIndex ? " (done)" : index === stepIndex ? " (in progress)" : " (waiting)"}</span>
          </li>
        ))}
      </ol>
      {settling ? (
        <p className={styles.note}>Settlement cannot be cancelled. Keep this window open until it completes.</p>
      ) : (
        <Button variant="outline" onClick={onCancel}>
          Reject in wallet
        </Button>
      )}
    </div>
  );
}

interface SuccessStepProps {
  request: TradeRequest;
  receipt: TradeReceipt;
  onClose: () => void;
}

export function SuccessStep({ request, receipt, onClose }: SuccessStepProps) {
  const { notify } = useToast();
  const { sharesDelta, usdgDelta } = receipt.outcome;
  const minting = request.direction === "Mint";

  const copyHash = async () => {
    await navigator.clipboard.writeText(receipt.hash);
    notify("Transaction hash copied", "success");
  };

  return (
    <div className={styles.center} role="status">
      <StatusIcon status="success" />
      <h3 className={styles.heading}>
        {minting ? "Bought" : "Sold"} {formatNumber(Math.abs(sharesDelta), 4)} fIPO
      </h3>
      <div className={styles.full}>
        <SummaryList
          rows={[
            ...(usdgDelta !== 0 ? [{ label: usdgDelta < 0 ? "Paid" : "Received", value: `${formatNumber(Math.abs(usdgDelta), 2)} USDG` }] : []),
            { label: "Date", value: receipt.date },
            { label: "Transaction", value: shortAddress(receipt.hash) },
          ]}
        />
        {receipt.explorerUrl && (
          <a className={styles.explorerLink} href={`${receipt.explorerUrl.replace(/\/$/, "")}/tx/${receipt.hash}`} target="_blank" rel="noreferrer">
            View transaction on explorer <Icon name="external-link" />
          </a>
        )}
      </div>
      <div className={styles.actions}>
        <LinkButton href="/portfolio" variant="chrome">
          View portfolio
        </LinkButton>
        <Button variant="outline" onClick={copyHash}>
          Copy hash
        </Button>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

interface FailedStepProps {
  failure: TradeFailureCode;
  onRetry: () => void;
  onClose: () => void;
}

export function FailedStep({ failure, onRetry, onClose }: FailedStepProps) {
  const copy = FAILURE_COPY[failure];

  return (
    <div className={styles.center} role="alert">
      <StatusIcon status="failed" />
      <h3 className={styles.heading}>{copy.title}</h3>
      <p className={styles.body}>{copy.body}</p>
      <div className={styles.actions}>
        {!copy.canEdit && <Button onClick={onRetry}>Try again</Button>}
        <Button variant={copy.canEdit ? "chrome" : "outline"} onClick={onClose}>
          {copy.canEdit ? "Edit amount" : "Close"}
        </Button>
        {copy.canEdit && (
          <Link href="/methodology" className={styles.link}>
            How off-hours trading works
          </Link>
        )}
      </div>
    </div>
  );
}
