export interface MarketCandidateSyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly registryUrl?: URL;
  readonly fetch?: typeof globalThis.fetch;
  readonly onAlert?: (alert: MarketCandidateOperationalAlert) => Promise<void>;
}

export interface MarketCandidateOperationalAlert {
  readonly severity: "critical";
  readonly code: "OFFICIAL_TRADING_HALTED";
  readonly candidateId: string;
  readonly symbol: string;
  readonly tokenAddress: string;
  readonly observedAt: string;
}

interface CandidateRow {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly lifecycle_status: string;
  readonly detected_token_address?: string | null;
  readonly identity_approval_status?: string;
  readonly token_address?: string | null;
  readonly trading_halted?: boolean | null;
}

export async function syncListedMarketCandidates(config: MarketCandidateSyncConfig): Promise<number> {
  if (config.databaseUrl.protocol !== "https:") throw new Error("Database URL must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Candidate sync requires a server-only secret key");
  const request = config.fetch ?? globalThis.fetch;
  const candidatesUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
  candidatesUrl.search = new URLSearchParams({
    select: "candidate_id,symbol,lifecycle_status,detected_token_address,identity_approval_status,token_address,trading_halted",
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
    lifecycle_status: "eq.listing_expected",
  }).toString();
  const response = await request(candidatesUrl, {
    headers: databaseHeaders(config),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Candidate listing read failed with status ${response.status}`);
  const candidates = await response.json() as CandidateRow[];

  let updated = 0;
  for (const candidate of candidates) {
    if (!await hasPublicTrades(candidate.symbol, request)) continue;
    const updateUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
    updateUrl.search = new URLSearchParams({
      environment: `eq.${config.environment}`,
      chain_id: `eq.${config.chainId}`,
      candidate_id: `eq.${candidate.candidate_id}`,
      lifecycle_status: "eq.listing_expected",
    }).toString();
    const now = new Date().toISOString();
    const update = await request(updateUrl, {
      method: "PATCH",
      headers: databaseHeaders(config, "return=minimal"),
      body: JSON.stringify({
        lifecycle_status: "listed",
        disabled_reason: "Official Stock Token pending",
        last_checked_at: now,
        updated_at: now,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!update.ok) throw new Error(`Candidate listing sync failed with status ${update.status}`);
    updated += 1;
  }
  return updated;
}

interface RegistryAsset {
  readonly id: string;
  readonly tokenSymbol: string;
  readonly tokenName: string;
  readonly status: string;
  readonly isin: string | undefined;
  readonly logoUrl: string | undefined;
  readonly tokenDecimals: number | undefined;
  readonly currentMultiplier: string | undefined;
  readonly pendingMultiplier: string | undefined;
  readonly tradingCapabilities: Readonly<Record<string, unknown>> | undefined;
  readonly deployments: readonly { readonly contractAddress: string; readonly chainId: number }[];
}

export async function syncOfficialMarketCandidates(config: MarketCandidateSyncConfig): Promise<number> {
  if (config.databaseUrl.protocol !== "https:") throw new Error("Database URL must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Candidate sync requires a server-only secret key");
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw new Error("Candidate sync chain ID is invalid");

  const request = config.fetch ?? globalThis.fetch;
  const registryUrl = config.registryUrl ?? new URL("https://api.robinhood.com/rhj/assets");
  if (registryUrl.protocol !== "https:") throw new Error("Registry URL must use HTTPS");
  const registryResponse = await request(registryUrl, { signal: AbortSignal.timeout(15_000) });
  if (!registryResponse.ok) throw new Error(`RHJ registry returned ${registryResponse.status}`);
  const assets = parseAssets(await registryResponse.json());
  const bySymbol = new Map(assets.map((asset) => [asset.tokenSymbol.toUpperCase(), asset]));

  const candidatesUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
  candidatesUrl.search = new URLSearchParams({
    select: "candidate_id,symbol,lifecycle_status,detected_token_address,identity_approval_status,token_address,trading_halted",
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
  }).toString();
  const currentResponse = await request(candidatesUrl, {
    headers: databaseHeaders(config),
    signal: AbortSignal.timeout(30_000),
  });
  if (!currentResponse.ok) throw new Error(`Candidate read failed with status ${currentResponse.status}`);
  const candidates = await currentResponse.json() as CandidateRow[];

  let updated = 0;
  for (const candidate of candidates) {
    const asset = bySymbol.get(candidate.symbol.toUpperCase());
    const deployment = asset?.deployments.find((item) => item.chainId === config.chainId);
    if (!asset || !deployment || asset.status !== "ASSET_STATUS_ACTIVE") continue;
    if (isApprovedIdentity(candidate.identity_approval_status)) {
      if (candidate.token_address?.toLowerCase() !== deployment.contractAddress.toLowerCase()) continue;
      await refreshApprovedCandidate(config, candidate, asset, deployment.contractAddress, request);
      updated += 1;
      continue;
    }
    if (!identityCanBeObserved(candidate.lifecycle_status)) continue;
    const tokenAddress = deployment.contractAddress.toLowerCase();
    if (candidate.lifecycle_status === "verification_pending"
      && candidate.identity_approval_status === "pending"
      && candidate.detected_token_address?.toLowerCase() === tokenAddress) continue;
    const observedAt = new Date().toISOString();
    const officialQuote = await readOfficialQuote(asset.tokenSymbol, request);
    await recordIdentityObservation(config, candidate.candidate_id, tokenAddress, asset, observedAt, request);
    const updateUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
    updateUrl.search = new URLSearchParams({
      environment: `eq.${config.environment}`,
      chain_id: `eq.${config.chainId}`,
      candidate_id: `eq.${candidate.candidate_id}`,
      lifecycle_status: "in.(upcoming,listing_expected,listed,token_pending,detected,verification_pending)",
      identity_approval_status: "in.(unreviewed,pending)",
    }).toString();
    const updateResponse = await request(updateUrl, {
      method: "PATCH",
      headers: databaseHeaders(config, "return=minimal"),
      body: JSON.stringify({
        detected_token_address: tokenAddress,
        asset_uid: /^0x[0-9a-fA-F]{64}$/.test(asset.id) ? asset.id : null,
        isin: asset.isin ?? null,
        logo_url: asset.logoUrl ?? null,
        official_token_name: asset.tokenName,
        token_decimals: asset.tokenDecimals ?? null,
        current_multiplier: asset.currentMultiplier ?? null,
        pending_multiplier: asset.pendingMultiplier || null,
        trading_capabilities: asset.tradingCapabilities ?? null,
        official_metadata_observed_at: observedAt,
        trading_halted: officialQuote?.isTradingHalt ?? null,
        official_quote_generated_at: officialQuote?.generatedAt ?? null,
        lifecycle_status: "verification_pending",
        identity_approval_status: "pending",
        disabled_reason: "Canonical identity verification pending",
        last_checked_at: observedAt,
        updated_at: observedAt,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!updateResponse.ok) throw new Error(`Candidate sync failed with status ${updateResponse.status}`);
    updated += 1;
  }
  return updated;
}

async function refreshApprovedCandidate(
  config: MarketCandidateSyncConfig,
  candidate: CandidateRow,
  asset: RegistryAsset,
  tokenAddress: string,
  request: typeof globalThis.fetch,
): Promise<void> {
  const observedAt = new Date().toISOString();
  const officialQuote = await readOfficialQuote(asset.tokenSymbol, request);
  const updateUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
  updateUrl.search = new URLSearchParams({
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
    candidate_id: `eq.${candidate.candidate_id}`,
    token_address: `eq.${tokenAddress.toLowerCase()}`,
    identity_approval_status: "in.(approved,legacy_approved)",
  }).toString();
  const update = await request(updateUrl, {
    method: "PATCH",
    headers: databaseHeaders(config, "return=minimal"),
    body: JSON.stringify({
      official_token_name: asset.tokenName,
      token_decimals: asset.tokenDecimals ?? null,
      current_multiplier: asset.currentMultiplier ?? null,
      pending_multiplier: asset.pendingMultiplier || null,
      trading_capabilities: asset.tradingCapabilities ?? null,
      official_metadata_observed_at: observedAt,
      trading_halted: officialQuote?.isTradingHalt ?? candidate.trading_halted ?? null,
      official_quote_generated_at: officialQuote?.generatedAt ?? null,
      logo_url: asset.logoUrl ?? null,
      last_checked_at: observedAt,
      updated_at: observedAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!update.ok) throw new Error(`Approved candidate refresh failed with status ${update.status}`);
  if (candidate.trading_halted !== true && officialQuote?.isTradingHalt === true) {
    await config.onAlert?.({
      severity: "critical",
      code: "OFFICIAL_TRADING_HALTED",
      candidateId: candidate.candidate_id,
      symbol: candidate.symbol,
      tokenAddress: tokenAddress.toLowerCase(),
      observedAt,
    });
  }
}

function isApprovedIdentity(status: string | undefined): boolean {
  return status === "approved" || status === "legacy_approved";
}

async function readOfficialQuote(
  symbol: string,
  request: typeof globalThis.fetch,
): Promise<{ readonly isTradingHalt: boolean; readonly generatedAt: string } | undefined> {
  const url = new URL(`https://api.robinhood.com/rhj/prices/${encodeURIComponent(symbol)}`);
  try {
    const response = await request(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return undefined;
    const payload = await response.json() as { quotes?: unknown };
    if (!Array.isArray(payload.quotes)) return undefined;
    const quote = payload.quotes.find((item) => item && typeof item === "object"
      && (item as { tokenSymbol?: unknown }).tokenSymbol === symbol) as Record<string, unknown> | undefined;
    if (!quote || typeof quote.isTradingHalt !== "boolean" || typeof quote.generatedAt !== "string"
      || !Number.isFinite(Date.parse(quote.generatedAt))) return undefined;
    return { isTradingHalt: quote.isTradingHalt, generatedAt: quote.generatedAt };
  } catch {
    return undefined;
  }
}

function identityCanBeObserved(status: string): boolean {
  return ["upcoming", "listing_expected", "listed", "token_pending", "detected", "verification_pending"].includes(status);
}

async function recordIdentityObservation(
  config: MarketCandidateSyncConfig,
  candidateId: string,
  tokenAddress: string,
  asset: RegistryAsset,
  observedAt: string,
  request: typeof globalThis.fetch,
): Promise<void> {
  const evidence = {
    assetId: asset.id,
    tokenSymbol: asset.tokenSymbol,
    status: asset.status,
    chainId: config.chainId,
  };
  const canonical = JSON.stringify(evidence);
  const evidenceHash = `0x${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const observationsUrl = databaseEndpoint(config, "/rest/v1/market_candidate_identity_observations");
  observationsUrl.search = new URLSearchParams({
    on_conflict: "environment,chain_id,candidate_id,token_address,source_kind,evidence_hash",
  }).toString();
  const response = await request(observationsUrl, {
    method: "POST",
    headers: databaseHeaders(config, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({
      environment: config.environment,
      chain_id: config.chainId,
      candidate_id: candidateId,
      token_address: tokenAddress,
      source_kind: "robinhood_asset_registry",
      source_url: "https://api.robinhood.com/rhj/assets",
      passed: true,
      evidence,
      evidence_hash: evidenceHash,
      observed_at: observedAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Candidate identity observation failed with status ${response.status}`);
}

async function hasPublicTrades(symbol: string, request: typeof globalThis.fetch): Promise<boolean> {
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol.toUpperCase())) return false;
  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.toUpperCase())}/chart`);
  url.searchParams.set("assetclass", "stocks");
  try {
    const response = await request(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; FloatsCandidateSync/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const data = (value as { data?: unknown }).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const chart = (data as { chart?: unknown }).chart;
    return Array.isArray(chart) && chart.some((point) => point && typeof point === "object"
      && typeof (point as { x?: unknown }).x === "number" && typeof (point as { y?: unknown }).y === "number");
  } catch {
    return false;
  }
}

function databaseEndpoint(config: MarketCandidateSyncConfig, path: string): URL {
  return new URL(path, config.databaseUrl);
}

function databaseHeaders(config: MarketCandidateSyncConfig, prefer?: string): Record<string, string> {
  return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) };
}

function parseAssets(value: unknown): RegistryAsset[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RHJ registry returned an invalid payload");
  const assets = (value as { assets?: unknown }).assets;
  if (!Array.isArray(assets)) throw new Error("RHJ registry returned an invalid asset list");
  return assets.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("RHJ registry returned an invalid asset");
    const asset = raw as Record<string, unknown>;
    const text = (key: string) => {
      const item = asset[key];
      if (typeof item !== "string" || !item) throw new Error(`RHJ asset ${key} is invalid`);
      return item;
    };
    if (!Array.isArray(asset.deployments)) throw new Error("RHJ asset deployments are invalid");
    const deployments = asset.deployments.map((rawDeployment) => {
      if (!rawDeployment || typeof rawDeployment !== "object" || Array.isArray(rawDeployment)) throw new Error("RHJ deployment is invalid");
      const deployment = rawDeployment as Record<string, unknown>;
      if (typeof deployment.chainId !== "number" || !Number.isSafeInteger(deployment.chainId)) throw new Error("RHJ deployment chainId is invalid");
      if (typeof deployment.contractAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(deployment.contractAddress)) throw new Error("RHJ deployment address is invalid");
      return { chainId: deployment.chainId, contractAddress: deployment.contractAddress };
    });
    const optionalText = (key: string) => asset[key] == null ? undefined : text(key);
    const optionalPossiblyEmptyText = (key: string) => {
      const item = asset[key];
      if (item == null) return undefined;
      if (typeof item !== "string") throw new Error(`RHJ asset ${key} is invalid`);
      return item;
    };
    const optionalInteger = (key: string) => {
      const item = asset[key];
      if (item == null) return undefined;
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0 || item > 36) {
        throw new Error(`RHJ asset ${key} is invalid`);
      }
      return item;
    };
    const optionalObject = (key: string) => {
      const item = asset[key];
      if (item == null) return undefined;
      if (typeof item !== "object" || Array.isArray(item)) throw new Error(`RHJ asset ${key} is invalid`);
      return item as Readonly<Record<string, unknown>>;
    };
    return { id: text("id"), tokenSymbol: text("tokenSymbol"), tokenName: text("tokenName"), status: text("status"),
      isin: optionalText("isin"), logoUrl: optionalText("logoUrl"), tokenDecimals: optionalInteger("tokenDecimals"),
      currentMultiplier: optionalText("currentMultiplier"), pendingMultiplier: optionalPossiblyEmptyText("pendingMultiplier"),
      tradingCapabilities: optionalObject("tradingCapabilities"), deployments };
  });
}
