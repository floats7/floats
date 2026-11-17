export interface NavLink {
  href: string;
  label: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Index" },
  { href: "/holdings", label: "Holdings" },
  { href: "/trade", label: "Mint & Redeem" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/methodology", label: "Methodology" },
  { href: "/portfolio", label: "Portfolio" },
];

/**
 * Jurisdictions where Stock Tokens are unavailable.
 * The official list must be confirmed before public launch.
 */
export const RESTRICTED_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA", "GB"]);

export const DISCLAIMER =
  "Stock Tokens are debt obligations of their issuer, not ownership of shares. fIPO is not a regulated fund.";
