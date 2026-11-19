"use client";

import { useState } from "react";
import { trustedAssetUrl } from "@/lib/trusted-asset-url";
import styles from "./AssetLogo.module.css";

interface AssetLogoProps {
  name: string;
  symbol: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}

/** Displays the registry logo and degrades to an accessible symbol mark. */
export function AssetLogo({ name, symbol, src, size = "md" }: AssetLogoProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = trustedAssetUrl(src);

  return (
    <span className={`${styles.frame} ${styles[size]}`}>
      {failed || !safeSrc ? (
        <span className={styles.fallback} aria-label={`${name} logo`} role="img">
          {symbol.slice(0, 2)}
        </span>
      ) : (
        // Registry URLs are dynamic data and intentionally bypass image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.image} src={safeSrc} alt={`${name} logo`} onError={() => setFailed(true)} />
      )}
    </span>
  );
}
