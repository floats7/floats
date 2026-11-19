import { decodeFunctionResult, encodeFunctionData, isAddress, parseAbi, type Address } from "viem";
import { createJsonRpcReader, type JsonRpcReader } from "./market-candidate-identity-verifier.ts";

const FEED_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)",
]);

export interface CandidateOracleRoute {
  readonly candidateId: string;
  readonly tokenAddress: string;
  readonly feedAddress: string;
  readonly maxAgeSeconds?: number;
  readonly stabilitySeconds?: number;
  readonly maxDeviationBps?: number;
}

export interface CandidateOracleEvidence {
  readonly passed: boolean;
  readonly roundId: string | null;
  readonly answeredInRound: string | null;
  readonly price18: string | null;
  readonly feedUpdatedAt: string | null;
  readonly failureCode: string | null;
}

export interface CandidateOracleSyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly rpcUrl: URL;
  readonly oracleRoutes: readonly CandidateOracleRoute[];
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly onAlert?: (alert: CandidateOracleAlert) => Promise<void>;
}

export interface CandidateOracleDiscoveryConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly directoryUrl: URL;
  readonly fetch?: typeof globalThis.fetch;
}

interface OracleDiscoveryCandidate {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly token_address: string;
}

interface ChainlinkDirectoryFeed {
  readonly name?: string;
  readonly proxyAddress?: string;
  readonly docs?: { readonly baseAsset?: string; readonly quoteAsset?: string };
}

export interface CandidateOracleAlert {
  readonly severity: "critical";
  readonly code: "OFFICIAL_FEED_UNHEALTHY";
  readonly candidateId: string;
  readonly tokenAddress: string;
  readonly feedAddress: string;
  readonly failureCode: string;
  readonly observedAt: string;
}

interface CandidateOracleRow {
  readonly candidate_id: string;
  readonly token_address: string;
  readonly oracle_healthy_since: string | null;
  readonly oracle_last_price_18: string | null;
  readonly oracle_ready: boolean;
}

export async function verifyCandidateOracle(
  reader: JsonRpcReader,
  route: CandidateOracleRoute,
  now: Date,
  previousPrice18?: bigint,
): Promise<CandidateOracleEvidence> {
  validateRoute(route);
  try {
    const code = await reader.getCode(route.feedAddress as Address);
    if (code === "0x") throw new Error("FEED_CODE_MISSING");
    const decimalsResult = await reader.call(
      route.feedAddress as Address,
      encodeFunctionData({ abi: FEED_ABI, functionName: "decimals" }),
    );
    const decimals = decodeFunctionResult({ abi: FEED_ABI, functionName: "decimals", data: decimalsResult });
    if (decimals > 36) throw new Error("FEED_DECIMALS_INVALID");
    const roundResult = await reader.call(
      route.feedAddress as Address,
      encodeFunctionData({ abi: FEED_ABI, functionName: "latestRoundData" }),
    );
    const [roundId, answer, , updatedAt, answeredInRound] = decodeFunctionResult({
      abi: FEED_ABI,
      functionName: "latestRoundData",
      data: roundResult,
    });
    if (roundId === 0n || answeredInRound < roundId) throw new Error("FEED_ROUND_INVALID");
    if (answer <= 0n) throw new Error("FEED_ANSWER_INVALID");
    const nowSeconds = BigInt(Math.floor(now.getTime() / 1_000));
    if (updatedAt === 0n || updatedAt > nowSeconds) throw new Error("FEED_TIMESTAMP_INVALID");
    if (nowSeconds - updatedAt > BigInt(route.maxAgeSeconds ?? 60)) throw new Error("FEED_STALE");
    const price18 = normalizePrice(answer, decimals);
    if (previousPrice18 && deviationBps(previousPrice18, price18) > (route.maxDeviationBps ?? 1_000)) {
      throw new Error("FEED_DEVIATION_EXCEEDED");
    }
    return {
      passed: true,
      roundId: roundId.toString(),
      answeredInRound: answeredInRound.toString(),
      price18: price18.toString(),
      feedUpdatedAt: new Date(Number(updatedAt) * 1_000).toISOString(),
      failureCode: null,
    };
  } catch (error) {
    return { passed: false, roundId: null, answeredInRound: null, price18: null, feedUpdatedAt: null, failureCode: error instanceof Error ? error.message : "FEED_READ_FAILED" };
  }
}

