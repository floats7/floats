import type { ApiContext } from "./context.ts";
import { createWalletChallenge, readCookie, verifyWalletChallenge, WALLET_NONCE_COOKIE } from "./wallet-auth.ts";

const PUBLIC_CACHE = "public, max-age=15, stale-while-revalidate=45";
const NO_STORE = "no-store";

export async function getPublicConfig(context: ApiContext): Promise<Response> {
  return json({ data: context.publicConfig }, 200, PUBLIC_CACHE);
}

export async function getBridgeMessages(
  context: ApiContext,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const limit = parseLimit(requestUrl);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const messages = await context.readModels.listCrossChainMessages(limit, signal);
    return json({ data: messages.map(mapCrossChainMessage) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getBridgeMessage(
  context: ApiContext,
  sourceEid: string,
  guid: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (!/^[1-9][0-9]*$/.test(sourceEid) || !/^0x[0-9a-fA-F]{64}$/.test(guid)) {
    return invalidRequest("INVALID_MESSAGE_IDENTITY");
  }
  const parsedSourceEid = Number(sourceEid);
  if (!Number.isSafeInteger(parsedSourceEid)) return invalidRequest("INVALID_MESSAGE_IDENTITY");
  try {
    const [message] = await context.readModels.getCrossChainMessage(
      parsedSourceEid,
      guid,
      signal,
    );
    if (!message) return json({ error: { code: "BRIDGE_MESSAGE_NOT_FOUND" } }, 404, PUBLIC_CACHE);
    return json({ data: mapCrossChainMessage(message) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getBridgeNav(
  context: ApiContext,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const destination = requestUrl.searchParams.get("destinationChainId");
  if (destination !== null && !/^[1-9][0-9]*$/.test(destination)) {
    return invalidRequest("INVALID_DESTINATION_CHAIN_ID");
  }
  const destinationChainId = destination === null ? undefined : Number(destination);
  if (destinationChainId !== undefined && !Number.isSafeInteger(destinationChainId)) {
    return invalidRequest("INVALID_DESTINATION_CHAIN_ID");
  }
  try {
    const [nav] = await context.readModels.latestCrossChainNav(destinationChainId, signal);
    if (!nav) return json({ data: null }, 200, PUBLIC_CACHE);
    return json({ data: {
      sourceChainId: nav.source_chain_id,
      destinationChainId: nav.destination_chain_id,
      sourceEid: nav.source_eid,
      destinationEid: nav.destination_eid,
      guid: nav.guid,
      sequence: nav.sequence,
      nav18: nav.nav_18,
      canonicalTotalSupply18: nav.canonical_total_supply_18,
      state: nav.state,
      sourceTransactionHash: nav.source_transaction_hash,
      destinationTransactionHash: nav.destination_transaction_hash,
      observedAt: nav.observed_at,
      publishedAt: nav.published_at,
      mirroredAt: nav.mirrored_at,
      updatedAt: nav.updated_at,
    } }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

function mapCrossChainMessage(
  message: Awaited<ReturnType<ApiContext["readModels"]["getCrossChainMessage"]>>[number],
) {
  return {
    sourceChainId: message.source_chain_id,
    destinationChainId: message.destination_chain_id,
    sourceEid: message.source_eid,
    destinationEid: message.destination_eid,
    guid: message.guid,
    sender: message.sender_address,
    recipient: message.recipient_address,
    token: message.token_address,
    amountLocal: message.amount_local,
    nativeFee: message.native_fee,
    state: message.state,
    sourceTransactionHash: message.source_transaction_hash,
    destinationTransactionHash: message.destination_transaction_hash,
    sentAt: message.sent_at,
    updatedAt: message.updated_at,
  };
}

export async function getFeeRates(context: ApiContext): Promise<Response> {
  try {
    return json({ data: await context.vaultQuotes.readFeeRates() }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export async function getMarketCandidateHistory(
  context: ApiContext,
  candidateId: string,
  requestUrl: URL,
  signal?: AbortSignal,
): Promise<Response> {
  const limit = parseBoundedLimit(requestUrl, 500, 2, 1000);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const candidates = await context.readModels.listMarketCandidates(signal);
    const candidate = candidates.find((item) => item.candidate_id === candidateId);
    if (!candidate) return json({ error: { code: "MARKET_CANDIDATE_NOT_FOUND" } }, 404, PUBLIC_CACHE);
    if (candidate.ticker_announced === false || (candidate.ipo_stage != null && candidate.ipo_stage !== "trading")) {
      return json({ data: [] }, 200, "public, max-age=300, stale-while-revalidate=900");
    }
    const history = await context.candidateMarketData.history(candidate.symbol, limit, signal);
    return json({ data: history }, 200, "public, max-age=60, stale-while-revalidate=300");
  } catch {
    return json({ data: [] }, 200, "public, max-age=30, stale-while-revalidate=60");
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

export async function getPublicWalletData(context: ApiContext, request: Request): Promise<Response> {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return invalidRequest("INVALID_WALLET_ADDRESS");
  }
  try {
    const wallet = address.toLowerCase();
    const [transactions, positions, withdrawals] = await Promise.all([
      context.readModels.listUserTransactions(wallet, 100, request.signal),
      context.readModels.listOptionsPositions(wallet, request.signal),
      context.readModels.listOptionsWithdrawals(wallet, request.signal),
    ]);
    return json({ data: {
      walletAddress: wallet,
      transactions: transactions.map(mapWalletTransaction),
      optionsPortfolio: {
        walletAddress: wallet,
        positions: positions.map((item) => ({ seriesId: item.series_id, underlying: item.underlying, underlyingSymbol: item.underlying_symbol, size18: item.size_18, netCashFlow6: item.net_cash_flow_6, updatedAt: item.updated_at })),
        withdrawals: withdrawals.map((item) => ({ requestId: item.request_id, state: item.state, receiverAddress: item.receiver_address, shares: decimalString(item.shares), assets6: nullableDecimalString(item.assets_6), unlockAt: item.unlock_at, updatedAt: item.updated_at })),
      },
    } }, 200, NO_STORE);
  } catch {
    return internalError();
  }
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
        shares: decimalString(item.shares),
        assets6: nullableDecimalString(item.assets_6),
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

export async function postWalletData(context: ApiContext, request: Request): Promise<Response> {
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
    const [transactions, positions, withdrawals] = await Promise.all([
      context.readModels.listUserTransactions(wallet, 100, request.signal),
      context.readModels.listOptionsPositions(wallet, request.signal),
      context.readModels.listOptionsWithdrawals(wallet, request.signal),
    ]);
    const response = json({ data: {
      walletAddress: wallet,
      transactions: transactions.map(mapWalletTransaction),
      optionsPortfolio: {
        walletAddress: wallet,
        positions: positions.map((item) => ({ seriesId: item.series_id, underlying: item.underlying, underlyingSymbol: item.underlying_symbol, size18: item.size_18, netCashFlow6: item.net_cash_flow_6, updatedAt: item.updated_at })),
        withdrawals: withdrawals.map((item) => ({ requestId: item.request_id, state: item.state, receiverAddress: item.receiver_address, shares: decimalString(item.shares), assets6: nullableDecimalString(item.assets_6), unlockAt: item.unlock_at, updatedAt: item.updated_at })),
      },
    } }, 200, NO_STORE);
    clearWalletNonce(response);
    return response;
  } catch {
    return internalError();
  }
}

export async function getPublicActivity(context: ApiContext, requestUrl: URL, signal?: AbortSignal): Promise<Response> {
  const limit = parseLimit(requestUrl);
  if (limit === undefined) return invalidRequest("INVALID_LIMIT");
  try {
    const [vault, options, withdrawals] = await Promise.all([
      context.readModels.listPublicUserTransactions(limit, signal),
      context.readModels.listOptionsActivity(limit, signal),
      context.readModels.listOptionsWithdrawalActivity(limit, signal),
    ]);
    const activity = [
      ...vault.map((item) => ({ transactionHash: item.transaction_hash, blockNumber: item.block_number, walletAddress: item.wallet_address, action: item.action, assetAmount: item.asset_amount, shareAmount: item.share_amount, observedAt: item.finalized_at ?? item.submitted_at })),
      ...options.map((item) => ({ transactionHash: item.transaction_hash, blockNumber: item.block_number, walletAddress: item.wallet_address, action: item.event_name, assetAmount: item.cash_amount_6, shareAmount: item.size_18, observedAt: item.observed_at })),
      ...withdrawals.filter((item) => item.owner_address || item.receiver_address).map((item) => ({ transactionHash: item.transaction_hash, blockNumber: item.block_number, walletAddress: item.owner_address ?? item.receiver_address ?? "", action: item.event_name, assetAmount: nullableDecimalString(item.assets_6), shareAmount: decimalString(item.shares), observedAt: item.observed_at })),
    ].sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt)).slice(0, limit);
    return json({ data: activity }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

function mapWalletTransaction(transaction: Awaited<ReturnType<ApiContext["readModels"]["listUserTransactions"]>>[number]) {
  return { transactionHash: transaction.transaction_hash, action: transaction.action, status: transaction.status, blockNumber: transaction.block_number, assetAmount: transaction.asset_amount, shareAmount: transaction.share_amount, failureCode: transaction.failure_code, submittedAt: transaction.submitted_at, finalizedAt: transaction.finalized_at };
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

export async function getMarketCandidates(context: ApiContext, signal?: AbortSignal): Promise<Response> {
  try {
    const candidates = await context.readModels.listMarketCandidates(signal);
    return json({ data: orderMarketCandidates(candidates).map((item) => ({
      id: item.candidate_id,
      symbol: item.symbol,
      name: item.company_name,
      status: publicCandidateStatus(item),
      ipoDate: item.ipo_date,
      listingDate: item.expected_listing_date,
      eligibleFrom: item.eligible_from,
      ipoStage: item.ipo_stage ?? null,
      tickerAnnounced: item.ticker_announced ?? true,
      exchange: item.exchange ?? null,
      priceRangeLow: item.price_range_low ?? null,
      priceRangeHigh: item.price_range_high ?? null,
      ipoPrice: item.ipo_price ?? null,
      stageSourceUrl: item.stage_source_url ?? null,
      stageUpdatedAt: item.stage_updated_at ?? null,
      sourceUrl: item.source_url,
      tokenAddress: item.token_address,
      officialTokenName: item.official_token_name,
      tokenDecimals: item.token_decimals,
      currentMultiplier: item.current_multiplier,
      pendingMultiplier: item.pending_multiplier,
      tradingCapabilities: normalizeTradingCapabilities(item.trading_capabilities),
      officialMetadataObservedAt: item.official_metadata_observed_at,
      tradingHalted: item.trading_halted,
      officialQuoteGeneratedAt: item.official_quote_generated_at,
      logoUrl: item.logo_url,
      checks: { tokenLive: item.token_live, priceFeed: item.oracle_ready, liquidity: item.liquidity_ready },
      oracle: {
        feedAddress: item.official_feed_address,
        healthySince: item.oracle_healthy_since,
        lastPrice18: nullableLargeInteger(item.oracle_last_price_18),
        lastFailure: item.oracle_last_failure,
      },
      liquidity: {
        dexReferencePrice18: nullableLargeInteger(item.dex_reference_price_18),
        observedAt: item.liquidity_observed_at,
      },
      governanceApproved: item.governance_approved,
      productControls: {
        spotPaused: item.spot_paused,
        optionsPaused: item.options_paused,
        optionsExposureWarning: item.options_exposure_warning,
        reason: item.product_pause_reason,
        updatedAt: item.product_control_updated_at,
      },
      disabledReason: item.disabled_reason,
      lastCheckedAt: item.last_checked_at,
      publication: {
        detectedAt: item.official_token_detected_at,
        availableAt: item.public_available_at,
        slaSeconds: item.publication_sla_seconds,
        targetSeconds: 300,
        withinTarget: item.publication_sla_seconds === null ? null : item.publication_sla_seconds <= 300,
      },
    })) }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

function orderMarketCandidates<T extends {
  readonly ipo_stage?: string | null;
  readonly lifecycle_status: string;
  readonly identity_approval_status: string;
  readonly token_live: boolean;
  readonly liquidity_ready: boolean;
  readonly trading_halted: boolean | null;
  readonly spot_paused: boolean;
  readonly trading_capabilities: unknown;
}>(candidates: readonly T[]): readonly T[] {
  const rank: Readonly<Record<string, number>> = {
    trading: 6,
    priced: 5,
    roadshow: 4,
    public_s1: 3,
    confidential_filed: 2,
    withdrawn: 0,
  };
  return candidates
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const stageDifference = (rank[right.item.ipo_stage ?? ""] ?? 1) - (rank[left.item.ipo_stage ?? ""] ?? 1);
      return stageDifference || left.index - right.index;
    })
    .map(({ item }) => item);
}

export async function getMarketCandidateReadiness(
  context: ApiContext,
  candidateId: string,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    const candidate = (await context.readModels.listMarketCandidates(signal))
      .find((item) => item.candidate_id === candidateId);
    if (!candidate) {
      return json({ error: { code: "MARKET_CANDIDATE_NOT_FOUND" } }, 404, PUBLIC_CACHE);
    }
    const signoffs = await context.readModels.listMarketCandidateSignoffs(candidateId, signal);
    return json({
      data: {
        ...buildMarketCandidateReadiness(context, candidate),
        signoffs: signoffs.map((signoff) => ({
          id: signoff.id,
          tier: signoff.tier,
          decision: signoff.decision,
          governanceOrCanaryReference: signoff.governance_or_canary_reference,
          signedAt: signoff.signed_at,
        })),
      },
    }, 200, PUBLIC_CACHE);
  } catch {
    return internalError();
  }
}

export function buildMarketCandidateReadiness(
  context: Pick<ApiContext, "publicConfig">,
  candidate: Awaited<ReturnType<ApiContext["readModels"]["listMarketCandidates"]>>[number],
  now = new Date(),
) {
  const identityApproved = candidate.identity_approval_status === "approved";
  const canonicalToken = identityApproved && candidate.token_live && candidate.token_address !== null;
  const spotRoute = canonicalToken && context.publicConfig.spotRoutes.some(
    (route) => route.tokenAddress.toLowerCase() === candidate.token_address?.toLowerCase(),
  );
  const optionsInfrastructure = context.publicConfig.optionsMarketAddress !== null
    && context.publicConfig.optionsVaultAddress !== null;
  const eligibleAt = candidate.eligible_from === null
    ? null
    : Date.parse(`${candidate.eligible_from}T00:00:00Z`);
  const eligibilityReached = eligibleAt !== null && Number.isFinite(eligibleAt) && now.getTime() >= eligibleAt;

  return {
    candidateId: candidate.candidate_id,
    symbol: candidate.symbol,
    canonicalAddress: identityApproved ? candidate.token_address : null,
    checkedAt: candidate.last_checked_at,
    tiers: {
      market: readinessTier([
        ["canonical_identity_approved", identityApproved],
        ["official_token_live", canonicalToken],
      ]),
      spot: readinessTier([
        ["canonical_token", canonicalToken],
        ["executable_route", spotRoute],
        ["liquidity_threshold", candidate.liquidity_ready],
        ["trading_not_halted", candidate.trading_halted === false],
        ["operator_not_paused", !candidate.spot_paused],
      ]),
      options: readinessTier([
        ["canonical_token", canonicalToken],
        ["official_feed_healthy", candidate.oracle_ready],
        ["options_infrastructure", optionsInfrastructure],
        ["trading_not_halted", candidate.trading_halted === false],
        ["operator_not_paused", !candidate.options_paused],
        ["exposure_below_warning", !candidate.options_exposure_warning],
      ], candidate.oracle_last_failure),
      index: readinessTier([
        ["canonical_token", canonicalToken],
        ["fifth_trading_day_reached", eligibilityReached],
        ["governance_executed", candidate.governance_approved],
      ]),
    },
  };
}

function readinessTier(checks: ReadonlyArray<readonly [string, boolean]>, detail: string | null = null) {
  const gates = Object.fromEntries(checks);
  const blockers = checks.filter(([, passed]) => !passed).map(([name]) => name);
  return { ready: blockers.length === 0, gates, blockers, detail };
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

function decimalString(value: unknown): string {
  const normalized = typeof value === "bigint"
    ? value.toString()
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : value;
  if (typeof normalized !== "string" || !/^[0-9]+$/.test(normalized)) {
    throw new Error("INVALID_DECIMAL_VALUE");
  }
  return normalized;
}

function nullableDecimalString(value: unknown): string | null {
  return value === null || value === undefined ? null : decimalString(value);
}

function nullableLargeInteger(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0) {
    return BigInt(value).toString();
  }
  throw new Error("INVALID_LARGE_INTEGER");
}

function publicCandidateStatus(candidate: {
  readonly lifecycle_status: string;
  readonly identity_approval_status: string;
  readonly token_live: boolean;
  readonly liquidity_ready: boolean;
  readonly trading_halted: boolean | null;
  readonly spot_paused: boolean;
  readonly trading_capabilities: unknown;
}): string {
  const market = candidate.trading_capabilities && typeof candidate.trading_capabilities === "object"
    ? (candidate.trading_capabilities as { market?: { whole?: unknown } }).market?.whole
    : undefined;
  const spotReady = candidate.identity_approval_status === "approved"
    && candidate.token_live
    && candidate.liquidity_ready
    && candidate.trading_halted === false
    && !candidate.spot_paused
    && market === "TRADING_STATUS_TRADABLE";
  return spotReady ? "active" : candidate.lifecycle_status;
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
import { normalizeTradingCapabilities } from "../../../packages/database/src/trading-capabilities.ts";
