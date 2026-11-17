"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { shortAddress } from "@/lib/address";
import { useWallet } from "./WalletProvider";
import styles from "./WalletButton.module.css";

export function WalletButton() {
  const { address, openConnect, disconnect } = useWallet();
  const { notify } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (!address) {
    return (
      <Button className={styles.connect} onClick={openConnect}>
        Connect wallet
      </Button>
    );
  }

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    notify("Address copied", "success");
    setMenuOpen(false);
  };

  const handleDisconnect = () => {
    setMenuOpen(false);
    disconnect();
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <button type="button" className={styles.account} aria-expanded={menuOpen} aria-haspopup="true" onClick={() => setMenuOpen((open) => !open)}>
        <span className={styles.dot} aria-hidden="true" />
        <span className="tabular">{shortAddress(address)}</span>
      </button>
      {menuOpen && (
        <div className={styles.menu}>
          <button type="button" className={styles.item} onClick={copyAddress}>
            Copy address
          </button>
          <button type="button" className={styles.item} onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
