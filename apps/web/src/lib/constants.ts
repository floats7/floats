export interface NavLink {
  href: string;
  label: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Index" },
  { href: "/markets", label: "Markets" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/methodology", label: "Methodology" },
  { href: "/portfolio", label: "Portfolio" },
];

/**
 * Country-level transaction restrictions published by RHJ.
 *
 * Source reviewed 2026-11-18:
 * https://docs.robinhood.com/rhj/restricted-jurisdictions/
 *
 * This edge control is only one compliance layer. A country header cannot
 * establish residency, U.S. Person status, sanctions status, or eligibility.
 */
export const RESTRICTED_COUNTRIES: ReadonlySet<string> = new Set([
  "AE",
  "BY",
  "CA",
  "CH",
  "CU",
  "GB",
  "IR",
  "KP",
  "MM",
  "RU",
  "SD",
  "SS",
  "SY",
  "UA",
  "US",
  "VE",
]);

export const DISCLAIMER =
  "Stock Tokens are debt securities issued by RHJ and do not provide legal or beneficial ownership of the underlying shares. Floats is an independent project and is not affiliated with or endorsed by Robinhood.";
