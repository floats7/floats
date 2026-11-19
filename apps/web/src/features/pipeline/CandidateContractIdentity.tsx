"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { floatApi } from "@/lib/api-client";
import styles from "./PipelineDetail.module.css";

export function CandidateContractIdentity({ address }: { readonly address: string }) {
  const [explorer, setExplorer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    floatApi.getPublicConfig(controller.signal)
      .then((config) => setExplorer(`${config.blockExplorerUrl.replace(/\/$/, "")}/address/${address}`))
      .catch(() => setExplorer(null));
    return () => controller.abort();
  }, [address]);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section className={styles.contractIdentity} aria-label="Canonical Stock Token contract">
      <div>
        <p className="eyebrow">Canonical Stock Token</p>
        <code>{address}</code>
      </div>
      <div className={styles.contractActions}>
        <button type="button" onClick={copy} aria-label="Copy canonical contract address">
          <Icon name="copy" size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
        {explorer && <a href={explorer} target="_blank" rel="noreferrer"><Icon name="external-link" size={14} />Explorer</a>}
      </div>
    </section>
  );
}