export async function syncCandidateOracles(config: CandidateOracleSyncConfig): Promise<number> {
  validateConfig(config);
  const request = config.fetch ?? globalThis.fetch;
  const reader = createJsonRpcReader(config.rpcUrl, request);
  let readyCount = 0;
  for (const route of config.oracleRoutes) {
    const candidate = await readCandidate(config, route, request);
    if (!candidate) continue;
    const observedAt = (config.now?.() ?? new Date());
    const evidence = await verifyCandidateOracle(reader, route, observedAt, candidate.oracle_last_price_18 ? BigInt(candidate.oracle_last_price_18) : undefined);
    const healthySince = evidence.passed
      ? candidate.oracle_healthy_since ?? observedAt.toISOString()
      : null;
    const stable = healthySince !== null
      && observedAt.getTime() - Date.parse(healthySince) >= (route.stabilitySeconds ?? 1_800) * 1_000;
    await record(config, route, evidence, observedAt.toISOString(), request);
    await update(config, route, evidence, healthySince, stable, observedAt.toISOString(), request);
    if (candidate.oracle_ready && !evidence.passed) {
      await config.onAlert?.({
        severity: "critical",
        code: "OFFICIAL_FEED_UNHEALTHY",
        candidateId: route.candidateId,
        tokenAddress: route.tokenAddress.toLowerCase(),
        feedAddress: route.feedAddress.toLowerCase(),
        failureCode: evidence.failureCode ?? "FEED_READ_FAILED",
        observedAt: observedAt.toISOString(),
      });
    }
    if (stable) readyCount += 1;
  }
  return readyCount;
}

export async function discoverCandidateOracleRoutes(config: CandidateOracleDiscoveryConfig): Promise<readonly CandidateOracleRoute[]> {
  if (config.databaseUrl.protocol !== "https:" || config.directoryUrl.protocol !== "https:" || !config.secretKey.startsWith("sb_secret_")) {
    throw new Error("Oracle discovery configuration is invalid");
  }
  const request = config.fetch ?? globalThis.fetch;
  const candidateUrl = new URL("/rest/v1/market_candidates", config.databaseUrl);
  candidateUrl.search = new URLSearchParams({
    select: "candidate_id,symbol,token_address",
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
    identity_approval_status: "eq.approved",
    token_live: "eq.true",
    token_address: "not.is.null",
  }).toString();
  const [candidateResponse, directoryResponse] = await Promise.all([
    request(candidateUrl, { headers: headers(config), signal: AbortSignal.timeout(30_000) }),
    request(config.directoryUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) }),
  ]);
  if (!candidateResponse.ok) throw new Error(`Oracle discovery candidate read failed with status ${candidateResponse.status}`);
  if (!directoryResponse.ok) throw new Error(`Chainlink feed directory returned ${directoryResponse.status}`);
  const candidates = await candidateResponse.json() as OracleDiscoveryCandidate[];
  const directory: unknown = await directoryResponse.json();
  if (!Array.isArray(directory)) throw new Error("Chainlink feed directory response is invalid");
  const feeds = directory as ChainlinkDirectoryFeed[];
  return candidates.flatMap((candidate) => {
    const matches = feeds.filter((feed) =>
      feed.docs?.baseAsset?.toUpperCase() === candidate.symbol.toUpperCase()
      && feed.docs?.quoteAsset?.toUpperCase() === "USD"
      && feed.name === `Robinhood ${candidate.symbol.toUpperCase()} / USD`
      && typeof feed.proxyAddress === "string"
      && isAddress(feed.proxyAddress, { strict: false }),
    );
    if (matches.length > 1) throw new Error(`Multiple official ${candidate.symbol}/USD feeds were discovered`);
    return matches.length === 1 ? [{
      candidateId: candidate.candidate_id,
      tokenAddress: candidate.token_address.toLowerCase(),
      feedAddress: matches[0]!.proxyAddress!.toLowerCase(),
    }] : [];
  });
}

export function parseCandidateOracleRoutes(raw: string | undefined): readonly CandidateOracleRoute[] {
  if (!raw?.trim()) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("MARKET_CANDIDATE_ORACLE_ROUTES_JSON must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Oracle route ${index} is invalid`);
    const route = item as Record<string, unknown>;
    return {
      candidateId: text(route.candidateId, /^[a-z0-9-]{1,80}$/, `Oracle route ${index} candidateId`),
      tokenAddress: address(route.tokenAddress, `Oracle route ${index} tokenAddress`),
      feedAddress: address(route.feedAddress, `Oracle route ${index} feedAddress`),
      ...(route.maxAgeSeconds === undefined ? {} : { maxAgeSeconds: integer(route.maxAgeSeconds, 1, 3_600, `Oracle route ${index} maxAgeSeconds`) }),
      ...(route.stabilitySeconds === undefined ? {} : { stabilitySeconds: integer(route.stabilitySeconds, 60, 86_400, `Oracle route ${index} stabilitySeconds`) }),
      ...(route.maxDeviationBps === undefined ? {} : { maxDeviationBps: integer(route.maxDeviationBps, 1, 10_000, `Oracle route ${index} maxDeviationBps`) }),
    };
  });
}

