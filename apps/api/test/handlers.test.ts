import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import type { ApiContext } from "../src/context.ts";
import {
  getBridgeMessage,
  getBridgeMessages,
  getBridgeNav,
  getLatestIndexState,
  getMarket,
  getMarketCandidates,
  getMarketCandidateReadiness,
  getMarketHistory,
  getMarkets,
  getNavHistory,
  getOperationalActions,
  getOptionsActivity,
  getOptionsSeries,
  getOptionsVaultState,
  getWalletChallenge,
  postOptionsPortfolio,
  postOptionsQuote,
  getPublicConfig,
  getRegistryChanges,
} from "../src/handlers.ts";
import type { ReadModelRepository } from "../src/read-model-repository.ts";
import type { VaultQuoteReader } from "../src/vault-quote-reader.ts";
import type { OptionsQuoteClient } from "../src/options-quote-client.ts";
import type { MarketCatalog } from "../src/market-catalog.ts";
import type { CandidateMarketData } from "../src/candidate-market-data.ts";

function context(readModels: Partial<ReadModelRepository> = {}): ApiContext {
  return {
    publicConfig: {
      appEnvironment: "testnet",
      chainId: 46630,
      blockExplorerUrl: "https://explorer.testnet.chain.robinhood.com/",
      vaultAddress: `0x${"1".repeat(40)}`,
      usdgAddress: `0x${"2".repeat(40)}`,
      walletConnectProjectId: "0123456789abcdef0123456789abcdef",
      optionsMarketAddress: null,
      optionsVaultAddress: null,
      optionTokenAddress: null,
      spotRoutes: [],
      crossChainRoutes: [],
    },
    vaultAddress: `0x${"1".repeat(40)}`,
    readModels: readModels as ReadModelRepository,
    vaultQuotes: {} as VaultQuoteReader,
    markets: {} as MarketCatalog,
    candidateMarketData: {} as CandidateMarketData,
  };
}

test("public config endpoint cannot expose Supabase configuration", async () => {
  const response = await getPublicConfig(context());
  const body = JSON.stringify(await response.json());

  assert.equal(response.status, 200);
  assert.equal(body.includes("supabase"), false);
  assert.equal(body.includes("secret"), false);
  assert.match(response.headers.get("cache-control") ?? "", /max-age=15/);
});

test("bridge history is bounded and exposes stable public fields", async () => {
  let observedLimit: number | undefined;
  const message = {
    source_chain_id: 4663,
    destination_chain_id: 33001,
    source_eid: 30416,
    destination_eid: 30500,
    guid: `0x${"1".repeat(64)}`,
    sender_address: `0x${"2".repeat(40)}`,
    recipient_address: `0x${"3".repeat(40)}`,
    token_address: `0x${"4".repeat(40)}`,
    amount_local: "1000000000000",
    native_fee: "10",
    state: "pending" as const,
    source_transaction_hash: `0x${"5".repeat(64)}`,
    destination_transaction_hash: null,
    sent_at: "2026-11-19T00:00:00.000Z",
    updated_at: "2026-11-19T00:00:00.000Z",
  };
  const response = await getBridgeMessages(
    context({
      listCrossChainMessages: async (limit) => {
        observedLimit = limit;
        return [message];
      },
    }),
    new URL("https://floats.test/api/bridge/messages?limit=25"),
  );

  assert.equal(response.status, 200);
  assert.equal(observedLimit, 25);
  assert.deepEqual((await response.json() as { data: unknown[] }).data, [{
    sourceChainId: 4663,
    destinationChainId: 33001,
    sourceEid: 30416,
    destinationEid: 30500,
    guid: message.guid,
    sender: message.sender_address,
    recipient: message.recipient_address,
    token: message.token_address,
    amountLocal: message.amount_local,
    nativeFee: message.native_fee,
    state: "pending",
    sourceTransactionHash: message.source_transaction_hash,
    destinationTransactionHash: null,
    sentAt: message.sent_at,
    updatedAt: message.updated_at,
  }]);

  const invalid = await getBridgeMessages(
    context(),
    new URL("https://floats.test/api/bridge/messages?limit=101"),
  );
  assert.equal(invalid.status, 400);
});

test("bridge message status validates identity and returns not found", async () => {
  const guid = `0x${"a".repeat(64)}`;
  const missing = await getBridgeMessage(
    context({ getCrossChainMessage: async () => [] }),
    "30416",
    guid,
  );
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: "BRIDGE_MESSAGE_NOT_FOUND" } });

  const invalid = await getBridgeMessage(context(), "0", "invalid");
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: { code: "INVALID_MESSAGE_IDENTITY" } });
});

