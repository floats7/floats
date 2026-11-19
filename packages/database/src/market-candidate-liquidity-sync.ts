import { decodeFunctionResult, encodeFunctionData, isAddress, parseAbi, type Address, type Hex } from "viem";
import { createJsonRpcReader, type JsonRpcReader } from "./market-candidate-identity-verifier.ts";

const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const DEFAULT_NOTIONAL_USDG_6 = 25_000_000_000n;
const DEFAULT_MAX_IMPACT_BPS = 200;

export interface CandidateLiquidityRoute {
  readonly candidateId: string;
  readonly tokenAddress: string;
  readonly usdgAddress: string;
  readonly poolAddress: string;
  readonly quoterAddress: string;
  readonly fee: number;
  readonly notionalUsdg6?: bigint;
  readonly maxImpactBps?: number;
  readonly maxOracleDeviationBps?: number;
}

export interface CandidateLiquidityEvidence {
  readonly passed: boolean;
  readonly notionalUsdg6: string;
  readonly buyPriceImpactBps: number | null;
  readonly sellPriceImpactBps: number | null;
  readonly failureCode: string | null;
  readonly dexBuyPrice18: string | null;
  readonly oracleDeviationBps: number | null;
}

export interface CandidateLiquiditySyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly rpcUrl: URL;
  readonly routes: readonly CandidateLiquidityRoute[];
  readonly fetch?: typeof globalThis.fetch;
  readonly onAlert?: (alert: CandidateLiquidityAlert) => Promise<void>;
}

export interface CandidateLiquidityAlert {
  readonly severity: "critical";
  readonly code: "LIQUIDITY_BELOW_THRESHOLD";
  readonly candidateId: string;
  readonly tokenAddress: string;
  readonly poolAddress: string;
  readonly failureCode: string;
  readonly observedAt: string;
}

interface CandidateLiquidityRow {
  readonly candidate_id: string;
  readonly liquidity_ready: boolean;
  readonly oracle_last_price_18: string | null;
  readonly current_multiplier: string | null;
}

export async function measureCandidateLiquidity(
  reader: JsonRpcReader,
  route: CandidateLiquidityRoute,
  referencePrice18?: bigint,
): Promise<CandidateLiquidityEvidence> {
  validateRoute(route);
  const notional = route.notionalUsdg6 ?? DEFAULT_NOTIONAL_USDG_6;
  const probe = notional / 250n;
  const maxImpact = route.maxImpactBps ?? DEFAULT_MAX_IMPACT_BPS;
  try {
    const [buyOutput, buyProbeOutput] = await Promise.all([
      quote(reader, route, route.usdgAddress, route.tokenAddress, notional),
      quote(reader, route, route.usdgAddress, route.tokenAddress, probe),
    ]);
    const buyImpact = priceImpactBps(notional, buyOutput, probe, buyProbeOutput);
    const dexBuyPrice18 = notional * 10n ** 30n / buyOutput;
    const oracleDeviation = referencePrice18 ? absoluteDeviationBps(referencePrice18, dexBuyPrice18) : null;
    const sellProbeInput = buyOutput / 250n;
    if (sellProbeInput === 0n) throw new Error("INSUFFICIENT_TOKEN_OUTPUT");
    const [sellOutput, sellProbeOutput] = await Promise.all([
      quote(reader, route, route.tokenAddress, route.usdgAddress, buyOutput),
      quote(reader, route, route.tokenAddress, route.usdgAddress, sellProbeInput),
    ]);
    const sellImpact = priceImpactBps(buyOutput, sellOutput, sellProbeInput, sellProbeOutput);
    const passed = buyImpact <= maxImpact && sellImpact <= maxImpact
      && (oracleDeviation === null || oracleDeviation <= (route.maxOracleDeviationBps ?? 200));
    return {
      passed,
      notionalUsdg6: notional.toString(),
      buyPriceImpactBps: buyImpact,
      sellPriceImpactBps: sellImpact,
      failureCode: passed ? null : buyImpact > maxImpact || sellImpact > maxImpact ? "PRICE_IMPACT_EXCEEDED" : "ORACLE_DEVIATION_EXCEEDED",
      dexBuyPrice18: dexBuyPrice18.toString(),
      oracleDeviationBps: oracleDeviation,
    };
  } catch (error) {
    return {
      passed: false,
      notionalUsdg6: notional.toString(),
      buyPriceImpactBps: null,
      sellPriceImpactBps: null,
      failureCode: error instanceof Error ? error.message : "LIQUIDITY_QUOTE_FAILED",
      dexBuyPrice18: null,
      oracleDeviationBps: null,
    };
  }
}

