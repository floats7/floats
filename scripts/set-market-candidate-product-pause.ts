interface ProductControlInput {
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly candidateId: string;
  readonly product: "spot" | "options";
  readonly paused: boolean;
  readonly reason: string;
  readonly operatorReference: string;
}

const databaseUrl = new URL(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
if (databaseUrl.protocol !== "https:" || !secretKey.startsWith("sb_secret_")) {
  throw new Error("Server-only database configuration is invalid");
}
const input = readInput(process.env);
const response = await fetch(new URL("/rest/v1/rpc/set_market_candidate_product_pause", databaseUrl), {
  method: "POST",
  headers: { "content-type": "application/json", apikey: secretKey },
  body: JSON.stringify({
    p_environment: input.environment,
    p_chain_id: input.chainId,
    p_candidate_id: input.candidateId,
    p_product: input.product,
    p_paused: input.paused,
    p_reason: input.reason,
    p_operator_reference: input.operatorReference,
  }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Candidate product control failed with status ${response.status}`);
console.log(JSON.stringify({ event: "candidate_product_control_updated", ...input }));

export function readInput(environment: NodeJS.ProcessEnv): ProductControlInput {
  const appEnvironment = requiredFrom(environment, "APP_ENV");
  if (appEnvironment !== "testnet" && appEnvironment !== "mainnet") throw new Error("APP_ENV is invalid");
  const product = requiredFrom(environment, "CANDIDATE_PRODUCT");
  if (product !== "spot" && product !== "options") throw new Error("CANDIDATE_PRODUCT is invalid");
  const paused = requiredFrom(environment, "CANDIDATE_PRODUCT_PAUSED");
  if (paused !== "true" && paused !== "false") throw new Error("CANDIDATE_PRODUCT_PAUSED is invalid");
  const chainId = Number(requiredFrom(environment, "CHAIN_ID"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");
  const candidateId = requiredFrom(environment, "CANDIDATE_ID");
  if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("CANDIDATE_ID is invalid");
  const reason = requiredFrom(environment, "CANDIDATE_PRODUCT_CONTROL_REASON");
  const operatorReference = requiredFrom(environment, "CANDIDATE_PRODUCT_CONTROL_REFERENCE");
  if (reason.length < 3 || reason.length > 500) throw new Error("Control reason is invalid");
  if (operatorReference.length < 3 || operatorReference.length > 200) throw new Error("Operator reference is invalid");
  return { environment: appEnvironment, chainId, candidateId, product, paused: paused === "true", reason, operatorReference };
}

function required(key: string): string { return requiredFrom(process.env, key); }
function requiredFrom(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
