import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { TradeNotes } from "@/features/trade/TradeNotes";
import { TradePanel } from "@/features/trade/TradePanel";
import styles from "@/features/trade/trade.module.css";

export const metadata: Metadata = { title: "Mint & Redeem" };

export default function TradePage() {
  return (
    <>
      <PageHeader
        eyebrow="Mint & redeem"
        title="Enter and exit at NAV."
        description="Use USDG for a simple cash flow, or move the underlying Stock Tokens directly with in-kind settlement."
      />
      <div className={`container ${styles.layout}`}>
        <Reveal>
          <TradePanel />
        </Reveal>
        <Reveal delay={0.1}>
          <TradeNotes />
        </Reveal>
      </div>
    </>
  );
}
