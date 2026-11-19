import { readFileSync } from "node:fs";
import { Client } from "pg";
import { postgresTls } from "../packages/database/src/postgres-tls.ts";

const [environmentPath, candidateId = "openai"] = process.argv.slice(2);
if (!environmentPath) throw new Error("Usage: verify-market-candidate-ipo-schema.ts <environment-file> [candidate-id]");
if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("Candidate ID is invalid");
const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");

const client = new Client({
  connectionString: required(env, "SUPABASE_DB_URL"),
  ssl: postgresTls(env.get("SUPABASE_DB_CA_BASE64"), environment === "mainnet"),
  application_name: `floats-${environment}-ipo-schema-verifier`,
});
await client.connect();

try {
  await client.query("begin");
  const candidate = await client.query<{ ipo_stage: string | null; ticker_announced: boolean; stage_source_url: string | null }>(`
    select ipo_stage, ticker_announced, stage_source_url
    from public.market_candidates
    where environment = $1 and chain_id = $2 and candidate_id = $3
    for update
  `, [environment, chainId, candidateId]);
  if (candidate.rowCount !== 1) throw new Error("Candidate was not found");
  if (candidate.rows[0]?.ipo_stage !== "confidential_filed"
      || candidate.rows[0]?.ticker_announced !== false
      || !candidate.rows[0]?.stage_source_url?.startsWith("https://")) {
    throw new Error("Candidate initial IPO evidence is invalid");
  }

  await expectRejected("stage cannot be cleared", `
    update public.market_candidates set ipo_stage = null
    where environment = $1 and chain_id = $2 and candidate_id = $3
  `);
  await expectRejected("roadshow requires price range", `
    update public.market_candidates set ipo_stage = 'roadshow'
    where environment = $1 and chain_id = $2 and candidate_id = $3
  `);
  await expectRejected("stage evidence requires timestamp", `
    update public.market_candidates set stage_updated_at = null
    where environment = $1 and chain_id = $2 and candidate_id = $3
  `);

  const audit = await client.query<{ count: string }>(`
    select count(*)::text as count
    from public.market_candidate_ipo_stage_events
    where environment = $1 and chain_id = $2 and candidate_id = $3
      and next_stage = 'confidential_filed'
  `, [environment, chainId, candidateId]);
  if (BigInt(audit.rows[0]?.count ?? "0") < 1n) throw new Error("Initial IPO-stage audit event is missing");

  console.log(JSON.stringify({
    environment,
    candidateId,
    stage: "confidential_filed",
    rejectedInvalidTransitions: 3,
    auditEventPresent: true,
  }));
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}

async function expectRejected(label: string, statement: string): Promise<void> {
  const savepoint = `verify_${label.replaceAll(/[^a-z]+/g, "_")}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await client.query(statement, [environment, chainId, candidateId]);
  } catch {
    await client.query(`rollback to savepoint ${savepoint}`);
    return;
  }
  throw new Error(`Database accepted invalid IPO state: ${label}`);
}

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
