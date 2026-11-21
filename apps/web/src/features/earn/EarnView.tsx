"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { FUSDView } from "@/features/fusd/FUSDView";
import { PerpsLiquidityPanel } from "@/features/perps/PerpsLiquidityPanel";
import styles from "./EarnView.module.css";

export function EarnView() {
  const [product, setProduct] = useState<"fusd" | "perps">("fusd");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const products = ["fusd", "perps"] as const;

  function selectAdjacentProduct(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % products.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + products.length) % products.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = products.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextProduct = products[nextIndex];
    if (!nextProduct) return;
    setProduct(nextProduct);
    tabRefs.current[nextIndex]?.focus();
  }

  return <>
    <div className={`container ${styles.tabs}`} role="tablist" aria-label="Earn product">
      <button ref={(node) => { tabRefs.current[0] = node; }} id="earn-tab-fusd" type="button" role="tab" aria-controls="earn-panel" aria-selected={product === "fusd"} tabIndex={product === "fusd" ? 0 : -1} onClick={() => setProduct("fusd")} onKeyDown={(event) => selectAdjacentProduct(event, 0)}><strong>fUSD</strong><span>Liquid USDG yield</span></button>
      <button ref={(node) => { tabRefs.current[1] = node; }} id="earn-tab-perps" type="button" role="tab" aria-controls="earn-panel" aria-selected={product === "perps"} tabIndex={product === "perps" ? 0 : -1} onClick={() => setProduct("perps")} onKeyDown={(event) => selectAdjacentProduct(event, 1)}><strong>Perps LP</strong><span>Trading liquidity</span></button>
    </div>
    <div id="earn-panel" role="tabpanel" aria-labelledby={`earn-tab-${product}`}>
      {product === "fusd" ? <FUSDView /> : <div className="container"><PerpsLiquidityPanel /></div>}
    </div>
  </>;
}
