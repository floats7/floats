import { decodeFunctionResult, encodeFunctionData, isAddress, parseAbi, type Address } from "viem";
import { createJsonRpcReader, type JsonRpcReader } from "./market-candidate-identity-verifier.ts";

const RISK_ABI = parseAbi([
  "function underlyingExposure6(address underlying) view returns (uint256)",
  "function limits() view returns (uint16 utilizationBps,uint16 underlyingBps,uint16 expiryBps,uint16 seriesBps)",
  "function vault() view returns (address)",
]);
const VAULT_ABI = parseAbi(["function totalAssets() view returns (uint256)"]);

export interface CandidateOptionsRiskRoute {
  readonly candidateId: string;
  readonly tokenAddress: string;
  readonly riskManagerAddress: string;
  readonly warningUtilizationBps?: number;
}

export interface CandidateOptionsRiskAlert {
  readonly severity: "critical";
  readonly code: "OPTIONS_EXPOSURE_APPROACHING_CAP";
  readonly candidateId: string;
  readonly tokenAddress: string;
  readonly riskManagerAddress: string;
  readonly capUtilizationBps: number;
  readonly observedAt: string;
}

export interface CandidateOptionsRiskSyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly rpcUrl: URL;
  readonly optionsRiskRoutes: readonly CandidateOptionsRiskRoute[];
  readonly fetch?: typeof globalThis.fetch;
  readonly onAlert?: (alert: CandidateOptionsRiskAlert) => Promise<void>;
}

export interface OptionsRiskEvidence {
  readonly exposure6: string;
  readonly capital6: string;
  readonly maximumExposure6: string;
  readonly capUtilizationBps: number;
  readonly warning: boolean;
}

export async function measureOptionsRisk(reader: JsonRpcReader, route: CandidateOptionsRiskRoute): Promise<OptionsRiskEvidence> {
  validateRoute(route);
  const manager = route.riskManagerAddress as Address;
  const [exposureResult, limitsResult, vaultResult] = await Promise.all([
    reader.call(manager, encodeFunctionData({ abi: RISK_ABI, functionName: "underlyingExposure6", args: [route.tokenAddress as Address] })),
    reader.call(manager, encodeFunctionData({ abi: RISK_ABI, functionName: "limits" })),
    reader.call(manager, encodeFunctionData({ abi: RISK_ABI, functionName: "vault" })),
  ]);
  const exposure = decodeFunctionResult({ abi: RISK_ABI, functionName: "underlyingExposure6", data: exposureResult });
  const [, underlyingBps] = decodeFunctionResult({ abi: RISK_ABI, functionName: "limits", data: limitsResult });
  const vault = decodeFunctionResult({ abi: RISK_ABI, functionName: "vault", data: vaultResult });
  const capitalResult = await reader.call(vault, encodeFunctionData({ abi: VAULT_ABI, functionName: "totalAssets" }));
  const capital = decodeFunctionResult({ abi: VAULT_ABI, functionName: "totalAssets", data: capitalResult });
  const maximum = capital * BigInt(underlyingBps) / 10_000n;
  const utilization = maximum === 0n ? 10_000 : Number(exposure * 10_000n / maximum);
  const boundedUtilization = Math.min(utilization, 10_000);
  return { exposure6: exposure.toString(), capital6: capital.toString(), maximumExposure6: maximum.toString(), capUtilizationBps: boundedUtilization, warning: boundedUtilization >= (route.warningUtilizationBps ?? 8_000) };
}

export async function syncCandidateOptionsRisk(config: CandidateOptionsRiskSyncConfig): Promise<number> {
  validateConfig(config);
  const request = config.fetch ?? globalThis.fetch;
  const reader = createJsonRpcReader(config.rpcUrl, request);
  let warnings = 0;
  for (const route of config.optionsRiskRoutes) {
    const previous = await readCandidate(config, route, request);
    if (previous === undefined) continue;
    const evidence = await measureOptionsRisk(reader, route);
    const observedAt = new Date().toISOString();
    await record(config, route, evidence, observedAt, request);
    await update(config, route, evidence.warning, observedAt, request);
    if (evidence.warning) warnings += 1;
    if (!previous && evidence.warning) await config.onAlert?.({ severity: "critical", code: "OPTIONS_EXPOSURE_APPROACHING_CAP", candidateId: route.candidateId, tokenAddress: route.tokenAddress.toLowerCase(), riskManagerAddress: route.riskManagerAddress.toLowerCase(), capUtilizationBps: evidence.capUtilizationBps, observedAt });
  }
  return warnings;
}

