import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

const path = process.argv[2];
if (!path || !/^\.env\.(testnet|mainnet)$/.test(path)) {
  throw new Error("Usage: prepare-options-secrets.ts <.env.testnet|.env.mainnet>");
}

const source = readFileSync(path, "utf8");
const lines = source.split(/\r?\n/);
const values = new Map<string, string>();
for (const line of lines) {
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
}

const prepared: string[] = [];
const setMissing = (key: string, value: string): void => {
  if (values.get(key)?.trim()) return;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  values.set(key, value);
  prepared.push(key);
};

setMissing("OPTIONS_QUOTE_SIGNER_PRIVATE_KEY", `0x${randomBytes(32).toString("hex")}`);
const signerKey = values.get("OPTIONS_QUOTE_SIGNER_PRIVATE_KEY");
if (!signerKey || !/^0x[0-9a-fA-F]{64}$/.test(signerKey)) {
  throw new Error("OPTIONS_QUOTE_SIGNER_PRIVATE_KEY is invalid");
}
setMissing("OPTIONS_QUOTE_SIGNER_ADDRESS", privateKeyToAccount(signerKey as `0x${string}`).address);

const keeperKey = values.get("KEEPER_PRIVATE_KEY")?.trim();
const keeperAddress = values.get("KEEPER_ADDRESS")?.trim();
if (keeperKey) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(keeperKey)) throw new Error("KEEPER_PRIVATE_KEY is invalid");
  const derived = privateKeyToAccount(keeperKey as `0x${string}`).address;
  if (keeperAddress && keeperAddress.toLowerCase() !== derived.toLowerCase()) {
    throw new Error("KEEPER_PRIVATE_KEY does not match KEEPER_ADDRESS");
  }
  setMissing("KEEPER_ADDRESS", derived);
} else if (!keeperAddress) {
  const generated = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  setMissing("KEEPER_PRIVATE_KEY", generated);
  setMissing("KEEPER_ADDRESS", privateKeyToAccount(generated).address);
}
setMissing("KEEPER_POLL_INTERVAL_MS", "15000");
setMissing("KEEPER_RUN_ONCE", "false");
setMissing("OPTIONS_DESIRED_SERIES_JSON", "[]");

const signerToken = values.get("SIGNER_INTERNAL_AUTH_TOKEN")?.trim() || randomBytes(32).toString("base64url");
setMissing("SIGNER_INTERNAL_AUTH_TOKEN", signerToken);
setMissing("OPTIONS_QUOTE_SIGNER_AUTH_TOKEN", signerToken);

const pricerToken = values.get("PRICER_INTERNAL_AUTH_TOKEN")?.trim() || randomBytes(32).toString("base64url");
setMissing("PRICER_INTERNAL_AUTH_TOKEN", pricerToken);
setMissing("OPTIONS_PRICER_AUTH_TOKEN", pricerToken);

setMissing("OPTIONS_RISK_FREE_RATE", "0.05");
setMissing("OPTIONS_MAX_OBSERVATION_DELAY_SECONDS", "259200");
setMissing("OPTIONS_UTILIZATION_LIMIT_BPS", "8000");
setMissing("OPTIONS_UNDERLYING_LIMIT_BPS", "5000");
setMissing("OPTIONS_EXPIRY_LIMIT_BPS", "6000");
setMissing("OPTIONS_SERIES_LIMIT_BPS", "2500");

writeFileSync(path, lines.join("\n"), { mode: 0o600 });
chmodSync(path, 0o600);
console.log(`Prepared ${prepared.length} missing Options variables in ${path}; secret values were not printed.`);
