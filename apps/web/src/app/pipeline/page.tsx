import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { PipelineTimeline } from "@/features/pipeline/PipelineTimeline";

export const metadata: Metadata = { title: "IPO Pipeline" };

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        eyebrow="IPO pipeline"
        title="Spot the next entry."
        description="Upcoming and freshly listed companies, and exactly when each could join the index."
      />
      <PipelineTimeline />
    </>
  );
}
