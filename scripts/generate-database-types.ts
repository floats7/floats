import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const [environmentPath = ".env.testnet"] = process.argv.slice(2);
if (environmentPath !== ".env.testnet" && environmentPath !== ".env.mainnet") {
  throw new Error("Environment file must be .env.testnet or .env.mainnet");
}

const databaseUrl = readEnvValue(environmentPath, "SUPABASE_DB_URL");
const result = spawnSync(
  "npx",
  ["--no-install", "supabase", "gen", "types", "typescript", "--db-url", databaseUrl, "--schema", "public"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

if (result.status !== 0) {
  throw new Error(`Database type generation failed: ${redact(result.stderr || result.stdout, databaseUrl)}`);
}
if (!result.stdout.includes("export type Database")) {
  throw new Error("Database type generation returned an unexpected artifact");
}

const outputPath = "packages/database/src/database.generated.ts";
const temporaryPath = `${outputPath}.tmp`;
writeFileSync(temporaryPath, result.stdout, { encoding: "utf8", mode: 0o600 });
renameSync(temporaryPath, outputPath);
console.log(`Generated ${outputPath} from ${environmentPath}; credentials were not printed.`);

function readEnvValue(path: string, key: string) {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1 || line.slice(0, separator).trim() !== key) continue;
    const value = unquote(line.slice(separator + 1).trim());
    if (value) return value;
  }
  throw new Error(`${key} is required in ${path}`);
}

function unquote(value: string) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function redact(message: string, secret: string) {
  return message.replaceAll(secret, "[REDACTED]").trim();
}