export async function syncCandidateLiquidity(config: CandidateLiquiditySyncConfig): Promise<number> {
  validateConfig(config);
  const request = config.fetch ?? globalThis.fetch;
  const reader = createJsonRpcReader(config.rpcUrl, request);
  let ready = 0;
  for (const route of config.routes) {
    validateRoute(route);
    const candidate = await readApprovedCandidate(config, route, request);
    if (!candidate) continue;
    const referencePrice18 = candidate.oracle_last_price_18
      ? BigInt(candidate.oracle_last_price_18) * multiplier18(candidate.current_multiplier) / 10n ** 18n
      : undefined;
    const evidence = await measureCandidateLiquidity(reader, route, referencePrice18);
    const observedAt = new Date().toISOString();
    await recordEvidence(config, route, evidence, observedAt, request);
    await updateReadiness(config, route, evidence, observedAt, request);
    if (candidate.liquidity_ready && !evidence.passed) {
      await config.onAlert?.({
        severity: "critical",
        code: "LIQUIDITY_BELOW_THRESHOLD",
        candidateId: route.candidateId,
        tokenAddress: route.tokenAddress.toLowerCase(),
        poolAddress: route.poolAddress.toLowerCase(),
        failureCode: evidence.failureCode ?? "LIQUIDITY_QUOTE_FAILED",
        observedAt,
      });
    }
    if (evidence.passed) ready += 1;
  }
  return ready;
}

export function parseCandidateLiquidityRoutes(raw: string | undefined): readonly CandidateLiquidityRoute[] {
  if (!raw?.trim()) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("MARKET_CANDIDATE_LIQUIDITY_ROUTES_JSON must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Liquidity route ${index} is invalid`);
    const route = item as Record<string, unknown>;
    return {
      candidateId: text(route.candidateId, /^[a-z0-9-]{1,80}$/, `Liquidity route ${index} candidateId`),
      tokenAddress: address(route.tokenAddress, `Liquidity route ${index} tokenAddress`),
      usdgAddress: address(route.usdgAddress, `Liquidity route ${index} usdgAddress`),
      poolAddress: address(route.poolAddress, `Liquidity route ${index} poolAddress`),
      quoterAddress: address(route.quoterAddress, `Liquidity route ${index} quoterAddress`),
      fee: integer(route.fee, 1, 1_000_000, `Liquidity route ${index} fee`),
      ...(route.notionalUsdg6 === undefined ? {} : { notionalUsdg6: BigInt(text(route.notionalUsdg6, /^[1-9][0-9]*$/, `Liquidity route ${index} notional`)) }),
      ...(route.maxImpactBps === undefined ? {} : { maxImpactBps: integer(route.maxImpactBps, 1, 10_000, `Liquidity route ${index} max impact`) }),
      ...(route.maxOracleDeviationBps === undefined ? {} : { maxOracleDeviationBps: integer(route.maxOracleDeviationBps, 1, 10_000, `Liquidity route ${index} oracle deviation`) }),
    };
  });
}

export function priceImpactBps(amountIn: bigint, amountOut: bigint, probeIn: bigint, probeOut: bigint): number {
  if (amountIn <= 0n || amountOut <= 0n || probeIn <= 0n || probeOut <= 0n) throw new Error("INVALID_QUOTE_AMOUNT");
  const expected = probeOut * amountIn / probeIn;
  if (expected === 0n) throw new Error("INVALID_PROBE_QUOTE");
  if (amountOut >= expected) return 0;
  return Number((expected - amountOut) * 10_000n / expected);
}

export function absoluteDeviationBps(reference: bigint, observed: bigint): number {
  if (reference <= 0n || observed <= 0n) throw new Error("REFERENCE_PRICE_INVALID");
  const difference = reference > observed ? reference - observed : observed - reference;
  return Number(difference * 10_000n / reference);
}

