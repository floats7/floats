import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteBackdrop } from "@/components/layout/SiteBackdrop";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Providers } from "@/components/ui/Providers";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Floats | Onchain IPO index", template: "%s | Floats" },
  description: "One token for every newly listed company. Floats is an ERC-4626 index vault on Robinhood Chain.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteBackdrop />
        <Providers>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
