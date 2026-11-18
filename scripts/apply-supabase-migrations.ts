import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Client } from "pg";
import { postgresTls } from "../packages/database/src/postgres-tls.ts";

const migrationsDirectory = "supabase/migrations";
const migrationPattern = /^\d{12}_[a-z0-9_]+\.sql$/;
const lockId = 7_604_663_001;

function fail(message: string): never {
  throw new Error(`Supabase migration failed: ${message}`);
}

function readEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const [index, rawLine] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail(`invalid assignment at ${path}:${index + 1}`);
    const key = line.slice(0, separator);
    if (values.has(key)) fail(`duplicate variable ${key}`);
    values.set(key, line.slice(separator + 1));
  }
  return values;
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function unwrapMigration(sql: string, filename: string): string {
  const withoutBegin = sql.replace(/^\s*begin;\s*/i, "");
  const withoutCommit = withoutBegin.replace(/\s*commit;\s*$/i, "");
  if (withoutBegin === sql || withoutCommit === withoutBegin) {
    fail(`${filename} must have one outer BEGIN/COMMIT wrapper`);
  }
  return withoutCommit;
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: apply-supabase-migrations.ts <environment-file>");

const values = readEnvironment(environmentPath);
const databaseUrl = values.get("SUPABASE_DB_URL");
if (!databaseUrl) fail("SUPABASE_DB_URL is required in the selected environment file");

const environment = values.get("APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") fail("APP_ENV is invalid");

const files = readdirSync(migrationsDirectory)
  .filter((filename) => filename.endsWith(".sql"))
  .sort();
if (files.length === 0) fail("no migration files found");
for (const filename of files) {
  if (!migrationPattern.test(filename)) fail(`invalid migration filename: ${filename}`);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: postgresTls(values.get("SUPABASE_DB_CA_BASE64"), environment === "mainnet"),
  application_name: `floats-${environment}-migrator`,
});
await client.connect();

try {
  await client.query("select pg_advisory_lock($1)", [lockId]);
  await client.query("create schema if not exists supabase_migrations");
  await client.query(`
    do $$
    begin
      if to_regclass('supabase_migrations.floats_schema_migrations') is null
        and to_regclass('supabase_migrations.' || 'flo' || 'at_schema_migrations') is not null
      then
        execute 'alter table supabase_migrations.' || 'flo' ||
          'at_schema_migrations rename to floats_schema_migrations';
      end if;
    end
    $$
  `);
  await client.query(`
    create table if not exists supabase_migrations.floats_schema_migrations (
      version text primary key,
      checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz not null default now()
    )
  `);

  for (const filename of files) {
    const path = join(migrationsDirectory, filename);
    const source = readFileSync(path, "utf8");
    const digest = checksum(source);
    const version = basename(filename, ".sql");
    const existing = await client.query<{ checksum: string }>(
      "select checksum from supabase_migrations.floats_schema_migrations where version = $1",
      [version],
    );

    if (existing.rowCount === 1) {
      if (existing.rows[0]?.checksum !== digest) fail(`${filename} changed after it was applied`);
      console.log(`Skipped ${filename} (already applied)`);
      continue;
    }

    await client.query("begin");
    try {
      await client.query(unwrapMigration(source, filename));
      await client.query(
        "insert into supabase_migrations.floats_schema_migrations (version, checksum) values ($1, $2)",
        [version, digest],
      );
      await client.query("commit");
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
  await client.end();
}

console.log(`Supabase ${environment} migrations are current`);
