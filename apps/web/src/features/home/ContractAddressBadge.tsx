"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./ContractAddressBadge.module.css";

export function ContractAddressBadge({ address }: { readonly address: `0x${string}` }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <button type="button" className={styles.badge} onClick={copy} aria-label={`Copy Floats contract address ${address}`}>
      <span className={styles.label}>Floats CA</span>
      <span className={`${styles.address} tabular`}>{address}</span>
      <span className={styles.action}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
