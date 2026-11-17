import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChangeLog } from "@/features/methodology/ChangeLog";
import { FeeTable } from "@/features/methodology/FeeTable";
import { RulesList } from "@/features/methodology/RulesList";

export const metadata: Metadata = { title: "Methodology & Changes" };

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Methodology & changes"
        title="Rules in the open."
        description="How companies enter and leave the index, how weights and fees work, and a public record of every change."
      />
      <RulesList />
      <FeeTable />
      <ChangeLog />
    </>
  );
}