test("bridge NAV returns the latest canonical projection for one destination", async () => {
  let observedDestination: number | undefined;
  const nav = {
    source_chain_id: 4663,
    destination_chain_id: 33001,
    source_eid: 30416,
    destination_eid: 30500,
    guid: `0x${"b".repeat(64)}`,
    sequence: "7",
    nav_18: "1000000000000000000",
    canonical_total_supply_18: "500000000000000000000",
    state: "mirrored" as const,
    source_transaction_hash: `0x${"c".repeat(64)}`,
    destination_transaction_hash: `0x${"d".repeat(64)}`,
    observed_at: "2026-11-19T00:00:00.000Z",
    published_at: "2026-11-19T00:00:01.000Z",
    mirrored_at: "2026-11-19T00:00:10.000Z",
    updated_at: "2026-11-19T00:00:10.000Z",
  };
  const response = await getBridgeNav(
    context({ latestCrossChainNav: async (destination) => {
      observedDestination = destination;
      return [nav];
    } }),
    new URL("https://floats.test/api/bridge/nav?destinationChainId=33001"),
  );

  assert.equal(response.status, 200);
  assert.equal(observedDestination, 33001);
  assert.deepEqual((await response.json() as { data: unknown }).data, {
    sourceChainId: 4663,
    destinationChainId: 33001,
    sourceEid: 30416,
    destinationEid: 30500,
    guid: nav.guid,
    sequence: "7",
    nav18: nav.nav_18,
    canonicalTotalSupply18: nav.canonical_total_supply_18,
    state: "mirrored",
    sourceTransactionHash: nav.source_transaction_hash,
    destinationTransactionHash: nav.destination_transaction_hash,
    observedAt: nav.observed_at,
    publishedAt: nav.published_at,
    mirroredAt: nav.mirrored_at,
    updatedAt: nav.updated_at,
  });

  const invalid = await getBridgeNav(
    context(),
    new URL("https://floats.test/api/bridge/nav?destinationChainId=0"),
  );
  assert.equal(invalid.status, 400);
});

test("market endpoints expose capability-driven assets and bounded canonical history", async () => {
  const market = {
    id: `0x${"1".repeat(40)}`,
    kind: "index" as const,
    address: `0x${"1".repeat(40)}`,
    uid: null,
    symbol: "INDEX",
    name: "Index Token",
    decimals: 18,
    status: "active" as const,
    priceUsd18: "1000000000000000000",
    targetWeightBps: null,
    oracleHealth: "nav",
    products: [{ id: "mint-redeem" as const, label: "Buy & Sell", enabled: true }],
    activeOptionSeries: 0,
    chartKind: "nav" as const,
  };
  let observedLimit = 0;
  const markets = {
    async list() { return [market]; },
    async find(id: string) { return id === "index" ? market : undefined; },
    async history(_id: string, limit: number) {
      observedLimit = limit;
      return [{ blockNumber: 1, valueUsd18: "1000000000000000000", observedAt: "2026-01-01T00:00:00Z" }];
    },
  } as unknown as MarketCatalog;
  const marketContext = { ...context(), markets };

  const list = await getMarkets(marketContext);
  const detail = await getMarket(marketContext, "index");
  const history = await getMarketHistory(
    marketContext,
    "index",
    new URL("https://floats.test/api/markets/index/history?limit=250"),
  );
  assert.equal(list.status, 200);
  assert.equal(detail.status, 200);
  assert.equal(history.status, 200);
  assert.equal(observedLimit, 250);
  assert.deepEqual((await list.json() as { data: unknown[] }).data, [market]);

  const invalid = await getMarket(marketContext, "ticker");
  assert.equal(invalid.status, 400);
});

