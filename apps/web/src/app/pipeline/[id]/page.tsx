import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PIPELINE } from "@/data/pipeline";
import { PipelineDetail } from "@/features/pipeline/PipelineDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamicParams = false;

export const generateStaticParams = () => PIPELINE.map(({ id }) => ({ id }));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: PIPELINE.find((item) => item.id === id)?.name ?? "Pipeline" };
}

export default async function PipelineItemPage({ params }: PageProps) {
  const { id } = await params;
  const item = PIPELINE.find((candidate) => candidate.id === id);
  if (!item) notFound();

  return <PipelineDetail item={item} />;
}
