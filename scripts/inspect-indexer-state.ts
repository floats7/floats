import { readFileSync } from "node:fs";
import { Client } from "pg";

function loadEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const environmentPath = process.argv[2];
if (!environmentPath) throw new Error("usage: inspect-indexer-state.ts <environment-file>");
const values = loadEnvironment(environmentPath);
const environment = required(values, "APP_ENV");
const chainId = Number(required(values, "CHAIN_ID"));
const client = new Client({
  connectionString: required(values, "SUPABASE_DB_URL"),
  application_name: `floats-${environment}-inspection`,
});

await client.connect();
try {
  const result = await client.query<{
    next_block: string;
    last_finalized_block: string | null;
    health_status: string | null;
    event_count: string;
    nav_snapshot_count: string;
    holding_snapshot_count: string;
    user_transaction_count: string;
    migration_count: string;
  }>(
    `select
       checkpoint.next_block::text,
       checkpoint.last_finalized_block::text,
       health.status::text as health_status,
       (select count(*)::text from public.protocol_events where environment = $1 and chain_id = $2 and canonical) as event_count,
       (select count(*)::text from public.nav_snapshots where environment = $1 and chain_id = $2 and canonical) as nav_snapshot_count,
       (select count(*)::text from public.holding_snapshots where environment = $1 and chain_id = $2 and canonical) as holding_snapshot_count,
       (select count(*)::text from public.user_transactions where environment = $1 and chain_id = $2 and canonical) as user_transaction_count,
       (select count(*)::text from supabase_migrations.floats_schema_migrations) as migration_count
     from public.chain_checkpoints checkpoint
     left join public.ingestion_health health
       on health.environment = checkpoint.environment
      and health.chain_id = checkpoint.chain_id
      and health.consumer = checkpoint.consumer
     where checkpoint.environment = $1
       and checkpoint.chain_id = $2
       and checkpoint.consumer = 'core-events'`,
    [environment, chainId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Indexer checkpoint was not found");
  console.log(JSON.stringify({ environment, chainId, ...row }));
} finally {
  await client.end();
}
