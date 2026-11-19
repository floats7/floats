import { readFileSync } from "node:fs";
import { Client } from "pg";
import { postgresTls } from "../packages/database/src/postgres-tls.ts";

const [environmentPath] = process.argv.slice(2);
if (!environmentPath) throw new Error("Usage: inspect-market-candidate-schema.ts <environment-file>");
const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const client = new Client({
  connectionString: required(env, "SUPABASE_DB_URL"),
  ssl: postgresTls(env.get("SUPABASE_DB_CA_BASE64"), environment === "mainnet"),
  application_name: `floats-${environment}-schema-inspector`,
});
await client.connect();
try {
  const openAiMigrationVersions = [
    "202611190012_market_candidate_ipo_stages",
    "202611190013_market_candidate_filing_monitoring",
    "202611190014_market_candidate_impostor_aliases",
    "202611190015_market_candidate_filing_approval",
    "202611190016_market_candidate_impostor_source",
    "202611190017_market_candidate_announced_ticker_evidence",
  ];
  const columns = await client.query<{ column_name: string }>(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'market_candidates'
    order by ordinal_position
  `);
  const tables = await client.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name like 'market_candidate_%'
    order by table_name
  `);
  const functions = await client.query<{ routine_name: string }>(`
    select routine_name
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name = 'approve_market_candidate_public_filing'
  `);
  const constraints = await client.query<{ constraint_name: string }>(`
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'market_candidates'
      and constraint_name in (
        'market_candidates_ipo_stage_evidence',
        'market_candidates_announced_ticker_evidence'
      )
    order by constraint_name
  `);
  const appliedMigrations = await client.query<{ version: string }>(`
    select version
    from supabase_migrations.floats_schema_migrations
    where version = any($1::text[])
    order by version
  `, [openAiMigrationVersions]);
  const columnNames = columns.rows.map((row) => row.column_name);
  const tableNames = tables.rows.map((row) => row.table_name);
  const functionNames = functions.rows.map((row) => row.routine_name);
  const constraintNames = constraints.rows.map((row) => row.constraint_name);
  const appliedMigrationVersions = appliedMigrations.rows.map((row) => row.version);
  const requiredColumns = [
    "ipo_stage", "ticker_announced", "exchange", "price_range_low", "price_range_high",
    "ipo_price", "stage_source_url", "stage_updated_at", "impostor_aliases",
  ];
  const requiredTables = ["market_candidate_filing_observations", "market_candidate_ipo_stage_events"];
  const requiredFunctions = ["approve_market_candidate_public_filing"];
  const requiredConstraints = [
    "market_candidates_ipo_stage_evidence", "market_candidates_announced_ticker_evidence",
  ];
  const missing = {
    columns: requiredColumns.filter((name) => !columnNames.includes(name)),
    tables: requiredTables.filter((name) => !tableNames.includes(name)),
    functions: requiredFunctions.filter((name) => !functionNames.includes(name)),
    constraints: requiredConstraints.filter((name) => !constraintNames.includes(name)),
  };
  console.log(JSON.stringify({
    environment,
    openAiPipelineSchemaReady: Object.values(missing).every((items) => items.length === 0),
    openAiMigrations: {
      applied: appliedMigrationVersions,
      pending: openAiMigrationVersions.filter((version) => !appliedMigrationVersions.includes(version)),
    },
    missing,
    marketCandidateColumns: columnNames,
    relatedTables: tableNames,
  }, null, 2));
} finally {
  await client.end();
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
