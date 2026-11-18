import type { Metadata } from "next";
import { MarketDetailView } from "@/features/markets/MarketDetailView";

interface PageProps { readonly params: Promise<{ readonly assetId: string }> }
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { assetId } = await params;
  return { title: `${assetId === "index" ? "Index" : "Asset"} Market` };
}
export default async function MarketPage({ params }: PageProps) {
  const { assetId } = await params;
  return <MarketDetailView assetId={decodeURIComponent(assetId)} />;
}
