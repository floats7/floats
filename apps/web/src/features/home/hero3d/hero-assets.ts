export interface HeroAsset {
  readonly ticker: string;
  readonly company: string;
  readonly logo: string;
}

/** Representative top US companies shown around the fIPO medal. */
export const HERO_ASSETS: readonly HeroAsset[] = [
  { ticker: "AAPL", company: "Apple", logo: "/assets/companies/apple.png" },
  { ticker: "MSFT", company: "Microsoft", logo: "/assets/companies/microsoft.png" },
  { ticker: "NVDA", company: "NVIDIA", logo: "/assets/companies/nvidia.png" },
  { ticker: "GOOGL", company: "Alphabet", logo: "/assets/companies/alphabet.png" },
  { ticker: "AMZN", company: "Amazon", logo: "/assets/companies/amazon.png" },
  { ticker: "SPCX", company: "SpaceX", logo: "/assets/companies/spacex.png" },
  { ticker: "META", company: "Meta", logo: "/assets/companies/meta.jpg" },
  { ticker: "AVGO", company: "Broadcom", logo: "/assets/companies/broadcom.png" },
  { ticker: "TSLA", company: "Tesla", logo: "/assets/companies/tesla.png" },
  { ticker: "LLY", company: "Eli Lilly", logo: "/assets/companies/lilly.png" },
] as const;
