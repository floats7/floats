import { Chivo_Mono, Funnel_Display, Funnel_Sans } from "next/font/google";

const display = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-funnel-display",
  display: "swap",
});

const body = Funnel_Sans({
  subsets: ["latin"],
  variable: "--font-funnel-sans",
  display: "swap",
});

const mono = Chivo_Mono({
  subsets: ["latin"],
  variable: "--font-chivo-mono",
  display: "swap",
});

export const fontVariables = [display, body, mono].map((font) => font.variable).join(" ");
