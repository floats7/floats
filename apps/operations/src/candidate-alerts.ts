import type { MarketCandidateIdentityAlert } from "../../../packages/database/src/market-candidate-identity-sync.ts";
import type { MarketCandidateOperationalAlert } from "../../../packages/database/src/market-candidate-sync.ts";
import type { CandidateOracleAlert } from "../../../packages/database/src/market-candidate-oracle-sync.ts";
import type { CandidateLiquidityAlert } from "../../../packages/database/src/market-candidate-liquidity-sync.ts";
import type { CandidateOptionsRiskAlert } from "../../../packages/database/src/market-candidate-options-risk-sync.ts";
import { createHash } from "node:crypto";

type CandidateAlert = MarketCandidateIdentityAlert | MarketCandidateOperationalAlert | CandidateOracleAlert | CandidateLiquidityAlert | CandidateOptionsRiskAlert;

export interface CandidateAlertDelivery {
  readonly telegramBotToken?: string;
  readonly telegramChatId?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly retries?: number;
  readonly databaseUrl?: URL;
  readonly secretKey?: string;
  readonly environment?: "testnet" | "mainnet";
  readonly chainId?: number;
}

export function createCandidateAlertDelivery(config: CandidateAlertDelivery) {
  const request = config.fetch ?? globalThis.fetch;
  const enabled = Boolean(config.telegramBotToken && config.telegramChatId);
  if (Boolean(config.telegramBotToken) !== Boolean(config.telegramChatId)) {
    throw new Error("Telegram candidate alerts require both token and chat ID");
  }
  const databaseEnabled = Boolean(config.databaseUrl && config.secretKey && config.environment && config.chainId);
  if ([config.databaseUrl, config.secretKey, config.environment, config.chainId].filter(Boolean).length !== 0 && !databaseEnabled) {
    throw new Error("Candidate alert persistence configuration is incomplete");
  }

  return async (alert: CandidateAlert): Promise<void> => {
    console.error(JSON.stringify({ event: "candidate_identity_alert", ...alert }));
    if (databaseEnabled) await persistAlert(config, alert, request);
    if (!enabled) return;
    const endpoint = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
    const attempts = Math.max(1, Math.min(config.retries ?? 3, 5));
    let lastStatus = 0;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: formatCandidateAlert(alert),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
      lastStatus = response.status;
      if (attempt < attempts) await delay(250 * 2 ** (attempt - 1));
    }
    throw new Error(`Telegram candidate alert failed with status ${lastStatus}`);
  };
}

