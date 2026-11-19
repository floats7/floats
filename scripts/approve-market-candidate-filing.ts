import { readFileSync } from "node:fs";

const [environmentPath, candidateId, accessionNumber, reviewer] = process.argv.slice(2);
if (!environmentPath || !candidateId || !accessionNumber || !reviewer) {
  throw new Error("Usage: approve-market-candidate-filing.ts <environment-file> <candidate-id> <accession-number> <reviewer>");
}
if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("Candidate ID is invalid");
if (!/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber)) throw new Error("Accession number is invalid");
if (reviewer.trim().length < 2) throw new Error("Reviewer is invalid");

const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");

const response = await fetch(new URL("/rest/v1/rpc/approve_market_candidate_public_filing", required(env, "SUPABASE_URL")), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    apikey: required(env, "SUPABASE_SECRET_KEY"),
  },
  body: JSON.stringify({
    p_environment: environment,
    p_chain_id: chainId,
    p_candidate_id: candidateId,
    p_accession_number: accessionNumber,
    p_reviewed_by: reviewer.trim(),
  }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Public filing approval failed with status ${response.status}`);
const changed = await response.json() as boolean;
console.log(changed
  ? `Approved ${candidateId} public filing evidence and advanced the IPO stage.`
  : `${candidateId} public filing approval was already applied; no state changed.`);

function parseEnv(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0 && !line.startsWith("#")) values.set(line.slice(0, index), line.slice(index + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
