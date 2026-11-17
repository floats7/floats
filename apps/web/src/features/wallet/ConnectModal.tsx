"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusIcon } from "@/components/ui/StatusIcon";
import styles from "./ConnectModal.module.css";

export type ConnectPhase = "closed" | "idle" | "connecting" | "rejected";

interface ConnectModalProps {
  phase: ConnectPhase;
  onConnect: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function ConnectModal({ phase, onConnect, onCancel, onClose }: ConnectModalProps) {
  const connecting = phase === "connecting";

  return (
    <Modal open={phase !== "closed"} onClose={onClose} title="Connect wallet" dismissible={!connecting}>
      {phase === "idle" && (
        <div className={styles.body}>
          <p className={styles.copy}>Connect a wallet on Robinhood Chain to mint, redeem and track your fIPO position.</p>
          <Button onClick={onConnect}>Browser wallet</Button>
          <p className={styles.note}>By connecting you agree to the terms of use. Floatss never takes custody of your funds.</p>
        </div>
      )}

      {connecting && (
        <div className={styles.result} aria-live="polite">
          <StatusIcon status="pending" />
          <h3 className={styles.heading}>Waiting for approval</h3>
          <p className={styles.copy}>Confirm the connection request in your wallet.</p>
          <Button variant="outline" onClick={onCancel}>
            Reject request
          </Button>
        </div>
      )}

      {phase === "rejected" && (
        <div className={styles.result} role="alert">
          <StatusIcon status="failed" />
          <h3 className={styles.heading}>Connection rejected</h3>
          <p className={styles.copy}>The request was declined, so nothing was connected. You can try again whenever you are ready.</p>
          <div className={styles.actions}>
            <Button onClick={onConnect}>Try again</Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
