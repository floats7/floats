"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusIcon } from "@/components/ui/StatusIcon";
import styles from "./ConnectModal.module.css";

export type ConnectPhase = "closed" | "idle" | "connecting" | "rejected";

interface ConnectModalProps {
  phase: ConnectPhase;
  onBrowserConnect: () => void;
  onWalletConnect: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function ConnectModal({ phase, onBrowserConnect, onWalletConnect, onCancel, onClose }: ConnectModalProps) {
  const connecting = phase === "connecting";

  return (
    <Modal open={phase !== "closed"} onClose={onClose} title="Connect wallet" dismissible={!connecting}>
      {phase === "idle" && (
        <div className={styles.body}>
          <p className={styles.copy}>Connect a wallet on Robinhood Chain to mint, redeem and track your fIPO position.</p>
          <div className={styles.walletOptions}>
            <Button onClick={onBrowserConnect}>Browser wallet</Button>
            <Button variant="outline" onClick={onWalletConnect}>WalletConnect</Button>
          </div>
          <div className={styles.safetyNotice}>
            <strong>Wallet safety</strong>
            <p>Floats never asks for a seed phrase, private key or wallet password. Connecting does not authorize token transfers.</p>
          </div>
          <p className={styles.note}>
            By connecting you agree to the <Link href="/terms" onClick={onClose}>Terms of Use</Link>. Review our <Link href="/security" onClick={onClose}>Security Policy</Link> before signing.
          </p>
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
            <Button onClick={onBrowserConnect}>Try browser wallet</Button>
            <Button variant="outline" onClick={onWalletConnect}>WalletConnect</Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
