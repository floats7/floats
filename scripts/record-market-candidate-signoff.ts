interface SignoffInput {
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly candidateId: string;
  readonly tier: "market" | "spot" | "options" | "index";
  readonly decision: "approved" | "rejected";
  readonly operatorReference: string;
  readonly reviewerReference: string;
  readonly evidenceReferences: readonly string[];
  readonly governanceOrCanaryReference: string;
  readonly rationale: string;
}

const databaseUrl = new URL(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
if (databaseUrl.protocol !== "https:" || !secretKey.startsWith("sb_secret_")) {
  throw new Error("Server-only database configuration is invalid");
}
const input = readInput(process.env);
const readinessUrl = new URL(`/api/market-candidates/${encodeURIComponent(input.candidateId)}/readiness`, required("BACKEND_API_URL"));
const readinessResponse = await fetch(readinessUrl, { signal: AbortSignal.timeout(30_000) });
if (!readinessResponse.ok) throw new Error(`Candidate readiness read failed with status ${readinessResponse.status}`);
const readinessSnapshot: unknown = await readinessResponse.json();
if (!readinessSnapshot || typeof readinessSnapshot !== "object" || Array.isArray(readinessSnapshot)) {
  throw new Error("Candidate readiness response is invalid");
}

const response = await fetch(new URL("/rest/v1/rpc/record_market_candidate_operator_signoff", databaseUrl), {
  method: "POST",
  headers: { "content-type": "application/json", apikey: secretKey },
  body: JSON.stringify({
    p_environment: input.environment,
    p_chain_id: input.chainId,
    p_candidate_id: input.candidateId,
    p_tier: input.tier,
    p_decision: input.decision,
    p_operator_reference: input.operatorReference,
    p_reviewer_reference: input.reviewerReference,
    p_evidence_references: input.evidenceReferences,
    p_readiness_snapshot: readinessSnapshot,
    p_governance_or_canary_reference: input.governanceOrCanaryReference,
    p_rationale: input.rationale,
  }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Candidate sign-off write failed with status ${response.status}`);
const signoffId: unknown = await response.json();
console.log(JSON.stringify({ event: "candidate_operator_signoff_recorded", signoffId, ...input }));

export function readInput(environment: NodeJS.ProcessEnv): SignoffInput {
  const appEnvironment = requiredFrom(environment, "APP_ENV");
  if (appEnvironment !== "testnet" && appEnvironment !== "mainnet") throw new Error("APP_ENV is invalid");
  const chainId = Number(requiredFrom(environment, "CHAIN_ID"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");
  const candidateId = requiredFrom(environment, "CANDIDATE_ID");
  if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("CANDIDATE_ID is invalid");
  const tier = requiredFrom(environment, "CANDIDATE_SIGNOFF_TIER");
  if (tier !== "market" && tier !== "spot" && tier !== "options" && tier !== "index") throw new Error("CANDIDATE_SIGNOFF_TIER is invalid");
  const decision = requiredFrom(environment, "CANDIDATE_SIGNOFF_DECISION");
  if (decision !== "approved" && decision !== "rejected") throw new Error("CANDIDATE_SIGNOFF_DECISION is invalid");
  const operatorReference = bounded(environment, "CANDIDATE_SIGNOFF_OPERATOR_REFERENCE", 3, 200);
  const reviewerReference = bounded(environment, "CANDIDATE_SIGNOFF_REVIEWER_REFERENCE", 3, 200);
  if (operatorReference === reviewerReference) throw new Error("Operator and reviewer references must be independent");
  const evidenceReferences = stringArray(environment, "CANDIDATE_SIGNOFF_EVIDENCE_REFERENCES_JSON");
  const governanceOrCanaryReference = environment.CANDIDATE_SIGNOFF_GOVERNANCE_OR_CANARY_REFERENCE?.trim() ?? "";
  if (governanceOrCanaryReference.length > 300) throw new Error("Governance or canary reference is invalid");
  const rationale = bounded(environment, "CANDIDATE_SIGNOFF_RATIONALE", 3, 1000);
  return { environment: appEnvironment, chainId, candidateId, tier, decision, operatorReference, reviewerReference, evidenceReferences, governanceOrCanaryReference, rationale };
}

function required(key: string): string { return requiredFrom(process.env, key); }
function requiredFrom(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
function bounded(environment: NodeJS.ProcessEnv, key: string, minimum: number, maximum: number): string {
  const value = requiredFrom(environment, key);
  if (value.length < minimum || value.length > maximum) throw new Error(`${key} is invalid`);
  return value;
}
function stringArray(environment: NodeJS.ProcessEnv, key: string): readonly string[] {
  const parsed: unknown = JSON.parse(requiredFrom(environment, key));
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((value) => typeof value !== "string" || value.trim().length < 3 || value.length > 500)) {
    throw new Error(`${key} is invalid`);
  }
  return parsed.map((value) => (value as string).trim());
}