test("market candidates expose lifecycle state without database internals", async () => {
  const response = await getMarketCandidates(context({
    listMarketCandidates: async () => [{
      candidate_id: "anthropic",
      symbol: "ANT",
      company_name: "Anthropic",
      lifecycle_status: "listing_expected",
      ipo_date: "2026-11-19",
      expected_listing_date: "2026-11-19",
      eligible_from: "2026-11-25",
      source_url: "https://www.sec.gov/example",
      token_address: null,
      asset_uid: null,
      identity_approval_status: "unreviewed",
      identity_approved_at: null,
      official_token_name: null,
      token_decimals: null,
      current_multiplier: null,
      pending_multiplier: null,
      trading_capabilities: null,
      official_metadata_observed_at: null,
      trading_halted: null,
      official_quote_generated_at: null,
      logo_url: null,
      token_live: false,
      oracle_ready: false,
      official_feed_address: null,
      oracle_healthy_since: null,
      oracle_last_price_18: null,
      oracle_last_failure: null,
      liquidity_ready: false,
      dex_reference_price_18: null,
      liquidity_observed_at: null,
      governance_approved: false,
      spot_paused: false,
      options_paused: false,
      options_exposure_warning: false,
      product_pause_reason: null,
      product_control_updated_at: null,
      disabled_reason: "Official stock token pending",
      last_checked_at: null,
      official_token_detected_at: null,
      public_available_at: null,
      publication_sla_seconds: null,
    }],
  }));

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    data: Array<{ id: string; status: string; checks: { tokenLive: boolean } }>;
  };
  assert.deepEqual(payload.data, [{
    id: "anthropic",
    symbol: "ANT",
    name: "Anthropic",
    status: "listing_expected",
    ipoDate: "2026-11-19",
    listingDate: "2026-11-19",
    eligibleFrom: "2026-11-25",
    sourceUrl: "https://www.sec.gov/example",
    tokenAddress: null,
    officialTokenName: null,
    tokenDecimals: null,
    currentMultiplier: null,
    pendingMultiplier: null,
    tradingCapabilities: { market: "unknown", extended: "unknown", overnight: "unknown" },
    officialMetadataObservedAt: null,
    tradingHalted: null,
    officialQuoteGeneratedAt: null,
    logoUrl: null,
    checks: { tokenLive: false, priceFeed: false, liquidity: false },
    oracle: { feedAddress: null, healthySince: null, lastPrice18: null, lastFailure: null },
    liquidity: { dexReferencePrice18: null, observedAt: null },
    governanceApproved: false,
    productControls: { spotPaused: false, optionsPaused: false, optionsExposureWarning: false, reason: null, updatedAt: null },
    disabledReason: "Official stock token pending",
    lastCheckedAt: null,
    publication: { detectedAt: null, availableAt: null, slaSeconds: null, targetSeconds: 300, withinTarget: null },
  }]);
});

test("candidate readiness fails closed and reports independent T1-T4 blockers", async () => {
  const token = `0x${"a".repeat(40)}`;
  const candidate = {
    candidate_id: "anthropic",
    symbol: "ANT",
    company_name: "Anthropic",
    lifecycle_status: "liquidity_pending",
    ipo_date: "2026-11-19",
    expected_listing_date: "2026-11-19",
    eligible_from: "2026-11-25",
    source_url: "https://robinhood.com/us/en/support/articles/stock-token-assets/",
    token_address: token,
    asset_uid: `0x${"1".repeat(64)}`,
    identity_approval_status: "approved",
    identity_approved_at: "2026-11-19T14:00:00.000Z",
    official_token_name: "Anthropic Stock Token",
    token_decimals: 18,
    current_multiplier: "1",
    pending_multiplier: null,
    trading_capabilities: null,
    official_metadata_observed_at: "2026-11-19T13:59:00.000Z",
    trading_halted: false,
    official_quote_generated_at: "2026-11-19T14:01:00.000Z",
    logo_url: null,
    token_live: true,
    oracle_ready: false,
    official_feed_address: null,
    oracle_healthy_since: null,
    oracle_last_price_18: null,
    oracle_last_failure: "FEED_STALE",
    liquidity_ready: false,
    dex_reference_price_18: null,
    liquidity_observed_at: null,
    governance_approved: false,
    spot_paused: false,
    options_paused: false,
    options_exposure_warning: false,
    product_pause_reason: null,
    product_control_updated_at: null,
    disabled_reason: "Waiting for liquidity",
    last_checked_at: "2026-11-19T14:01:00.000Z",
    official_token_detected_at: "2026-11-19T13:59:00.000Z",
    public_available_at: "2026-11-19T14:00:00.000Z",
    publication_sla_seconds: 60,
  };
  const apiContext = context({
    listMarketCandidates: async () => [candidate],
    listMarketCandidateSignoffs: async () => [{
      id: 7,
      candidate_id: "anthropic",
      tier: "market",
      decision: "approved",
      governance_or_canary_reference: null,
      signed_at: "2026-11-19T14:02:00.000Z",
    }],
  });
  Object.assign(apiContext.publicConfig, { spotRoutes: [{
    tokenAddress: token,
    routerAddress: `0x${"b".repeat(40)}`,
    quoterAddress: `0x${"c".repeat(40)}`,
    fee: 500,
  }] });

  const response = await getMarketCandidateReadiness(apiContext, "anthropic");
  assert.equal(response.status, 200);
  const payload = await response.json() as { data: { tiers: Record<string, { ready: boolean; blockers: string[] }>; signoffs: Array<{ id: number; tier: string }> } };
  assert.equal(payload.data.tiers.market?.ready, true);
  assert.deepEqual(payload.data.tiers.spot?.blockers, ["liquidity_threshold"]);
  assert.deepEqual(payload.data.tiers.options?.blockers, ["official_feed_healthy", "options_infrastructure"]);
  assert.deepEqual(payload.data.tiers.index?.blockers, ["fifth_trading_day_reached", "governance_executed"]);
  assert.deepEqual(payload.data.signoffs, [{
    id: 7,
    tier: "market",
    decision: "approved",
    governanceOrCanaryReference: null,
    signedAt: "2026-11-19T14:02:00.000Z",
  }]);

  const missing = await getMarketCandidateReadiness(apiContext, "not-found");
  assert.equal(missing.status, 404);
});

