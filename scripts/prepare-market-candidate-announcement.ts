interface AnnouncementCandidate {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly company_name: string;
  readonly token_address: string;
  readonly identity_approval_status: string;
  readonly token_live: boolean;
  readonly public_available_at: string | null;
}

const databaseUrl = new URL(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
const environment = networkEnvironment(required("APP_ENV"));
const chainId = positiveInteger("CHAIN_ID");
const candidateId = required("CANDIDATE_ID");
const explorerUrl = httpsUrl("BLOCK_EXPLORER_URL");
const approvalReference = required("CANDIDATE_COMMUNICATION_APPROVAL_REFERENCE");
if (databaseUrl.protocol !== "https:" || !secretKey.startsWith("sb_secret_")) throw new Error("Server-only database configuration is invalid");
if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("CANDIDATE_ID is invalid");
if (approvalReference.length < 3 || approvalReference.length > 200) throw new Error("Communication approval reference is invalid");

const url = new URL("/rest/v1/market_candidates", databaseUrl);
url.search = new URLSearchParams({ select: "candidate_id,symbol,company_name,token_address,identity_approval_status,token_live,public_available_at", environment: `eq.${environment}`, chain_id: `eq.${chainId}`, candidate_id: `eq.${candidateId}`, limit: "1" }).toString();
const response = await fetch(url, { headers: { apikey: secretKey }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Candidate announcement read failed with status ${response.status}`);
const candidate = (await response.json() as AnnouncementCandidate[])[0];
if (!candidate || candidate.identity_approval_status !== "approved" || !candidate.token_live || !candidate.public_available_at) {
  throw new Error("Candidate is not approved for a public market announcement");
}
const addressUrl = `${explorerUrl.toString().replace(/\/$/, "")}/address/${candidate.token_address}`;
const headline = `${candidate.symbol} Stock Token market is live on Floats.`;
const contract = `Canonical contract: ${candidate.token_address}`;
console.log(JSON.stringify({
  candidateId,
  approvalReference,
  generatedAt: new Date().toISOString(),
  publicationMode: "manual_approval_required",
  x: { text: `${headline}\n\n${contract}\n\nVerify onchain: ${addressUrl}` },
  telegram: { text: `${headline}\n${candidate.company_name}\n\n${contract}\n\nOnchain verification: ${addressUrl}` },
}, null, 2));

function required(key: string): string { const value = process.env[key]?.trim(); if (!value) throw new Error(`${key} is required`); return value; }
function positiveInteger(key: string): number { const value = Number(required(key)); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} is invalid`); return value; }
function networkEnvironment(value: string): "testnet" | "mainnet" { if (value !== "testnet" && value !== "mainnet") throw new Error("APP_ENV is invalid"); return value; }
function httpsUrl(key: string): URL { const value = new URL(required(key)); if (value.protocol !== "https:") throw new Error(`${key} must use HTTPS`); return value; }
