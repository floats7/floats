import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AllocationBar } from "@/features/holdings/AllocationBar";
import { HoldingsTable } from "@/features/holdings/HoldingsTable";

export const metadata: Metadata = { title: "Holdings" };

export default function HoldingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Index constituents"
        title="What fIPO holds."
        description="Eight recent listings at target weight. Each leaves the index 24 months after its IPO date, or sooner if a safety rule triggers."
      />
      <AllocationBar />
      <HoldingsTable />
    </>
  );
}