test("index state joins holdings at the exact NAV block", async () => {
  let requestedBlock: number | undefined;
  const response = await getLatestIndexState(context({
    latestNav: async () => [{
      block_number: 500,
      nav_usd_18: "250000000000000000000",
      total_supply_18: "200000000000000000000",
      share_price_usd_18: "1250000000000000000",
      oracle_health: { token: "live" },
      observed_at: "2026-01-01T00:00:00Z",
    }],
    listLatestHoldings: async (_vault, block) => {
      requestedBlock = block;
      return [];
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(requestedBlock, 500);
  const payload = await response.json() as { data: { navUsd18: string } };
  assert.equal(payload.data.navUsd18, "250000000000000000000");
});

test("collection endpoints reject unbounded or invalid query parameters", async () => {
  const invalidLimit = await getRegistryChanges(context(), new URL("https://floats.test/api/registry-changes?limit=101"));
  const invalidModule = await getOperationalActions(context(), new URL("https://floats.test/api/operations?module=unknown"));

  assert.equal(invalidLimit.status, 400);
  assert.equal(invalidModule.status, 400);
  assert.deepEqual(await invalidLimit.json(), { error: { code: "INVALID_LIMIT" } });
  assert.deepEqual(await invalidModule.json(), { error: { code: "INVALID_MODULE" } });
});

test("backend failures return a stable error without database details", async () => {
  const response = await getLatestIndexState(context({
    latestNav: async () => { throw new Error("sensitive database relation name"); },
  }));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: "INTERNAL_ERROR" } });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("NAV history is bounded and returned in chronological order", async () => {
  let observedLimit: number | undefined;
  const response = await getNavHistory(context({
    listNavHistory: async (_vault, limit) => {
      observedLimit = limit;
      return [
        { block_number: 20, nav_usd_18: "2", total_supply_18: "1", share_price_usd_18: "2", oracle_health: {}, observed_at: "2026-01-02T00:00:00Z" },
        { block_number: 10, nav_usd_18: "1", total_supply_18: "1", share_price_usd_18: "1", oracle_health: {}, observed_at: "2026-01-01T00:00:00Z" },
      ];
    },
  }), new URL("https://floats.test/api/nav-history?limit=250"));

  assert.equal(observedLimit, 250);
  const payload = await response.json() as { data: Array<{ blockNumber: number }> };
  assert.deepEqual(payload.data.map((point) => point.blockNumber), [10, 20]);

  const invalid = await getNavHistory(context(), new URL("https://floats.test/api/nav-history?limit=1"));
  assert.equal(invalid.status, 400);
});

test("options endpoints expose precision-safe canonical read models", async () => {
  const optionsContext = context({
    listOptionsSeries: async () => [{
      series_id: `0x${"1".repeat(64)}`,
      underlying: `0x${"2".repeat(40)}`,
      underlying_symbol: "CRCL",
      underlying_uid: `0x${"3".repeat(64)}`,
      price_source: `0x${"4".repeat(40)}`,
      kind: "0",
      strike_usd_18: "100000000000000000000",
      cap_usd_18: "200000000000000000000",
      expiry: "1800000000",
      contract_size_18: "1000000000000000000",
      corporate_action_policy_version: "1",
      state: "0",
      settlement_price_usd_18: null,
      payoff_per_unit_usd_18: null,
      total_claimable_6: null,
      manual: null,
      created_at: "2026-01-01T00:00:00Z",
    }],
    listOptionsActivity: async () => [{
      transaction_hash: `0x${"5".repeat(64)}`,
      log_index: 1,
      block_number: 500,
      series_id: `0x${"1".repeat(64)}`,
      wallet_address: `0x${"6".repeat(40)}`,
      event_name: "OptionBought",
      size_18: "1000000000000000000",
      cash_amount_6: "60000000",
      observed_at: "2026-01-01T00:00:00Z",
    }],
  });

  const series = await getOptionsSeries(optionsContext);
  const activity = await getOptionsActivity(
    optionsContext,
    new URL("https://floats.test/api/options/activity?limit=25"),
  );
  const seriesPayload = await series.json() as { data: Array<{ strikeUsd18: string }> };
  const activityPayload = await activity.json() as { data: Array<{ size18: string }> };
  assert.equal(seriesPayload.data[0]?.strikeUsd18, "100000000000000000000");
  assert.equal(activityPayload.data[0]?.size18, "1000000000000000000");
});

test("options quote endpoint validates input and hides the private pricer boundary", async () => {
  let observedBuyer = "";
  const optionsQuotes = {
    async quote(input: { buyer: string; seriesId: string; size18: string }) {
      observedBuyer = input.buyer;
      return {
        quote: {
          ...input,
          side: 0,
          premiumPerUnit6: "2500000",
          signedSpotUsd18: "100000000000000000000",
          nonce: "1",
          issuedAt: 1000,
          validUntil: 1030,
        },
        signature: `0x${"11".repeat(65)}`,
        fairValueUsd: 2.4,
        volatility: 0.6,
        ivSource: "external-implied",
        spreadBps: 500,
        utilizationBps: 2500,
      };
    },
  } as unknown as OptionsQuoteClient;
  const quoteContext: ApiContext = { ...context(), optionsQuotes };
  const buyer = `0x${"AB".repeat(20)}`;
  const response = await postOptionsQuote(quoteContext, new Request("https://floats.test/api/options/quote", {
    method: "POST",
    body: JSON.stringify({
      seriesId: `0x${"22".repeat(32)}`,
      buyer,
      side: "buy",
      size18: "1000000000000000000",
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(observedBuyer, buyer.toLowerCase());
  const invalid = await postOptionsQuote(quoteContext, new Request("https://floats.test/api/options/quote", {
    method: "POST",
    body: JSON.stringify({ seriesId: "bad" }),
  }));
  assert.equal(invalid.status, 400);
});

test("options vault endpoint is honest before network activation", async () => {
  const response = await getOptionsVaultState(context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: null });
});

test("options portfolio requires and consumes a wallet-bound challenge", async () => {
  const account = privateKeyToAccount(`0x${"22".repeat(32)}`);
  let issuedNonce = "";
  let consumedNonce = "";
  const portfolioContext = context({
    issueWalletChallenge: async (nonce) => {
      issuedNonce = nonce;
    },
    consumeWalletChallenge: async (nonce, wallet) => {
      consumedNonce = nonce;
      return wallet === account.address.toLowerCase() && nonce === issuedNonce;
    },
    listOptionsPositions: async () => [{
      series_id: `0x${"1".repeat(64)}`,
      underlying: `0x${"2".repeat(40)}`,
      underlying_symbol: "CRCL",
      size_18: "1000000000000000000",
      net_cash_flow_6: "-60000000",
      updated_at: "2026-01-01T00:00:00Z",
    }],
    listOptionsWithdrawals: async () => [],
  });
  const challengeResponse = await getWalletChallenge(
    portfolioContext,
    new Request(`https://floats.example/api/options/portfolio?address=${account.address}`),
  );
  const challenge = await challengeResponse.json() as { data: { message: string } };
  const signature = await account.signMessage({ message: challenge.data.message });
  const cookie = challengeResponse.headers.get("set-cookie");
  assert.match(cookie ?? "", /Path=\/api;/);

  const response = await postOptionsPortfolio(
    portfolioContext,
    new Request("https://floats.example/api/options/portfolio", {
      method: "POST",
      headers: { cookie: cookie?.split(";", 1)[0] ?? "" },
      body: JSON.stringify({ message: challenge.data.message, signature }),
    }),
  );
  const payload = await response.json() as { data: { positions: Array<{ size18: string }> } };
  assert.equal(response.status, 200);
  assert.equal(consumedNonce, issuedNonce);
  assert.equal(payload.data.positions[0]?.size18, "1000000000000000000");
});