async function quote(reader: JsonRpcReader, route: CandidateLiquidityRoute, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint> {
  const data = encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, amountIn, fee: route.fee, sqrtPriceLimitX96: 0n }] });
  const result = await reader.call(route.quoterAddress as Address, data);
  const [amountOut] = decodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", data: result as Hex });
  if (amountOut <= 0n) throw new Error("EMPTY_LIQUIDITY_QUOTE");
  return amountOut;
}

async function readApprovedCandidate(config: CandidateLiquiditySyncConfig, route: CandidateLiquidityRoute, request: typeof globalThis.fetch): Promise<CandidateLiquidityRow | undefined> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({ select: "candidate_id,liquidity_ready,oracle_last_price_18,current_multiplier", environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${route.candidateId}`, token_address: `eq.${route.tokenAddress.toLowerCase()}`, identity_approval_status: "eq.approved", token_live: "eq.true", limit: "1" }).toString();
  const response = await request(url, { headers: headers(config), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Liquidity candidate read failed with status ${response.status}`);
  return (await response.json() as CandidateLiquidityRow[])[0];
}

async function recordEvidence(config: CandidateLiquiditySyncConfig, route: CandidateLiquidityRoute, evidence: CandidateLiquidityEvidence, observedAt: string, request: typeof globalThis.fetch): Promise<void> {
  const response = await request(endpoint(config, "/rest/v1/market_candidate_liquidity_observations"), { method: "POST", headers: headers(config, "return=minimal"), body: JSON.stringify({ environment: config.environment, chain_id: config.chainId, candidate_id: route.candidateId, token_address: route.tokenAddress.toLowerCase(), pool_address: route.poolAddress.toLowerCase(), notional_usdg_6: evidence.notionalUsdg6, buy_price_impact_bps: evidence.buyPriceImpactBps, sell_price_impact_bps: evidence.sellPriceImpactBps, dex_buy_price_18: evidence.dexBuyPrice18, oracle_deviation_bps: evidence.oracleDeviationBps, passed: evidence.passed, failure_code: evidence.failureCode, observed_at: observedAt }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Liquidity evidence write failed with status ${response.status}`);
}

async function updateReadiness(config: CandidateLiquiditySyncConfig, route: CandidateLiquidityRoute, evidence: CandidateLiquidityEvidence, observedAt: string, request: typeof globalThis.fetch): Promise<void> {
  const url = endpoint(config, "/rest/v1/market_candidates");
  url.search = new URLSearchParams({ environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${route.candidateId}`, token_address: `eq.${route.tokenAddress.toLowerCase()}`, identity_approval_status: "eq.approved" }).toString();
  const response = await request(url, { method: "PATCH", headers: headers(config, "return=minimal"), body: JSON.stringify({ liquidity_ready: evidence.passed, dex_reference_price_18: evidence.dexBuyPrice18, liquidity_observed_at: observedAt, disabled_reason: evidence.passed ? "Oracle verification pending" : "Waiting for liquidity", last_checked_at: observedAt, updated_at: observedAt }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Liquidity readiness update failed with status ${response.status}`);
}

function validateConfig(config: CandidateLiquiditySyncConfig): void {
  if (config.databaseUrl.protocol !== "https:") throw new Error("Database URL must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Liquidity sync requires a server-only secret key");
}
function validateRoute(route: CandidateLiquidityRoute): void {
  if (!/^[a-z0-9-]{1,80}$/.test(route.candidateId) || ![route.tokenAddress, route.usdgAddress, route.poolAddress, route.quoterAddress].every((item) => isAddress(item, { strict: false }))) throw new Error("Candidate liquidity route is invalid");
  if (!Number.isSafeInteger(route.fee) || route.fee <= 0 || route.fee > 1_000_000) throw new Error("Candidate liquidity fee is invalid");
}
function endpoint(config: CandidateLiquiditySyncConfig, path: string): URL { return new URL(path, config.databaseUrl); }
function headers(config: CandidateLiquiditySyncConfig, prefer?: string): Record<string, string> { return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) }; }
function text(value: unknown, pattern: RegExp, label: string): string { if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`); return value; }
function address(value: unknown, label: string): string { if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new Error(`${label} is invalid`); return value.toLowerCase(); }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid`); return value; }
function multiplier18(value: string | null): bigint {
  if (!value) return 10n ** 18n;
  if (!/^[0-9]+(?:\.[0-9]{1,18})?$/.test(value)) throw new Error("Official multiplier is invalid");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}
