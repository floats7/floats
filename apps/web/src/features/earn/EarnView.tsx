"use client";

import { useState } from "react";
import { FUSDView } from "@/features/fusd/FUSDView";
import { PerpsLiquidityPanel } from "@/features/perps/PerpsLiquidityPanel";
import styles from "./EarnView.module.css";

export function EarnView() {
  const [product, setProduct] = useState<"fusd" | "perps">("fusd");
  return <>
    <div className={`container ${styles.tabs}`} role="tablist" aria-label="Earn product">
      <button type="button" role="tab" aria-selected={product === "fusd"} onClick={() => setProduct("fusd")}><strong>fUSD</strong><span>Liquid USDG yield</span></button>
      <button type="button" role="tab" aria-selected={product === "perps"} onClick={() => setProduct("perps")}><strong>Perps LP</strong><span>Trading liquidity</span></button>
    </div>
    {product === "fusd" ? <FUSDView /> : <div className="container"><PerpsLiquidityPanel /></div>}
  </>;
}
