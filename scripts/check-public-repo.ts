import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";

const root = process.cwd();
const allowedEnvironmentExamples = new Set([".env.testnet.example", ".env.mainnet.example"]);
const excludedDirectories = new Set([
  ".agents",
  ".aws",
  ".claude",
  ".codex",
  ".cursor",
  ".direnv",
  ".git",
  ".github-cache",
  ".idea",
  ".netlify",
  ".next",
  ".supabase",
  ".turbo",
  ".vercel",
  ".vscode",
  ".windsurf",
  "artifacts",
  "broadcast",
  "cache",
  "coverage",
  "dist",
  "docs",
  "deployments",
  "node_modules",
  "out",
  "temp",
  "tmp",
  "typechain-types",
]);
const excludedFiles = new Set([".DS_Store"]);
const excludedExtensions = new Set([".tsbuildinfo"]);
const privateExtensions = new Set([
  ".db",
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
  ".sqlite",
  ".sqlite3",
]);

interface Rule {
  readonly label: string;
  readonly pattern: RegExp;
}

const secretRules: readonly Rule[] = [
  { label: "private key assignment", pattern: /(?:PRIVATE_KEY|SECRET_KEY)\s*[=:]\s*["']?0x[0-9a-fA-F]{64}\b/ },
  { label: "PEM private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/ },
  { label: "database credential URL", pattern: /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s/@]+@[^\s]+/i },
  { label: "credential-bearing URL", pattern: /\bhttps?:\/\/[^\s:/]+:[^\s/@]+@[^\s]+/i },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "OpenAI-style secret", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: "Stripe live secret", pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/ },
  { label: "JWT token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    label: "non-empty sensitive environment assignment",
    pattern: /^(?:SUPABASE_DB_URL|SUPABASE_SECRET_KEY|DEPLOYER_PRIVATE_KEY|ADMIN_PRIVATE_KEY|GUARDIAN_PRIVATE_KEY|KEEPER_PRIVATE_KEY|API_KEY|AUTH_TOKEN)[ \t]*=[ \t]*[^\s#][^\r\n]*$/m,
  },
];

const violations: string[] = [];
const publishableFiles: string[] = [];

walk(root);
verifyIgnorePolicy();

for (const file of publishableFiles) {
  const repositoryPath = relative(root, file).split(sep).join("/");
  const fileName = basename(file);
  if (fileName.startsWith(".env") && !allowedEnvironmentExamples.has(fileName)) {
    continue;
  }
  if (privateExtensions.has(extname(fileName).toLowerCase())) {
    violations.push(`${repositoryPath}: private file extension is not publishable`);
    continue;
  }
  if (statSync(file).size > 5 * 1024 * 1024) continue;

  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const rule of secretRules) {
    if (rule.pattern.test(content)) violations.push(`${repositoryPath}: ${rule.label}`);
  }
}

if (violations.length > 0) {
  console.error("Public repository guard failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Public repository guard passed (${publishableFiles.length} publishable files scanned)`);
}

function walk(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedFiles.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) walk(path);
      continue;
    }
    if (entry.isFile() && !excludedExtensions.has(extname(entry.name).toLowerCase())) {
      publishableFiles.push(path);
    }
  }
}

function verifyIgnorePolicy(): void {
  const ignoreFile = readFileSync(join(root, ".gitignore"), "utf8");
  const requiredRules = [
    ".env.*",
    ".next/",
    "*.tsbuildinfo",
    "broadcast/",
    "contracts/cache/",
    "contracts/deployments/",
    "docs/",
    "node_modules/",
    "secrets/",
    "credentials/",
    ".codex/",
    ".agents/",
    ".claude/",
    ".aws/",
  ];
  for (const rule of requiredRules) {
    if (!ignoreFile.split(/\r?\n/).includes(rule)) {
      violations.push(`.gitignore: missing required private-output rule ${rule}`);
    }
  }
}
