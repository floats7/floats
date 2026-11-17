/** Simulated wallet used until real wallet connection ships. */
export const SAMPLE_ACCOUNT = {
  address: "0x5fe3a9c1b2d4e6f80a7b3c9d1e2f4a6b8c0d7e12",
  usdgBalance: 10_000,
  /** Units of each constituent Stock Token the wallet holds, for in-kind minting. */
  tokenUnits: { CRWV: 6, ETOR: 22, CRCL: 8, CHYM: 34, FIG: 14, KLAR: 28, FIGR: 31, NTSK: 37 } as Record<string, number>,
} as const;
