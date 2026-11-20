import { readFileSync } from "node:fs";

const [environmentPath, inputPath] = process.argv.slice(2);
if (!environmentPath || !inputPath) {
  throw new Error("Usage: update-market-candidate-logos.ts <environment-file> <logos.json>");
}

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");

const input: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(input) || input.length === 0) throw new Error("Logo input must be a non-empty array");
const logos = input.map((value, index) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Logo ${index} is invalid`);
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(row.id)) throw new Error(`Logo ${index} id is invalid`);
  if (typeof row.logoUrl !== "string" || new URL(row.logoUrl).protocol !== "https:") throw new Error(`Logo ${index} URL is invalid`);
  return { id: row.id, logoUrl: row.logoUrl };
});
if (new Set(logos.map(({ id }) => id)).size !== logos.length) throw new Error("Logo candidate IDs must be unique");

for (const { id, logoUrl } of logos) {
  const url = new URL("/rest/v1/market_candidates", required(env, "SUPABASE_URL"));
  url.search = new URLSearchParams({
    environment: `eq.${environment}`,
    chain_id: `eq.${chainId}`,
    candidate_id: `eq.${id}`,
  }).toString();
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: required(env, "SUPABASE_SECRET_KEY"),
      prefer: "return=representation",
    },
    body: JSON.stringify({ logo_url: logoUrl, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Logo update failed for ${id} with status ${response.status}`);
  const rows = await response.json() as unknown[];
  if (rows.length !== 1) throw new Error(`Logo update target was not unique for ${id}`);
}

console.log(`Updated ${logos.length} curated market logos in ${environment}; no secret values were printed.`);

function parseEnv(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.startsWith("#")) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
