import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EarnView } from "@/features/earn/EarnView";

export const metadata: Metadata = { title: "Earn" };

export default function EarnPage() {
  return (
    <>
      <PageHeader
        eyebrow="Earn"
        title="Put USDG to work."
        description="Choose liquid fUSD yield or supply liquidity to Floats perpetual markets. Each product keeps separate accounting, withdrawal rules, and risk disclosures."
      />
      <EarnView />
    </>
  );
}
