import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const environmentPath = process.argv[2];
const broadcastPath = process.argv[3];
if (!environmentPath || !broadcastPath || !/^\.env\.(testnet|mainnet)$/.test(environmentPath)) {
  throw new Error("Usage: update-options-addresses.ts <.env.testnet|.env.mainnet> <broadcast-json>");
}

interface BroadcastTransaction {
  readonly contractName?: string;
  readonly contractAddress?: string;
}
const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8")) as {
  readonly transactions?: readonly BroadcastTransaction[];
};
const addressKeys: Readonly<Record<string, string>> = {
  SeriesRegistry: "OPTIONS_SERIES_REGISTRY_ADDRESS",
  OptionToken: "OPTION_TOKEN_ADDRESS",
  OptionsVault: "OPTIONS_VAULT_ADDRESS",
  QuoteVerifier: "QUOTE_VERIFIER_ADDRESS",
  SettlementEngine: "OPTIONS_SETTLEMENT_ENGINE_ADDRESS",
  RiskManager: "OPTIONS_RISK_MANAGER_ADDRESS",
  OptionsMarket: "OPTIONS_MARKET_ADDRESS",
};
const resolved = new Map<string, string>();
for (const transaction of broadcast.transactions ?? []) {
  const key = transaction.contractName ? addressKeys[transaction.contractName] : undefined;
  const address = transaction.contractAddress;
  if (key && address && /^0x[0-9a-fA-F]{40}$/.test(address)) resolved.set(key, address);
}
if (resolved.size !== Object.keys(addressKeys).length) throw new Error("Broadcast is missing Options deployments");

const lines = readFileSync(environmentPath, "utf8").split(/\r?\n/);
for (const [key, address] of resolved) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${address}`;
  else lines.push(`${key}=${address}`);
}
writeFileSync(environmentPath, lines.join("\n"));
chmodSync(environmentPath, 0o600);
console.log(`Recorded ${resolved.size} Options addresses in ${environmentPath}`);
