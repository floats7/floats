import type { Metadata } from "next";
import { ConstituentDetailView } from "@/features/holdings/detail/ConstituentDetailView";

interface PageProps {
  readonly params: Promise<{ readonly ticker: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} | Holdings` };
}

export default async function ConstituentPage({ params }: PageProps) {
  const { ticker } = await params;
  return <ConstituentDetailView ticker={ticker.toUpperCase()} />;
}
