"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { StatusIcon } from "@/components/ui/StatusIcon";
import styles from "./OnchainTransactionModal.module.css";

export type OnchainTransactionPhase = "pending" | "success" | "failed";

interface OnchainTransactionModalProps {
  readonly open: boolean;
  readonly phase: OnchainTransactionPhase;
  readonly title: string;
  readonly steps: readonly string[];
  readonly stepIndex: number;
  readonly hash?: string;
  readonly explorerUrl?: string;
  readonly error?: string;
  readonly onClose: () => void;
}

export function OnchainTransactionModal({ open, phase, title, steps, stepIndex, hash, explorerUrl, error, onClose }: OnchainTransactionModalProps) {
  const pending = phase === "pending";
  return (
    <Modal open={open} onClose={onClose} title={pending ? title : phase === "success" ? "Transaction confirmed" : "Transaction failed"} dismissible={!pending}>
      <div className={styles.content} aria-live="polite">
        <StatusIcon status={phase} />
        {pending && (
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step} data-state={index < stepIndex ? "done" : index === stepIndex ? "active" : "waiting"}>
                <span className={styles.marker}>{index < stepIndex ? <Icon name="check" size={12} /> : index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
        {phase === "success" && hash && (
          <div className={styles.receipt}>
            <p>Your transaction is finalized onchain.</p>
            <dl>
              <div><dt>Status</dt><dd>Confirmed</dd></div>
              <div><dt>Confirmed at</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" }).format(new Date())}</dd></div>
              <div><dt>Transaction hash</dt><dd className="tabular">{hash}</dd></div>
            </dl>
            {explorerUrl && <a href={`${explorerUrl.replace(/\/$/, "")}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction on explorer <Icon name="external-link" /></a>}
          </div>
        )}
        {phase === "failed" && <p className={styles.error}>{error ?? "The transaction was rejected or failed simulation. No state was changed by the app."}</p>}
        {!pending && <Button variant="outline" onClick={onClose}>Done</Button>}
      </div>
    </Modal>
  );
}
