"use client";

import { StatusChip } from "@/components/ui/StatusChip";
import { useWallet } from "@/features/wallet/WalletProvider";
import { shortAddress } from "@/lib/address";

export function WalletChip() {
  const { address } = useWallet();
  return <StatusChip tone="muted">{address ? shortAddress(address) : "Not connected"}</StatusChip>;
}
