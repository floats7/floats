import { createHash } from "node:crypto";
import {
  createJsonRpcReader,
  compareDeploymentLineageWithReferences,
  compareRuntimeCodeWithReferences,
  verifyStockTokenInterface,
} from "./market-candidate-identity-verifier.ts";

export interface MarketCandidateIdentitySyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly rpcUrl: URL;
  readonly fetch?: typeof globalThis.fetch;
  readonly onAlert?: (alert: MarketCandidateIdentityAlert) => Promise<void>;
  readonly referenceTokenAddresses?: readonly string[];
  readonly explorerUrl?: URL;
}

export interface MarketCandidateIdentityAlert {
  readonly severity: "critical";
  readonly code: "SUSPECTED_FAKE_STOCK_TOKEN";
  readonly candidateId: string;
  readonly symbol: string;
  readonly tokenAddress: string;
  readonly failures: readonly string[];
  readonly observedAt: string;
}

interface PendingIdentityRow {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly official_token_name: string | null;
  readonly asset_uid: string;
  readonly detected_token_address: string;
}

export async function verifyPendingMarketCandidateIdentities(
  config: MarketCandidateIdentitySyncConfig,
): Promise<number> {
  validate(config);
  const request = config.fetch ?? globalThis.fetch;
  const candidatesUrl = endpoint(config, "/rest/v1/market_candidates");
  candidatesUrl.search = new URLSearchParams({
    select: "candidate_id,symbol,official_token_name,asset_uid,detected_token_address",
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
    lifecycle_status: "eq.verification_pending",
    identity_approval_status: "eq.pending",
    detected_token_address: "not.is.null",
    asset_uid: "not.is.null",
  }).toString();
  const response = await request(candidatesUrl, {
    headers: headers(config),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pending identity read failed with status ${response.status}`);
  const candidates = await response.json() as PendingIdentityRow[];
  const reader = createJsonRpcReader(config.rpcUrl, request);
  let verified = 0;
  for (const candidate of candidates) {
    const evidence = await verifyStockTokenInterface(reader, {
      address: candidate.detected_token_address,
      symbol: candidate.symbol,
      tokenName: candidate.official_token_name ?? undefined,
      assetUid: candidate.asset_uid,
    });
    const observedAt = new Date().toISOString();
    await record(config, candidate, evidence, observedAt, request);
    if (evidence.passed && (config.referenceTokenAddresses?.length ?? 0) > 0) {
      const comparison = await compareRuntimeCodeWithReferences(
        reader,
        evidence.runtimeCodeHash,
        config.referenceTokenAddresses ?? [],
      );
      await recordAdditionalEvidence(config, candidate, "bytecode", comparison, observedAt, request);
      if (config.explorerUrl) {
        const lineage = await compareDeploymentLineageWithReferences(
          config.explorerUrl,
          candidate.detected_token_address,
          config.referenceTokenAddresses ?? [],
          request,
        );
        await recordAdditionalEvidence(config, candidate, "deployment_lineage", lineage, observedAt, request);
      }
    }
    await updateCandidate(config, candidate, evidence, observedAt, request);
    if (hasDeterministicIdentityMismatch(evidence)) {
      await config.onAlert?.({
        severity: "critical",
        code: "SUSPECTED_FAKE_STOCK_TOKEN",
        candidateId: candidate.candidate_id,
        symbol: candidate.symbol,
        tokenAddress: candidate.detected_token_address.toLowerCase(),
        failures: evidence.failures,
        observedAt,
      });
    }
    if (evidence.passed) verified += 1;
  }
  return verified;
}

async function recordAdditionalEvidence(
  config: MarketCandidateIdentitySyncConfig,
  candidate: PendingIdentityRow,
  sourceKind: string,
  evidence: unknown,
  observedAt: string,
  request: typeof globalThis.fetch,
): Promise<void> {
  const evidenceJson = JSON.stringify(evidence);
  const url = endpoint(config, "/rest/v1/market_candidate_identity_observations");
  url.search = new URLSearchParams({ on_conflict: "environment,chain_id,candidate_id,token_address,source_kind,evidence_hash" }).toString();
  const response = await request(url, {
    method: "POST",
    headers: headers(config, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({ environment: config.environment, chain_id: config.chainId, candidate_id: candidate.candidate_id, token_address: candidate.detected_token_address.toLowerCase(), source_kind: sourceKind, passed: (evidence as { passed?: unknown }).passed === true, evidence, evidence_hash: `0x${createHash("sha256").update(evidenceJson).digest("hex")}`, observed_at: observedAt }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Additional identity evidence write failed with status ${response.status}`);
}

function validate(config: MarketCandidateIdentitySyncConfig): void {
  if (config.databaseUrl.protocol !== "https:") throw new Error("Database URL must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Identity sync requires a server-only secret key");
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw new Error("Identity sync chain ID is invalid");
  if (config.explorerUrl && config.explorerUrl.protocol !== "https:") throw new Error("Identity explorer must use HTTPS");
}

async function record(
  config: MarketCandidateIdentitySyncConfig,
  candidate: PendingIdentityRow,
  evidence: Awaited<ReturnType<typeof verifyStockTokenInterface>>,
  observedAt: string,
  request: typeof globalThis.fetch,
): Promise<void> {
  const evidenceJson = JSON.stringify(evidence);
  const url = endpoint(config, "/rest/v1/market_candidate_identity_observations");
  url.search = new URLSearchParams({
    on_conflict: "environment,chain_id,candidate_id,token_address,source_kind,evidence_hash",
  }).toString();
  const response = await request(url, {
    method: "POST",
    headers: headers(config, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({
      environment: config.environment,
      chain_id: config.chainId,
      candidate_id: candidate.candidate_id,
      token_address: candidate.detected_token_address.toLowerCase(),
      source_kind: "interface",
      passed: evidence.passed,
      evidence,
      evidence_hash: `0x${createHash("sha256").update(evidenceJson).digest("hex")}`,
      observed_at: observedAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Interface evidence write failed with status ${response.status}`);
}

async function updateCandidate(
  config: MarketCandidateIdentitySyncConfig,
  candidate: PendingIdentityRow,
  evidence: Awaited<ReturnType<typeof verifyStockTokenInterface>>,
  observedAt: string,
  request: typeof globalThis.fetch,
): Promise<void> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
    candidate_id: `eq.${candidate.candidate_id}`,
    detected_token_address: `eq.${candidate.detected_token_address.toLowerCase()}`,
    identity_approval_status: "eq.pending",
  }).toString();
  const response = await request(url, {
    method: "PATCH",
    headers: headers(config, "return=minimal"),
    body: JSON.stringify({
      ...(hasDeterministicIdentityMismatch(evidence) ? {
        lifecycle_status: "suspected_fake",
        identity_approval_status: "rejected",
      } : {}),
      disabled_reason: evidence.passed
        ? "Additional canonical identity verification pending"
        : hasDeterministicIdentityMismatch(evidence)
          ? `Canonical identity mismatch: ${evidence.failures.join(", ")}`
          : "Canonical Stock Token interface verification failed",
      last_checked_at: observedAt,
      updated_at: observedAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Identity verification state update failed with status ${response.status}`);
}

function hasDeterministicIdentityMismatch(
  evidence: Awaited<ReturnType<typeof verifyStockTokenInterface>>,
): boolean {
  return evidence.failures.some((failure) => [
    "SYMBOL_MISMATCH",
    "NAME_MISMATCH",
    "DECIMALS_NOT_18",
    "ASSET_UID_MISMATCH",
  ].includes(failure));
}

function endpoint(config: MarketCandidateIdentitySyncConfig, path: string): URL {
  return new URL(path, config.databaseUrl);
}

function headers(config: MarketCandidateIdentitySyncConfig, prefer?: string): Record<string, string> {
  return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) };
}
