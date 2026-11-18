import type { ApiContext } from "./context.ts";
import { createWalletChallenge, readCookie, verifyWalletChallenge, WALLET_NONCE_COOKIE } from "./wallet-auth.ts";

const PUBLIC_CACHE = "public, max-age=15, stale-while-revalidate=45";
const NO_STORE = "no-store";

export async function getPublicConfig(context: ApiContext): Promise<Response> {
  return json({ data: context.publicConfig }, 200, PUBLIC_CACHE);
}

export async function getFeeRates(context: ApiContext): Promise<Response> {
  try {
    return json({ data: await context.vaultQuotes.readFeeRates() }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function postVaultQuote(context: ApiContext, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("INVALID_JSON");
  }
  if (!isQuoteRequest(body)) return invalidRequest("INVALID_QUOTE_REQUEST");

  try {
    const quote = await context.vaultQuotes.quoteCash(body.direction, BigInt(body.amount));
    return json({ data: quote }, 200, NO_STORE);
  } catch {
    return internalError();
  }
}

export async function getWalletChallenge(context: ApiContext, request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const address = requestUrl.searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return invalidRequest("INVALID_WALLET_ADDRESS");
  const challenge = createWalletChallenge(requestUrl, address, context.publicConfig.chainId);
  await context.readModels.issueWalletChallenge(challenge.nonce, address, challenge.expiresAt, request.signal);
  const response = json({ data: { message: challenge.message, expiresAt: challenge.expiresAt } }, 200, NO_STORE);
  response.headers.append(
    "set-cookie",
    `${WALLET_NONCE_COOKIE}=${challenge.nonce}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=300${requestUrl.protocol === "https:" ? "; Secure" : ""}`,
  );
  return response;
}

export async function postWalletHistory(context: ApiContext, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("INVALID_JSON");
  }
  if (!isWalletHistoryRequest(body)) return invalidRequest("INVALID_SIGNATURE_REQUEST");
  try {
    const wallet = await authenticateWallet(context, request, body);
    if (!wallet) return unauthorized();
    const transactions = await context.readModels.listUserTransactions(wallet, 100, request.signal);
    const response = json({ data: transactions.map((transaction) => ({
      transactionHash: transaction.transaction_hash,
      action: transaction.action,
      status: transaction.status,
      blockNumber: transaction.block_number,
      assetAmount: transaction.asset_amount,
      shareAmount: transaction.share_amount,
      failureCode: transaction.failure_code,
      submittedAt: transaction.submitted_at,
      finalizedAt: transaction.finalized_at,
    })) }, 200, NO_STORE);
    clearWalletNonce(response);
    return response;
  } catch {
    return internalError();
  }
}

export async function postOptionsPortfolio(context: ApiContext, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("INVALID_JSON");
  }
  if (!isWalletHistoryRequest(body)) return invalidRequest("INVALID_SIGNATURE_REQUEST");
  try {
    const wallet = await authenticateWallet(context, request, body);
    if (!wallet) return unauthorized();
    const [positions, withdrawals] = await Promise.all([
      context.readModels.listOptionsPositions(wallet, request.signal),
      context.readModels.listOptionsWithdrawals(wallet, request.signal),
    ]);
    const response = json({ data: {
      walletAddress: wallet,
      positions: positions.map((item) => ({
        seriesId: item.series_id,
        underlying: item.underlying,
        underlyingSymbol: item.underlying_symbol,
        size18: item.size_18,
        netCashFlow6: item.net_cash_flow_6,
        updatedAt: item.updated_at,
      })),
      withdrawals: withdrawals.map((item) => ({
        requestId: item.request_id,
        state: item.state,
        receiverAddress: item.receiver_address,
        shares: item.shares,
        assets6: item.assets_6,
        unlockAt: item.unlock_at,
        updatedAt: item.updated_at,
      })),
    } }, 200, NO_STORE);
    clearWalletNonce(response);
    return response;
  } catch {
    return internalError();
  }
}