export function deviationBps(previous: bigint, current: bigint): number {
  if (previous <= 0n || current <= 0n) throw new Error("FEED_PRICE_INVALID");
  const difference = previous > current ? previous - current : current - previous;
  return Number(difference * 10_000n / previous);
}

function normalizePrice(answer: bigint, decimals: number): bigint {
  if (decimals === 18) return answer;
  return decimals < 18 ? answer * 10n ** BigInt(18 - decimals) : answer / 10n ** BigInt(decimals - 18);
}

async function readCandidate(config: CandidateOracleSyncConfig, route: CandidateOracleRoute, request: typeof globalThis.fetch): Promise<CandidateOracleRow | undefined> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({ select: "candidate_id,token_address,oracle_healthy_since,oracle_last_price_18,oracle_ready", environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${route.candidateId}`, token_address: `eq.${route.tokenAddress.toLowerCase()}`, identity_approval_status: "eq.approved", token_live: "eq.true", limit: "1" }).toString();
  const response = await request(url, { headers: headers(config), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Oracle candidate read failed with status ${response.status}`);
  return (await response.json() as CandidateOracleRow[])[0];
}

async function record(config: CandidateOracleSyncConfig, route: CandidateOracleRoute, evidence: CandidateOracleEvidence, observedAt: string, request: typeof globalThis.fetch): Promise<void> {
  const response = await request(endpoint(config, "/rest/v1/market_candidate_oracle_observations"), { method: "POST", headers: headers(config, "return=minimal"), body: JSON.stringify({ environment: config.environment, chain_id: config.chainId, candidate_id: route.candidateId, token_address: route.tokenAddress.toLowerCase(), feed_address: route.feedAddress.toLowerCase(), round_id: evidence.roundId, answered_in_round: evidence.answeredInRound, price_18: evidence.price18, feed_updated_at: evidence.feedUpdatedAt, passed: evidence.passed, failure_code: evidence.failureCode, observed_at: observedAt }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Oracle evidence write failed with status ${response.status}`);
}

async function update(config: CandidateOracleSyncConfig, route: CandidateOracleRoute, evidence: CandidateOracleEvidence, healthySince: string | null, stable: boolean, observedAt: string, request: typeof globalThis.fetch): Promise<void> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({ environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${route.candidateId}`, token_address: `eq.${route.tokenAddress.toLowerCase()}`, identity_approval_status: "eq.approved" }).toString();
  const response = await request(url, { method: "PATCH", headers: headers(config, "return=minimal"), body: JSON.stringify({ official_feed_address: route.feedAddress.toLowerCase(), oracle_healthy_since: healthySince, ...(evidence.price18 === null ? {} : { oracle_last_price_18: evidence.price18 }), oracle_last_failure: evidence.failureCode, oracle_ready: stable, disabled_reason: stable ? "Waiting for liquidity" : "Oracle verification pending", last_checked_at: observedAt, updated_at: observedAt }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Oracle readiness update failed with status ${response.status}`);
}

function validateConfig(config: CandidateOracleSyncConfig): void { if (config.databaseUrl.protocol !== "https:" || !config.secretKey.startsWith("sb_secret_")) throw new Error("Oracle sync configuration is invalid"); }
function validateRoute(route: CandidateOracleRoute): void { if (!/^[a-z0-9-]{1,80}$/.test(route.candidateId) || !isAddress(route.tokenAddress, { strict: false }) || !isAddress(route.feedAddress, { strict: false })) throw new Error("Candidate oracle route is invalid"); }
function endpoint(config: CandidateOracleSyncConfig, path: string): URL { return new URL(path, config.databaseUrl); }
function headers(config: CandidateOracleSyncConfig, prefer?: string): Record<string, string> { return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) }; }
function text(value: unknown, pattern: RegExp, label: string): string { if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`); return value; }
function address(value: unknown, label: string): string { if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new Error(`${label} is invalid`); return value.toLowerCase(); }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid`); return value; }
