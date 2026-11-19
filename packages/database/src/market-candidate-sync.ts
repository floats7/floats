export interface MarketCandidateSyncConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly registryUrl?: URL;
  readonly fetch?: typeof globalThis.fetch;
}

interface CandidateRow {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly lifecycle_status: string;
}

export async function syncListedMarketCandidates(config: MarketCandidateSyncConfig): Promise<number> {
  if (config.databaseUrl.protocol !== "https:") throw new Error("Database URL must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Candidate sync requires a server-only secret key");
  const request = config.fetch ?? globalThis.fetch;
  const candidatesUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
  candidatesUrl.search = new URLSearchParams({
    select: "candidate_id,symbol,lifecycle_status",
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
  readonly status: string;
  readonly isin: string | undefined;
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
    select: "candidate_id,symbol,lifecycle_status",
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
    const nextStatus = tokenPrecedesOracle(candidate.lifecycle_status) ? "oracle_pending" : candidate.lifecycle_status;
    const updateUrl = databaseEndpoint(config, "/rest/v1/market_candidates");
    updateUrl.search = new URLSearchParams({
      environment: `eq.${config.environment}`,
      chain_id: `eq.${config.chainId}`,
      candidate_id: `eq.${candidate.candidate_id}`,
    }).toString();
    const now = new Date().toISOString();
    const updateResponse = await request(updateUrl, {
      method: "PATCH",
      headers: databaseHeaders(config, "return=minimal"),
      body: JSON.stringify({
        token_address: deployment.contractAddress.toLowerCase(),
        asset_uid: /^0x[0-9a-fA-F]{64}$/.test(asset.id) ? asset.id : null,
        isin: asset.isin ?? null,
        token_live: true,
        lifecycle_status: nextStatus,
        ...(nextStatus === "oracle_pending" ? { disabled_reason: "Oracle verification pending" } : {}),
        last_checked_at: now,
        updated_at: now,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!updateResponse.ok) throw new Error(`Candidate sync failed with status ${updateResponse.status}`);
    updated += 1;
  }
  return updated;
}

function tokenPrecedesOracle(status: string): boolean {
  return ["upcoming", "listing_expected", "listed", "token_pending", "token_live"].includes(status);
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
    return { id: text("id"), tokenSymbol: text("tokenSymbol"), status: text("status"),
      isin: optionalText("isin"), deployments };
  });
}
