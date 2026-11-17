"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { PortfolioProvider } from "@/features/portfolio/PortfolioProvider";
import { IndexStateProvider } from "@/features/index-state/IndexStateProvider";
import { WalletProvider } from "@/features/wallet/WalletProvider";
import { ToastProvider } from "./Toast";

/** App-wide client state. Reduced motion is honoured by every animation below. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <WalletProvider>
          <IndexStateProvider>
            <PortfolioProvider>{children}</PortfolioProvider>
          </IndexStateProvider>
        </WalletProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
