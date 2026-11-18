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
    `${WALLET_NONCE_COOKIE}=${challenge.nonce}; Path=/api/wallet-history; HttpOnly; SameSite=Strict; Max-Age=300${requestUrl.protocol === "https:" ? "; Secure" : ""}`,
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
    const requestUrl = new URL(request.url);
    const wallet = await verifyWalletChallenge({
      requestUrl,
      message: body.message,
      signature: body.signature,
      cookieNonce: readCookie(request.headers.get("cookie"), WALLET_NONCE_COOKIE),
      chainId: context.publicConfig.chainId,
    });
    if (!wallet) return unauthorized();
    const nonce = readCookie(request.headers.get("cookie"), WALLET_NONCE_COOKIE);
    if (!nonce || !await context.readModels.consumeWalletChallenge(nonce, wallet, request.signal)) return unauthorized();
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
    response.headers.append("set-cookie", `${WALLET_NONCE_COOKIE}=; Path=/api/wallet-history; HttpOnly; SameSite=Strict; Max-Age=0`);
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

function isQuoteRequest(value: unknown): value is { direction: "deposit" | "redeem"; amount: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.direction === "deposit" || record.direction === "redeem") &&
    typeof record.amount === "string" &&
    /^[1-9][0-9]{0,77}$/.test(record.amount)
  );
}

function isWalletHistoryRequest(value: unknown): value is { message: string; signature: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.message === "string" && record.message.length <= 1_024 &&
    typeof record.signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(record.signature);
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
