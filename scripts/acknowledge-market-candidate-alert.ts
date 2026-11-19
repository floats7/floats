const databaseUrl = new URL(required("SUPABASE_URL"));
const secretKey = required("SUPABASE_SECRET_KEY");
const environment = required("APP_ENV");
if (databaseUrl.protocol !== "https:" || !secretKey.startsWith("sb_secret_")) throw new Error("Server-only database configuration is invalid");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = positiveInteger("CHAIN_ID");
const alertId = positiveInteger("CANDIDATE_ALERT_ID");
const acknowledgedBy = bounded("CANDIDATE_ALERT_ACKNOWLEDGED_BY", 3, 100);
const note = bounded("CANDIDATE_ALERT_ACKNOWLEDGEMENT_NOTE", 3, 500);
const response = await fetch(new URL("/rest/v1/rpc/acknowledge_market_candidate_alert", databaseUrl), {
  method: "POST",
  headers: { "content-type": "application/json", apikey: secretKey },
  body: JSON.stringify({ p_environment: environment, p_chain_id: chainId, p_alert_id: alertId, p_acknowledged_by: acknowledgedBy, p_note: note }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Alert acknowledgement failed with status ${response.status}`);
console.log(JSON.stringify({ event: "candidate_alert_acknowledged", environment, chainId, alertId, acknowledgedBy }));

function required(key: string): string { const value = process.env[key]?.trim(); if (!value) throw new Error(`${key} is required`); return value; }
function positiveInteger(key: string): number { const value = Number(required(key)); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} is invalid`); return value; }
function bounded(key: string, minimum: number, maximum: number): string { const value = required(key); if (value.length < minimum || value.length > maximum) throw new Error(`${key} is invalid`); return value; }