async function persistAlert(config: CandidateAlertDelivery, alert: CandidateAlert, request: typeof globalThis.fetch): Promise<void> {
  const url = new URL("/rest/v1/market_candidate_alerts", config.databaseUrl);
  url.searchParams.set("on_conflict", "environment,chain_id,fingerprint");
  const fingerprint = `0x${createHash("sha256").update(JSON.stringify(alertFingerprintInput(alert))).digest("hex")}`;
  const launchSnapshot = await loadLaunchSnapshot(config, alert.candidateId, request);
  const response = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: config.secretKey!, prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ environment: config.environment, chain_id: config.chainId, candidate_id: alert.candidateId, alert_code: alert.code, severity: alert.severity, fingerprint, payload: { alert, launchSnapshot }, detected_at: alert.observedAt }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Candidate alert persistence failed with status ${response.status}`);
}

function alertFingerprintInput(alert: CandidateAlert): object {
  if (alert.code === "SUSPECTED_FAKE_STOCK_TOKEN") {
    return { code: alert.code, candidateId: alert.candidateId, tokenAddress: alert.tokenAddress.toLowerCase(), failures: [...alert.failures].sort() };
  }
  if (alert.code === "OFFICIAL_TRADING_HALTED") {
    return { code: alert.code, candidateId: alert.candidateId, tokenAddress: alert.tokenAddress.toLowerCase() };
  }
  if (alert.code === "OFFICIAL_FEED_UNHEALTHY") {
    return { code: alert.code, candidateId: alert.candidateId, tokenAddress: alert.tokenAddress.toLowerCase(), feedAddress: alert.feedAddress.toLowerCase(), failureCode: alert.failureCode };
  }
  if (alert.code === "LIQUIDITY_BELOW_THRESHOLD") {
    return { code: alert.code, candidateId: alert.candidateId, tokenAddress: alert.tokenAddress.toLowerCase(), poolAddress: alert.poolAddress.toLowerCase(), failureCode: alert.failureCode };
  }
  return { code: alert.code, candidateId: alert.candidateId, tokenAddress: alert.tokenAddress.toLowerCase(), riskManagerAddress: alert.riskManagerAddress.toLowerCase() };
}

async function loadLaunchSnapshot(config: CandidateAlertDelivery, candidateId: string, request: typeof globalThis.fetch): Promise<Record<string, unknown>> {
  const common = { environment: `eq.${config.environment}`, chain_id: `eq.${config.chainId}`, candidate_id: `eq.${candidateId}` };
  const queries = [
    ["market_candidates", "token_address,source_url,trading_capabilities,trading_halted,official_feed_address,oracle_ready,liquidity_ready,disabled_reason,last_checked_at", "last_checked_at.desc"],
    ["market_candidate_identity_observations", "source_kind,source_url,passed,evidence,observed_at", "observed_at.desc"],
    ["market_candidate_oracle_observations", "feed_address,price_18,passed,failure_code,observed_at", "observed_at.desc"],
    ["market_candidate_liquidity_observations", "pool_address,buy_price_impact_bps,sell_price_impact_bps,oracle_deviation_bps,passed,failure_code,observed_at", "observed_at.desc"],
  ] as const;
  const results = await Promise.all(queries.map(async ([table, select, order]) => {
    try {
      const url = new URL(`/rest/v1/${table}`, config.databaseUrl);
      url.search = new URLSearchParams({ select, ...common, order, limit: table === "market_candidate_identity_observations" ? "10" : "1" }).toString();
      const response = await request(url, { headers: { apikey: config.secretKey! }, signal: AbortSignal.timeout(10_000) });
      return response.ok ? await response.json() as unknown : [];
    } catch {
      return [];
    }
  }));
  return { candidate: results[0], identitySignals: results[1], feedState: results[2], poolDepth: results[3] };
}

export function formatCandidateAlert(alert: CandidateAlert): string {
  if (alert.code === "OFFICIAL_TRADING_HALTED") {
    return [
      "CRITICAL: official Stock Token trading halted",
      `Candidate: ${alert.candidateId} (${alert.symbol})`,
      `Address: ${alert.tokenAddress}`,
      `Observed: ${alert.observedAt}`,
    ].join("\n");
  }
  if (alert.code === "OFFICIAL_FEED_UNHEALTHY") {
    return ["CRITICAL: official feed became unhealthy", `Candidate: ${alert.candidateId}`, `Token: ${alert.tokenAddress}`, `Feed: ${alert.feedAddress}`, `Failure: ${alert.failureCode}`, `Observed: ${alert.observedAt}`].join("\n");
  }
  if (alert.code === "LIQUIDITY_BELOW_THRESHOLD") {
    return ["CRITICAL: liquidity fell below activation policy", `Candidate: ${alert.candidateId}`, `Token: ${alert.tokenAddress}`, `Pool: ${alert.poolAddress}`, `Failure: ${alert.failureCode}`, `Observed: ${alert.observedAt}`].join("\n");
  }
  if (alert.code === "OPTIONS_EXPOSURE_APPROACHING_CAP") {
    return ["CRITICAL: Options exposure is approaching its cap", `Candidate: ${alert.candidateId}`, `Token: ${alert.tokenAddress}`, `Risk manager: ${alert.riskManagerAddress}`, `Cap utilization: ${(alert.capUtilizationBps / 100).toFixed(2)}%`, `Observed: ${alert.observedAt}`].join("\n");
  }
  return [
    "CRITICAL: suspected fake Stock Token",
    `Candidate: ${alert.candidateId} (${alert.symbol})`,
    `Address: ${alert.tokenAddress}`,
    `Failures: ${alert.failures.join(", ")}`,
    `Observed: ${alert.observedAt}`,
  ].join("\n");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
