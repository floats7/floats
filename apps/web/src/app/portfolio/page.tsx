import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { PortfolioView } from "@/features/portfolio/PortfolioView";
import { WalletChip } from "@/features/portfolio/WalletChip";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Your position."
        description="Holdings, cost basis and history for the connected wallet. Balances update as soon as a transaction settles."
        aside={<WalletChip />}
      />
      <PortfolioView />
    </>
  );
}
