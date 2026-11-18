import type { Metadata } from "next";
import { PipelineDetailLoader } from "@/features/pipeline/PipelineDetailLoader";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "IPO candidate" };

export default async function PipelineItemPage({ params }: PageProps) {
  const { id } = await params;
  return <PipelineDetailLoader id={id} />;
}
