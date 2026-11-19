import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { BridgeView } from "@/features/bridge/BridgeView";

export const metadata: Metadata = { title: "Bridge" };

export default function BridgePage() {
  return (
    <>
      <PageHeader
        eyebrow="Cross-chain"
        title="Move without moving the vault."
        description="Track LayerZero delivery and mirrored NAV state. Sending remains unavailable until every route passes the production activation gate."
      />
      <BridgeView />
    </>
  );
}
