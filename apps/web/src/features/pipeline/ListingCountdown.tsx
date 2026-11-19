"use client";

import { useEffect, useMemo, useState } from "react";
import { listingOpenAt } from "@/lib/us-market-clock";

export function ListingCountdown({ listingDate }: { readonly listingDate: string }) {
  const opensAt = useMemo(() => listingOpenAt(listingDate), [listingDate]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.floor((opensAt.getTime() - now) / 1_000));
  if (remaining === 0) return <span>Nasdaq opening process active</span>;
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const seconds = remaining % 60;
  return <span className="tabular">Nasdaq opens in {pad(hours)}:{pad(minutes)}:{pad(seconds)}</span>;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