export async function getAssets(context: ApiContext, signal?: AbortSignal): Promise<Response> {
  try {
    const assets = await context.readModels.listActiveAssets(signal);
    return json({ data: assets.map((asset) => ({
      chainId: asset.chain_id,
      tokenAddress: asset.token_address,
      assetUid: asset.asset_uid,
      symbol: asset.symbol,
      decimals: asset.decimals,
      feedAddress: asset.feed_address,
      registryVersion: asset.registry_version,
      sourceBlock: asset.source_block,
      updatedAt: asset.updated_at,
      targetWeightBps: asset.target_weight_bps,
      eligibleFrom: asset.eligible_from,
      exitAfter: asset.exit_after,
      registryStatus: asset.registry_status,
    })) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getMarkets(context: ApiContext, signal?: AbortSignal): Promise<Response> {
  try {
    return json({ data: await context.markets.list(signal) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getMarket(
  context: ApiContext,
  assetId: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (!isMarketAssetId(assetId)) return invalidRequest("INVALID_MARKET_ASSET");
  try {
    const market = await context.markets.find(assetId, signal);
    return market
      ? json({ data: market }, 200, PUBLIC_CACHE)
      : json({ error: { code: "MARKET_NOT_FOUND" } }, 404, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getMarketHistory(
  context: ApiContext,
  assetId: string,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  if (!isMarketAssetId(assetId)) return invalidRequest("INVALID_MARKET_ASSET");
  const limit = parseBoundedLimit(requestUrl, 500, 2, 1000);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const history = await context.markets.history(assetId, limit, signal);
    return history
      ? json({ data: history }, 200, PUBLIC_CACHE)
      : json({ error: { code: "MARKET_NOT_FOUND" } }, 404, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getOptionsSeries(context: ApiContext, signal?: AbortSignal): Promise<Response> {
  try {
    const series = await context.readModels.listOptionsSeries(signal);
    return json({ data: series.map((item) => ({
      seriesId: item.series_id,
      underlying: item.underlying,
      underlyingSymbol: item.underlying_symbol,
      underlyingUid: item.underlying_uid,
      priceSource: item.price_source,
      kind: item.kind,
      strikeUsd18: item.strike_usd_18,
      capUsd18: item.cap_usd_18,
      expiry: item.expiry,
      contractSize18: item.contract_size_18,
      corporateActionPolicyVersion: item.corporate_action_policy_version,
      state: item.state,
      settlementPriceUsd18: item.settlement_price_usd_18,
      payoffPerUnitUsd18: item.payoff_per_unit_usd_18,
      totalClaimable6: item.total_claimable_6,
      manualSettlement: item.manual,
      createdAt: item.created_at,
    })) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function postOptionsQuote(context: ApiContext, request: Request): Promise<Response> {
  if (!context.optionsQuotes) return json({ error: { code: "OPTIONS_NOT_ACTIVE" } }, 503, NO_STORE);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("INVALID_JSON");
  }
  if (!isOptionsQuoteRequest(body)) return invalidRequest("INVALID_OPTIONS_QUOTE");
  try {
    const result = await context.optionsQuotes.quote({
      requestId: crypto.randomUUID(),
      seriesId: body.seriesId.toLowerCase(),
      buyer: body.buyer.toLowerCase(),
      side: body.side,
      size18: body.size18,
    }, request.signal);
    return json({ data: result }, 200, NO_STORE);
  } catch {
    return json({ error: { code: "QUOTE_UNAVAILABLE" } }, 503, NO_STORE);
  }
}

export async function getOptionsActivity(
  context: ApiContext,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const limit = parseLimit(requestUrl);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const activity = await context.readModels.listOptionsActivity(limit, signal);
    return json({ data: activity.map((item) => ({
      transactionHash: item.transaction_hash,
      logIndex: item.log_index,
      blockNumber: item.block_number,
      seriesId: item.series_id,
      walletAddress: item.wallet_address,
      eventName: item.event_name,
      size18: item.size_18,
      cashAmount6: item.cash_amount_6,
      observedAt: item.observed_at,
    })) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getOptionsVaultState(context: ApiContext): Promise<Response> {
  if (!context.optionsVault) return json({ data: null }, 200, PUBLIC_CACHE);
  try {
    return json({ data: await context.optionsVault.readState() }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getLatestIndexState(context: ApiContext, signal?: AbortSignal): Promise<Response> {
  try {
    const [nav] = await context.readModels.latestNav(context.vaultAddress, signal);
    if (!nav) return json({ data: null }, 200, PUBLIC_CACHE);
    const holdings = await context.readModels.listLatestHoldings(
      context.vaultAddress,
      nav.block_number,
      signal,
    );
    return json({ data: {
      blockNumber: nav.block_number,
      navUsd18: nav.nav_usd_18,
      totalSupply18: nav.total_supply_18,
      sharePriceUsd18: nav.share_price_usd_18,
      oracleHealth: nav.oracle_health,
      observedAt: nav.observed_at,
      holdings: holdings.map((holding) => ({
        tokenAddress: holding.token_address,
        rawBalance: holding.raw_balance,
        uiMultiplier18: holding.ui_multiplier_18,
        normalizedPriceUsd18: holding.normalized_price_usd_18,
        valueUsd18: holding.value_usd_18,
        oracleHealth: holding.oracle_health,
        oracleUpdatedAt: holding.oracle_updated_at,
      })),
    } }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getRegistryChanges(
  context: ApiContext,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const limit = parseLimit(requestUrl);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const changes = await context.readModels.listRegistryChanges(limit, signal);
    return json({ data: changes }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getNavHistory(
  context: ApiContext,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const limit = parseBoundedLimit(requestUrl, 500, 2, 1000);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const descending = await context.readModels.listNavHistory(context.vaultAddress, limit, signal);
    return json({ data: [...descending].reverse().map((point) => ({
      blockNumber: point.block_number,
      navUsd18: point.nav_usd_18,
      totalSupply18: point.total_supply_18,
      sharePriceUsd18: point.share_price_usd_18,
      oracleHealth: point.oracle_health,
      observedAt: point.observed_at,
    })) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getOperationalActions(
  context: ApiContext,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const module = requestUrl.searchParams.get("module");
  if (module !== "vault" && module !== "fees" && module !== "rebalance") {
    return invalidRequest("INVALID_MODULE");
  }
  const limit = parseLimit(requestUrl);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const actions = await context.readModels.listOperationalActions(module, limit, signal);
    return json({ data: actions }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export function internalError(): Response {
  return json({ error: { code: "INTERNAL_ERROR" } }, 500, NO_STORE);
}

function invalidRequest(code: string): Response {
  return json({ error: { code } }, 400, NO_STORE);
}

function unauthorized(): Response {
  return json({ error: { code: "INVALID_WALLET_SIGNATURE" } }, 401, NO_STORE);
}

async function authenticateWallet(
  context: ApiContext,
  request: Request,
  body: { message: string; signature: string },
): Promise<string | null> {
  const nonce = readCookie(request.headers.get("cookie"), WALLET_NONCE_COOKIE);
  const wallet = await verifyWalletChallenge({
    requestUrl: new URL(request.url),
    message: body.message,
    signature: body.signature,
    cookieNonce: nonce,
    chainId: context.publicConfig.chainId,
  });
  if (!wallet || !nonce) return null;
  return await context.readModels.consumeWalletChallenge(nonce, wallet, request.signal)
    ? wallet
    : null;
}

function clearWalletNonce(response: Response): void {
  response.headers.append(
    "set-cookie",
    `${WALLET_NONCE_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

function isQuoteRequest(value: unknown): value is { direction: "deposit" | "redeem"; amount: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.direction === "deposit" || record.direction === "redeem") &&
    typeof record.amount === "string" &&
    /^[1-9][0-9]{0,77}$/.test(record.amount)
  );
}

function isOptionsQuoteRequest(value: unknown): value is {
  seriesId: string; buyer: string; side: "buy" | "sell-back"; size18: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.seriesId === "string" && /^0x[0-9a-fA-F]{64}$/.test(item.seriesId) &&
    typeof item.buyer === "string" && /^0x[0-9a-fA-F]{40}$/.test(item.buyer) &&
    (item.side === "buy" || item.side === "sell-back") &&
    typeof item.size18 === "string" && /^[1-9][0-9]{0,77}$/.test(item.size18) &&
    BigInt(item.size18) <= (1n << 256n) - 1n;
}

function isWalletHistoryRequest(value: unknown): value is { message: string; signature: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.message === "string" && record.message.length <= 1_024 &&
    typeof record.signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(record.signature);
}

function isMarketAssetId(value: string): boolean {
  return value.toLowerCase() === "index" || /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseLimit(url: URL): number | undefined {
  return parseBoundedLimit(url, 50, 1, 100);
}

function parseBoundedLimit(
  url: URL,
  fallback: number,
  minimum: number,
  maximum: number,
): number | undefined {
  const raw = url.searchParams.get("limit");
  if (raw === null) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) return undefined;
  const limit = Number(raw);
  return Number.isSafeInteger(limit) && limit >= minimum && limit <= maximum ? limit : undefined;
}

function json(body: unknown, status: number, cacheControl: string): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": cacheControl,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