export function parseCandidateOptionsRiskRoutes(raw: string | undefined): readonly CandidateOptionsRiskRoute[] {
  if (!raw?.trim()) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("MARKET_CANDIDATE_OPTIONS_RISK_ROUTES_JSON must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Options risk route ${index} is invalid`);
    const row = item as Record<string, unknown>;
    return { candidateId: text(row.candidateId, /^[a-z0-9-]{1,80}$/, `Options risk route ${index} candidateId`), tokenAddress: address(row.tokenAddress, `Options risk route ${index} tokenAddress`), riskManagerAddress: address(row.riskManagerAddress, `Options risk route ${index} manager`), ...(row.warningUtilizationBps === undefined ? {} : { warningUtilizationBps: integer(row.warningUtilizationBps, 1, 10_000, `Options risk route ${index} warning`) }) };
  });
}

async function readCandidate(config: CandidateOptionsRiskSyncConfig, route: CandidateOptionsRiskRoute, request: typeof globalThis.fetch): Promise<boolean | undefined> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({ select: "options_exposure_warning", environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${route.candidateId}`, token_address: `eq.${route.tokenAddress.toLowerCase()}`, identity_approval_status: "eq.approved", limit: "1" }).toString();
  const response = await request(url, { headers: headers(config), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Options risk candidate read failed with status ${response.status}`);
  return (await response.json() as Array<{ options_exposure_warning: boolean }>)[0]?.options_exposure_warning;
}

async function record(config: CandidateOptionsRiskSyncConfig, route: CandidateOptionsRiskRoute, evidence: OptionsRiskEvidence, observedAt: string, request: typeof globalThis.fetch): Promise<void> {
  const response = await request(endpoint(config, "/rest/v1/market_candidate_options_risk_observations"), { method: "POST", headers: headers(config, "return=minimal"), body: JSON.stringify({ environment: config.environment, chain_id: config.chainId, candidate_id: route.candidateId, token_address: route.tokenAddress.toLowerCase(), risk_manager_address: route.riskManagerAddress.toLowerCase(), exposure_6: evidence.exposure6, capital_6: evidence.capital6, maximum_exposure_6: evidence.maximumExposure6, cap_utilization_bps: evidence.capUtilizationBps, warning: evidence.warning, observed_at: observedAt }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Options risk evidence write failed with status ${response.status}`);
}

async function update(config: CandidateOptionsRiskSyncConfig, route: CandidateOptionsRiskRoute, warning: boolean, observedAt: string, request: typeof globalThis.fetch): Promise<void> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({ environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${route.candidateId}`, token_address: `eq.${route.tokenAddress.toLowerCase()}` }).toString();
  const response = await request(url, { method: "PATCH", headers: headers(config, "return=minimal"), body: JSON.stringify({ options_exposure_warning: warning, updated_at: observedAt }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Options risk state update failed with status ${response.status}`);
}

function validateConfig(config: CandidateOptionsRiskSyncConfig): void { if (config.databaseUrl.protocol !== "https:" || !config.secretKey.startsWith("sb_secret_")) throw new Error("Options risk sync configuration is invalid"); }
function validateRoute(route: CandidateOptionsRiskRoute): void { if (!/^[a-z0-9-]{1,80}$/.test(route.candidateId) || !isAddress(route.tokenAddress, { strict: false }) || !isAddress(route.riskManagerAddress, { strict: false })) throw new Error("Options risk route is invalid"); }
function endpoint(config: CandidateOptionsRiskSyncConfig, path: string): URL { return new URL(path, config.databaseUrl); }
function headers(config: CandidateOptionsRiskSyncConfig, prefer?: string): Record<string, string> { return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) }; }
function text(value: unknown, pattern: RegExp, label: string): string { if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`); return value; }
function address(value: unknown, label: string): string { if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new Error(`${label} is invalid`); return value.toLowerCase(); }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid`); return value; }
