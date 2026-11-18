import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createPublicClient, http, parseAbi } from "viem";

const environmentPath = process.argv[2];
if (!environmentPath) throw new Error("Usage: seed-options-testnet.ts <environment-file>");

const values = new Map<string, string>();
for (const rawLine of readFileSync(environmentPath, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) throw new Error(`Invalid assignment in ${environmentPath}`);
  values.set(line.slice(0, separator), line.slice(separator + 1));
}

if (values.get("APP_ENV") !== "testnet") {
  throw new Error("Testnet volatility fixtures cannot run outside APP_ENV=testnet");
}
const chainId = Number(required("CHAIN_ID"));
const database = new Client({
  connectionString: required("SUPABASE_DB_URL"),
  application_name: "floats-options-testnet-seed",
});
const rpc = createPublicClient({
  transport: http(required("RPC_URL")),
});
const tokens = await rpc.readContract({
  address: required("INDEX_REGISTRY_ADDRESS") as `0x${string}`,
  abi: parseAbi(["function getActiveTokens() view returns (address[])"]),
  functionName: "getActiveTokens",
});

await database.connect();
try {
  await database.query("begin");
  for (const token of tokens) {
    await database.query(
      `insert into public.options_volatility_observations
         (environment, chain_id, underlying, source, annualized_volatility, observed_at)
       values ('testnet', $1, $2, 'basket-realized', 0.60, now())
       on conflict do nothing`,
      [chainId, token.toLowerCase()],
    );
  }
  await database.query("commit");
} catch (error) {
  await database.query("rollback");
  throw error;
} finally {
  await database.end();
}
console.log(`Seeded testnet-only volatility observations for ${tokens.length} active assets`);

function required(name: string): string {
  const value = values.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
