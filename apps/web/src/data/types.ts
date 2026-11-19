export interface Constituent {
  ticker: string;
  name: string;
  ipoDate: string;
  entryDate: string;
  targetWeight: number;
  actualWeight: number;
  returnSinceEntry: number;
  price: number;
}

export interface EligibilityChecks {
  tokenLive: boolean;
  priceFeed: boolean;
  liquidity: boolean;
}

export type ChangeKind = "add" | "remove" | "weights" | "scheduled";

export interface RegistryChange {
  id: string;
  date: string;
  kind: ChangeKind;
  title: string;
  detail: string;
  transactionHash: string;
  blockNumber: number;
  registryVersion: number | null;
  explorerUrl: string;
}

export interface NavPoint {
  label: string;
  value: number;
}

export type NavRange = "1D" | "1W" | "1M" | "ALL";

export interface Position {
  shares: number;
  costBasis: number;
}

export type TransactionType = "Cash mint" | "Cash redeem" | "In-kind mint" | "In-kind redeem";

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  shares: number;
  usdg: number;
  hash?: string;
}
