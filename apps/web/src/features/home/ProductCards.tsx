"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { HudSection } from "@/components/ui/HudSection";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { CardArt, type CardArtName } from "./CardArt";
import styles from "./ProductCards.module.css";

interface Product {
  href: string;
  title: string;
  body: string;
  tags: readonly string[];
  art: CardArtName;
}

const PRODUCTS: readonly Product[] = [
  {
    href: "/holdings",
    title: "The Index",
    body: "A basket of newly listed Stock Tokens, weighted by market cap and capped per name. One token, every constituent.",
    tags: ["fIPO", "Holdings", "Rebalancing"],
    art: "index",
  },
  {
    href: "/trade",
    title: "Buy & Sell",
    body: "Buy and sell fIPO at NAV with USDG, or exit into the underlying tokens with in-kind settlement.",
    tags: ["Cash", "In-kind", "Slippage guard"],
    art: "trade",
  },
  {
    href: "/pipeline",
    title: "IPO Pipeline",
    body: "Every upcoming listing and the day it could join the index, with each eligibility check shown in the open.",
    tags: ["Entry date", "Price feed", "Liquidity"],
    art: "pipeline",
  },
];

/** Paper-toned section with a tab row and a horizontal strip of full-width product panels. */
export function ProductCards() {
  const scroller = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);

  const slideAt = (index: number) => scroller.current?.children[index] as HTMLElement | undefined;

  const updateCurrent = () => {
    const node = scroller.current;
    const first = slideAt(0);
    if (!node || !first) return;
    const stride = first.offsetWidth + parseFloat(getComputedStyle(node).columnGap || "0");
    setCurrent(Math.min(PRODUCTS.length - 1, Math.round(node.scrollLeft / stride)));
  };

  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(PRODUCTS.length - 1, index));
    scroller.current?.scrollTo({ left: slideAt(target)?.offsetLeft ?? 0, behavior: "smooth" });
  };

  return (
    <HudSection index="003" title="Products" meta="Index / Trade / Pipeline" tone="paper">
      <Reveal className={styles.header}>
        <h2 className={styles.title}>
          One index. Everything <br />
          you need to hold it.
        </h2>
      </Reveal>

      <div className={styles.bar}>
        <ol className={styles.tabs} aria-label="Products">
          {PRODUCTS.map((product, index) => (
            <li key={product.title}>
              <button type="button" className={styles.tab} aria-current={index === current} onClick={() => goTo(index)}>
                <span className={styles.box} aria-hidden="true" />
                {index === current && (
                  <span className="tabular">
                    {index + 1}
                    <span className={styles.total}> / {PRODUCTS.length}</span>
                  </span>
                )}
                {index !== current && product.title}
              </button>
            </li>
          ))}
        </ol>
        <div className={styles.arrows}>
          <button type="button" className={styles.arrow} onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Previous card">
            <Icon name="arrow-left" size={12} />
          </button>
          <button type="button" className={styles.arrow} data-primary="true" onClick={() => goTo(current + 1)} disabled={current === PRODUCTS.length - 1} aria-label="Next card">
            <Icon name="arrow-right" size={12} />
          </button>
        </div>
      </div>

      <ul ref={scroller} className={styles.scroller} onScroll={updateCurrent} aria-label="Product panels">
        {PRODUCTS.map((product, index) => (
          <li key={product.title} className={styles.slide}>
            <Link href={product.href} className={styles.card}>
              <div className={styles.art}>
                <CardArt name={product.art} />
              </div>
              <div className={styles.top}>
                <span className={`${styles.index} tabular`}>[{String(index + 1).padStart(2, "0")}]</span>
                <h3 className={styles.cardTitle}>{product.title}</h3>
                <p className={styles.body}>{product.body}</p>
              </div>
              <ul className={styles.tags}>
                {product.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ul>
    </HudSection>
  );
}
