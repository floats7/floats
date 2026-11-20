import type { AppEnvironment } from "./config.ts";
import type { SupabaseRestClient } from "./supabase-rest-client.ts";
import type { Database } from "../../../packages/database/src/database.generated.ts";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export type AssetReadModel = Pick<
  Tables["assets"]["Row"],
  | "chain_id"
  | "token_address"
  | "asset_uid"
  | "symbol"
  | "decimals"
  | "feed_address"
  | "active"
  | "registry_version"
  | "source_block"
  | "updated_at"
  | "target_weight_bps"
  | "eligible_from"
  | "exit_after"
  | "registry_status"
>;

export type NavReadModel = Pick<
  Views["api_nav_snapshots"]["Row"],
  "block_number" | "nav_usd_18" | "total_supply_18" | "share_price_usd_18" | "oracle_health" | "observed_at"
>;

export type HoldingReadModel = Pick<
  Views["api_holding_snapshots"]["Row"],
  | "token_address"
  | "block_number"
  | "raw_balance"
  | "ui_multiplier_18"
  | "normalized_price_usd_18"
  | "value_usd_18"
  | "oracle_health"
  | "oracle_updated_at"
  | "observed_at"
>;

export type RegistryChangeReadModel = Pick<
  Tables["registry_changes"]["Row"],
  | "transaction_hash"
  | "log_index"
  | "block_number"
  | "change_kind"
  | "configuration_hash"
  | "registry_version"
  | "token_address"
  | "payload"
  | "observed_at"
>;

export type OperationalActionReadModel = Pick<
  Tables["operational_actions"]["Row"],
  "transaction_hash" | "log_index" | "block_number" | "module" | "action" | "payload" | "observed_at"
>;

export type UserTransactionReadModel = Pick<
  Views["api_user_transactions"]["Row"],
  | "transaction_hash"
  | "action"
  | "status"
  | "block_number"
  | "asset_amount"
  | "share_amount"
  | "failure_code"
  | "submitted_at"
  | "finalized_at"
  | "wallet_address"
>;

export interface OptionsSeriesReadModel {
  readonly series_id: string;
  readonly underlying: string;
  readonly underlying_symbol: string | null;
  readonly underlying_uid: string;
  readonly price_source: string;
  readonly kind: string;
  readonly strike_usd_18: string;
  readonly cap_usd_18: string;
  readonly expiry: string;
  readonly contract_size_18: string;
  readonly corporate_action_policy_version: string;
  readonly state: string;
  readonly settlement_price_usd_18: string | null;
  readonly payoff_per_unit_usd_18: string | null;
  readonly total_claimable_6: string | null;
  readonly manual: boolean | null;
  readonly created_at: string;
}

export interface OptionsActivityReadModel {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly block_number: number;
  readonly series_id: string;
  readonly wallet_address: string;
  readonly event_name: "OptionBought" | "OptionSoldBack" | "OptionClaimed";
  readonly size_18: string;
  readonly cash_amount_6: string;
  readonly observed_at: string;
}

export interface OptionsPositionReadModel {
  readonly series_id: string;
  readonly underlying: string;
  readonly underlying_symbol: string | null;
  readonly size_18: string;
  readonly net_cash_flow_6: string;
  readonly updated_at: string;
}

export interface OptionsWithdrawalReadModel {
  readonly request_id: string;
  readonly state: string;
  readonly receiver_address: string;
  readonly shares: string;
  readonly assets_6: string | null;
  readonly unlock_at: string;
  readonly updated_at: string;
}

export interface OptionsWithdrawalActivityReadModel {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly block_number: number;
  readonly event_name: string;
  readonly owner_address: string | null;
  readonly receiver_address: string | null;
  readonly shares: string | null;
  readonly assets_6: string | null;
  readonly observed_at: string;
}

export interface FUSDActivityReadModel {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly block_number: number;
  readonly contract_address: string;
  readonly event_name: string;
  readonly wallet_address: string | null;
  readonly receiver_address: string | null;
  readonly request_id: string | null;
  readonly assets_6: string | null;
  readonly shares_18: string | null;
  readonly observed_at: string;
}

export interface FUSDWithdrawalReadModel {
  readonly request_id: string;
  readonly owner_address: string;
  readonly receiver_address: string;
  readonly shares_18: string;
  readonly state: string;
  readonly assets_6: string | null;
  readonly updated_at: string;
}

export interface PerpsMarketReadModel {
  readonly market_id: string;
  readonly symbol: string;
  readonly underlying_address: string;
  readonly underlying_uid: string;
  readonly price_feed_address: string;
  readonly market_state: string;
  readonly session_state: string;
  readonly isolated_only: boolean;
  readonly max_leverage_bps: number;
  readonly initial_margin_bps: number;
  readonly maintenance_margin_bps: number;
  readonly open_interest_cap_bps: number;
  readonly base_spread_bps: number;
  readonly trading_fee_bps: number;
  readonly max_price_age_seconds: number;
  readonly block_number: number;
  readonly updated_at: string;
}

export interface PerpsPositionReadModel {
  readonly account_address: string;
  readonly market_id: string;
  readonly margin_mode: string;
  readonly size_18: string;
  readonly entry_price_usd_18: string;
  readonly last_funding_index_18: string;
  readonly realized_pnl_usd_18: string;
  readonly pending_fees_usd_18: string;
  readonly open_interest_usd_18: string;
  readonly reserved_liability_6: string;
  readonly block_number: number;
  readonly updated_at: string;
}

export interface PerpsActivityReadModel {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly block_number: number;
  readonly contract_address: string;
  readonly event_name: string;
  readonly account_address: string | null;
  readonly market_id: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly observed_at: string;
}

export interface PerpsLpStateReadModel {
  readonly vault_address: string;
  readonly managed_assets_6: string;
  readonly available_liquidity_6: string;
  readonly reserved_trader_liability_6: string;
  readonly payable_withdrawal_assets_6: string;
  readonly recognized_bad_debt_6: string;
  readonly total_supply_18: string;
  readonly utilization_bps: string;
  readonly operations_paused: boolean;
  readonly block_number: number;
  readonly updated_at: string;
}

export interface PerpsLpWithdrawalReadModel {
  readonly request_id: string;
  readonly owner_address: string;
  readonly receiver_address: string;
  readonly shares_18: string;
  readonly unlock_at: string;
  readonly state: "queued" | "cancelled" | "processed" | "claimed";
  readonly assets_6: string | null;
  readonly block_number: number;
  readonly transaction_hash: string;
  readonly updated_at: string;
}

export interface PerpsLpSnapshotReadModel {
  readonly share_price_18: string;
  readonly observed_at: string;
  readonly block_number: number;
}

export interface PerpsMarketIdentityReadModel {
  readonly market_id: string;
  readonly block_number: number;
  readonly observed_at: string;
}

export interface ReadModelScope {
  readonly environment: AppEnvironment;
  readonly chainId: number;
}

export interface DistributedRateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

export interface MarketCandidateReadModel {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly company_name: string;
  readonly lifecycle_status: string;
  readonly ipo_date: string | null;
  readonly expected_listing_date: string | null;
  readonly eligible_from: string | null;
  readonly source_url: string | null;
  readonly token_address: string | null;
  readonly asset_uid: string | null;
  readonly identity_approval_status: string;
  readonly identity_approved_at: string | null;
  readonly official_token_name: string | null;
  readonly token_decimals: number | null;
  readonly current_multiplier: string | null;
  readonly pending_multiplier: string | null;
  readonly trading_capabilities: unknown;
  readonly official_metadata_observed_at: string | null;
  readonly trading_halted: boolean | null;
  readonly official_quote_generated_at: string | null;
  readonly logo_url: string | null;
  readonly token_live: boolean;
  readonly oracle_ready: boolean;
  readonly official_feed_address: string | null;
  readonly oracle_healthy_since: string | null;
  readonly oracle_last_price_18: string | null;
  readonly oracle_last_failure: string | null;
  readonly liquidity_ready: boolean;
  readonly dex_reference_price_18: string | null;
  readonly liquidity_observed_at: string | null;
  readonly governance_approved: boolean;
  readonly spot_paused: boolean;
  readonly options_paused: boolean;
  readonly options_exposure_warning: boolean;
  readonly product_pause_reason: string | null;
  readonly product_control_updated_at: string | null;
  readonly disabled_reason: string | null;
  readonly last_checked_at: string | null;
  readonly official_token_detected_at: string | null;
  readonly public_available_at: string | null;
  readonly publication_sla_seconds: number | null;
  readonly ipo_stage?: "confidential_filed" | "public_s1" | "roadshow" | "priced" | "trading" | "withdrawn" | null;
  readonly ticker_announced?: boolean;
  readonly exchange?: string | null;
  readonly price_range_low?: string | null;
  readonly price_range_high?: string | null;
  readonly ipo_price?: string | null;
  readonly stage_source_url?: string | null;
  readonly stage_updated_at?: string | null;
}

export interface MarketCandidateSignoffReadModel {
  readonly id: number;
  readonly candidate_id: string;
  readonly tier: "market" | "spot" | "options" | "index";
  readonly decision: "approved" | "rejected";
  readonly governance_or_canary_reference: string | null;
  readonly signed_at: string;
}

export interface CrossChainMessageReadModel {
  readonly source_chain_id: number;
  readonly destination_chain_id: number;
  readonly source_eid: number;
  readonly destination_eid: number;
  readonly guid: string;
  readonly sender_address: string;
  readonly recipient_address: string;
  readonly token_address: string;
  readonly amount_local: string;
  readonly native_fee: string;
  readonly state: "pending" | "delivered" | "retryable" | "failed";
  readonly source_transaction_hash: string;
  readonly destination_transaction_hash: string | null;
  readonly sent_at: string;
  readonly updated_at: string;
}

export interface CrossChainNavReadModel {
  readonly source_chain_id: number;
  readonly destination_chain_id: number;
  readonly source_eid: number;
  readonly destination_eid: number;
  readonly guid: string;
  readonly sequence: string;
  readonly nav_18: string;
  readonly canonical_total_supply_18: string;
  readonly state: "published" | "mirrored";
  readonly source_transaction_hash: string;
  readonly destination_transaction_hash: string | null;
  readonly observed_at: string;
  readonly published_at: string;
  readonly mirrored_at: string | null;
  readonly updated_at: string;
}

export class ReadModelRepository {
  public constructor(
    private readonly client: SupabaseRestClient,
    private readonly scope: ReadModelScope,
  ) {}

  public listActiveAssets(signal?: AbortSignal): Promise<readonly AssetReadModel[]> {
    const query = this.scopedQuery(
      "chain_id,token_address,asset_uid,symbol,decimals,feed_address,active,registry_version,source_block,updated_at,target_weight_bps,eligible_from,exit_after,registry_status",
    );
    query.set("active", "eq.true");
    query.set("order", "symbol.asc");
    query.set("limit", "100");
    return this.client.select<readonly AssetReadModel[]>("assets", query, signal);
  }

  public listMarketCandidates(signal?: AbortSignal): Promise<readonly MarketCandidateReadModel[]> {
    const query = this.scopedQuery(
      "candidate_id,symbol,company_name,lifecycle_status,ipo_date,expected_listing_date,eligible_from,source_url,token_address,asset_uid,identity_approval_status,identity_approved_at,official_token_name,token_decimals,current_multiplier,pending_multiplier,trading_capabilities,official_metadata_observed_at,trading_halted,official_quote_generated_at,logo_url,token_live,oracle_ready,official_feed_address,oracle_healthy_since,oracle_last_price_18,oracle_last_failure,liquidity_ready,dex_reference_price_18,liquidity_observed_at,governance_approved,spot_paused,options_paused,options_exposure_warning,product_pause_reason,product_control_updated_at,disabled_reason,last_checked_at,official_token_detected_at,public_available_at,publication_sla_seconds,ipo_stage,ticker_announced,exchange,price_range_low,price_range_high,ipo_price,stage_source_url,stage_updated_at",
    );
    query.set("order", "expected_listing_date.desc.nullslast,symbol.asc");
    query.set("limit", "500");
    return this.client.select<readonly MarketCandidateReadModel[]>("market_candidates", query, signal);
  }

  public listMarketCandidateSignoffs(
    candidateId: string,
    signal?: AbortSignal,
  ): Promise<readonly MarketCandidateSignoffReadModel[]> {
    if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("Market candidate ID is invalid");
    const query = this.scopedQuery(
      "id,candidate_id,tier,decision,governance_or_canary_reference,signed_at",
    );
    query.set("candidate_id", `eq.${candidateId}`);
    query.set("order", "signed_at.desc,id.desc");
    query.set("limit", "100");
    return this.client.select<readonly MarketCandidateSignoffReadModel[]>(
      "market_candidate_operator_signoffs",
      query,
      signal,
    );
  }

  public listCrossChainMessages(
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly CrossChainMessageReadModel[]> {
    const query = this.environmentQuery(
      "source_chain_id,destination_chain_id,source_eid,destination_eid,guid,sender_address,recipient_address,token_address,amount_local,native_fee,state,source_transaction_hash,destination_transaction_hash,sent_at,updated_at",
    );
    query.set("canonical", "eq.true");
    query.set("order", "sent_at.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly CrossChainMessageReadModel[]>(
      "crosschain_messages",
      query,
      signal,
    );
  }

  public getCrossChainMessage(
    sourceEid: number,
    guid: string,
    signal?: AbortSignal,
  ): Promise<readonly CrossChainMessageReadModel[]> {
    if (!Number.isSafeInteger(sourceEid) || sourceEid <= 0) throw new Error("Invalid source EID");
    if (!/^0x[0-9a-fA-F]{64}$/.test(guid)) throw new Error("Invalid message GUID");
    const query = this.environmentQuery(
      "source_chain_id,destination_chain_id,source_eid,destination_eid,guid,sender_address,recipient_address,token_address,amount_local,native_fee,state,source_transaction_hash,destination_transaction_hash,sent_at,updated_at",
    );
    query.set("source_eid", `eq.${sourceEid}`);
    query.set("guid", `eq.${guid.toLowerCase()}`);
    query.set("canonical", "eq.true");
    query.set("limit", "1");
    return this.client.select<readonly CrossChainMessageReadModel[]>(
      "crosschain_messages",
      query,
      signal,
    );
  }

  public latestCrossChainNav(
    destinationChainId?: number,
    signal?: AbortSignal,
  ): Promise<readonly CrossChainNavReadModel[]> {
    if (
      destinationChainId !== undefined
      && (!Number.isSafeInteger(destinationChainId) || destinationChainId <= 0)
    ) {
      throw new Error("Invalid destination chain ID");
    }
    const query = this.environmentQuery(
      "source_chain_id,destination_chain_id,source_eid,destination_eid,guid,sequence,nav_18,canonical_total_supply_18,state,source_transaction_hash,destination_transaction_hash,observed_at,published_at,mirrored_at,updated_at",
    );
    query.set("source_canonical", "eq.true");
    if (destinationChainId !== undefined) {
      query.set("destination_chain_id", `eq.${destinationChainId}`);
    }
    query.set("order", "sequence.desc,published_at.desc");
    query.set("limit", "1");
    return this.client.select<readonly CrossChainNavReadModel[]>(
      "crosschain_nav_messages",
      query,
      signal,
    );
  }

  public latestNav(vaultAddress: string, signal?: AbortSignal): Promise<readonly NavReadModel[]> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) throw new Error("Invalid vault address");

    const query = this.scopedQuery(
      "block_number,nav_usd_18,total_supply_18,share_price_usd_18,oracle_health,observed_at",
    );
    query.set("vault_address", `eq.${vaultAddress}`);
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc");
    query.set("limit", "1");
    return this.client.select<readonly NavReadModel[]>("api_nav_snapshots", query, signal);
  }

  public listNavHistory(
    vaultAddress: string,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<readonly NavReadModel[]> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) throw new Error("Invalid vault address");
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 1000) {
      throw new Error("NAV history limit must be an integer between 2 and 1000");
    }
    const query = this.scopedQuery(
      "block_number,nav_usd_18,total_supply_18,share_price_usd_18,oracle_health,observed_at",
    );
    query.set("vault_address", `eq.${vaultAddress}`);
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc");
    query.set("limit", limit.toString());
    return this.client.select<readonly NavReadModel[]>("api_nav_snapshots", query, signal);
  }

  public listLatestHoldings(
    vaultAddress: string,
    blockNumber: number,
    signal?: AbortSignal,
  ): Promise<readonly HoldingReadModel[]> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) throw new Error("Invalid vault address");
    if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) throw new Error("Invalid block number");
    const query = this.scopedQuery(
      "token_address,block_number,raw_balance,ui_multiplier_18,normalized_price_usd_18,value_usd_18,oracle_health,oracle_updated_at,observed_at",
    );
    query.set("vault_address", `eq.${vaultAddress}`);
    query.set("block_number", `eq.${blockNumber}`);
    query.set("canonical", "eq.true");
    query.set("order", "token_address.asc");
    query.set("limit", "64");
    return this.client.select<readonly HoldingReadModel[]>("api_holding_snapshots", query, signal);
  }

  public listHoldingHistory(
    vaultAddress: string,
    tokenAddress: string,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<readonly HoldingReadModel[]> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) throw new Error("Invalid vault address");
    if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) throw new Error("Invalid token address");
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 1000) {
      throw new Error("Holding history limit must be an integer between 2 and 1000");
    }
    const query = this.scopedQuery(
      "token_address,block_number,raw_balance,ui_multiplier_18,normalized_price_usd_18,value_usd_18,oracle_health,oracle_updated_at,observed_at",
    );
    query.set("vault_address", `eq.${vaultAddress.toLowerCase()}`);
    query.set("token_address", `eq.${tokenAddress.toLowerCase()}`);
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc");
    query.set("limit", limit.toString());
    return this.client.select<readonly HoldingReadModel[]>("api_holding_snapshots", query, signal);
  }

  public listRegistryChanges(limit = 50, signal?: AbortSignal): Promise<readonly RegistryChangeReadModel[]> {
    const query = this.scopedQuery(
      "transaction_hash,log_index,block_number,change_kind,configuration_hash,registry_version,token_address,payload,observed_at",
    );
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc,log_index.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly RegistryChangeReadModel[]>("registry_changes", query, signal);
  }

  public listOperationalActions(
    module: OperationalActionReadModel["module"],
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly OperationalActionReadModel[]> {
    const query = this.scopedQuery(
      "transaction_hash,log_index,block_number,module,action,payload,observed_at",
    );
    query.set("module", `eq.${module}`);
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc,log_index.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly OperationalActionReadModel[]>("operational_actions", query, signal);
  }

  public listUserTransactions(
    walletAddress: string,
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly UserTransactionReadModel[]> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new Error("Invalid wallet address");
    const query = this.scopedQuery(
      "transaction_hash,action,status,block_number,asset_amount,share_amount,failure_code,submitted_at,finalized_at",
    );
    query.set("wallet_address", `eq.${walletAddress.toLowerCase()}`);
    query.set("canonical", "eq.true");
    query.set("order", "submitted_at.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly UserTransactionReadModel[]>("api_user_transactions", query, signal);
  }

  public listPublicUserTransactions(
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly UserTransactionReadModel[]> {
    const query = this.scopedQuery(
      "transaction_hash,wallet_address,action,status,block_number,asset_amount,share_amount,failure_code,submitted_at,finalized_at",
    );
    query.set("canonical", "eq.true");
    query.set("status", "eq.confirmed");
    query.set("order", "submitted_at.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly UserTransactionReadModel[]>("api_user_transactions", query, signal);
  }

  public listOptionsSeries(signal?: AbortSignal): Promise<readonly OptionsSeriesReadModel[]> {
    const query = this.scopedQuery(
      "series_id,underlying,underlying_symbol,underlying_uid,price_source,kind,strike_usd_18,cap_usd_18,expiry,contract_size_18,corporate_action_policy_version,state,settlement_price_usd_18,payoff_per_unit_usd_18,total_claimable_6,manual,created_at",
    );
    query.set("order", "expiry.asc,strike_usd_18.asc");
    query.set("limit", "500");
    return this.client.select<readonly OptionsSeriesReadModel[]>("api_options_series", query, signal);
  }

  public listOptionsActivity(
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly OptionsActivityReadModel[]> {
    const query = this.scopedQuery(
      "transaction_hash,log_index,block_number,series_id,wallet_address,event_name,size_18,cash_amount_6,observed_at",
    );
    query.set("order", "block_number.desc,log_index.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly OptionsActivityReadModel[]>("api_options_activity", query, signal);
  }

  public listOptionsPositions(
    walletAddress: string,
    signal?: AbortSignal,
  ): Promise<readonly OptionsPositionReadModel[]> {
    requireWalletAddress(walletAddress);
    const query = this.scopedQuery("series_id,underlying,underlying_symbol,size_18,net_cash_flow_6,updated_at");
    query.set("wallet_address", `eq.${walletAddress.toLowerCase()}`);
    query.set("order", "updated_at.desc");
    query.set("limit", "100");
    return this.client.select<readonly OptionsPositionReadModel[]>("api_options_positions", query, signal);
  }

  public listOptionsWithdrawals(
    walletAddress: string,
    signal?: AbortSignal,
  ): Promise<readonly OptionsWithdrawalReadModel[]> {
    requireWalletAddress(walletAddress);
    const query = this.scopedQuery(
      "request_id,state,receiver_address,shares,assets_6,unlock_at,updated_at",
    );
    query.set("owner_address", `eq.${walletAddress.toLowerCase()}`);
    query.set("order", "updated_at.desc");
    query.set("limit", "100");
    return this.client.select<readonly OptionsWithdrawalReadModel[]>("api_options_withdrawals", query, signal);
  }

  public listOptionsWithdrawalActivity(limit = 50, signal?: AbortSignal): Promise<readonly OptionsWithdrawalActivityReadModel[]> {
    const query = this.scopedQuery("transaction_hash,log_index,block_number,event_name,owner_address,receiver_address,shares,assets_6,observed_at");
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc,log_index.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly OptionsWithdrawalActivityReadModel[]>("options_withdrawal_events", query, signal);
  }

  public listFusdActivity(vaultAddress: string, limit = 50, signal?: AbortSignal): Promise<readonly FUSDActivityReadModel[]> {
    requireWalletAddress(vaultAddress);
    const query = this.scopedQuery("transaction_hash,log_index,block_number,contract_address,event_name,wallet_address,receiver_address,request_id,assets_6,shares_18,observed_at");
    query.set("contract_address", `eq.${vaultAddress.toLowerCase()}`);
    query.set("order", "block_number.desc,log_index.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly FUSDActivityReadModel[]>("api_fusd_activity", query, signal);
  }

  public listFusdWithdrawals(vaultAddress: string, walletAddress: string, signal?: AbortSignal): Promise<readonly FUSDWithdrawalReadModel[]> {
    requireWalletAddress(vaultAddress);
    requireWalletAddress(walletAddress);
    const query = this.scopedQuery("request_id,owner_address,receiver_address,shares_18,state,assets_6,updated_at");
    query.set("contract_address", `eq.${vaultAddress.toLowerCase()}`);
    query.set("owner_address", `eq.${walletAddress.toLowerCase()}`);
    query.set("order", "updated_at.desc");
    query.set("limit", "100");
    return this.client.select<readonly FUSDWithdrawalReadModel[]>("api_fusd_withdrawals", query, signal);
  }

  public listPerpsMarkets(signal?: AbortSignal): Promise<readonly PerpsMarketReadModel[]> {
    const query = this.scopedQuery(
      "market_id,symbol,underlying_address,underlying_uid,price_feed_address,market_state,session_state,isolated_only,max_leverage_bps,initial_margin_bps,maintenance_margin_bps,open_interest_cap_bps,base_spread_bps,trading_fee_bps,max_price_age_seconds,block_number,updated_at",
    );
    query.set("order", "symbol.asc");
    query.set("limit", "100");
    return this.client.select<readonly PerpsMarketReadModel[]>("perps_markets", query, signal);
  }

  public listPerpsMarketIdentities(
    signal?: AbortSignal,
  ): Promise<readonly PerpsMarketIdentityReadModel[]> {
    const query = this.scopedQuery("market_id,block_number,observed_at");
    query.set("event_name", "eq.PerpsMarketCreated");
    query.set("canonical", "eq.true");
    query.set("market_id", "not.is.null");
    query.set("order", "block_number.asc,log_index.asc");
    query.set("limit", "100");
    return this.client.select<readonly PerpsMarketIdentityReadModel[]>("perps_activity", query, signal);
  }

  public listPerpsPositions(
    walletAddress: string,
    signal?: AbortSignal,
  ): Promise<readonly PerpsPositionReadModel[]> {
    requireWalletAddress(walletAddress);
    const query = this.scopedQuery(
      "account_address,market_id,margin_mode,size_18,entry_price_usd_18,last_funding_index_18,realized_pnl_usd_18,pending_fees_usd_18,open_interest_usd_18,reserved_liability_6,block_number,updated_at",
    );
    query.set("account_address", `eq.${walletAddress.toLowerCase()}`);
    query.set("order", "updated_at.desc");
    query.set("limit", "100");
    return this.client.select<readonly PerpsPositionReadModel[]>("perps_positions", query, signal);
  }

  public listPerpsActivity(
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly PerpsActivityReadModel[]> {
    const query = this.scopedQuery(
      "transaction_hash,log_index,block_number,contract_address,event_name,account_address,market_id,payload,observed_at",
    );
    query.set("canonical", "eq.true");
    query.set("order", "block_number.desc,log_index.desc");
    query.set("limit", boundedLimit(limit));
    return this.client.select<readonly PerpsActivityReadModel[]>("perps_activity", query, signal);
  }

  public getPerpsLpState(
    vaultAddress: string,
    signal?: AbortSignal,
  ): Promise<readonly PerpsLpStateReadModel[]> {
    requireWalletAddress(vaultAddress);
    const query = this.scopedQuery(
      "vault_address,managed_assets_6,available_liquidity_6,reserved_trader_liability_6,payable_withdrawal_assets_6,recognized_bad_debt_6,total_supply_18,utilization_bps,operations_paused,block_number,updated_at",
    );
    query.set("vault_address", `eq.${vaultAddress.toLowerCase()}`);
    query.set("limit", "1");
    return this.client.select<readonly PerpsLpStateReadModel[]>("perps_lp_state", query, signal);
  }

  public async getPerpsLpSharePriceWindow(
    vaultAddress: string,
    since: string,
    signal?: AbortSignal,
  ): Promise<readonly PerpsLpSnapshotReadModel[]> {
    requireWalletAddress(vaultAddress);
    const query = this.scopedQuery("share_price_18,observed_at,block_number");
    query.set("vault_address", `eq.${vaultAddress.toLowerCase()}`);
    query.set("share_price_18", "gt.0");
    query.set("observed_at", `gte.${since}`);
    query.set("order", "observed_at.asc");
    query.set("limit", "1000");
    return this.client.select<readonly PerpsLpSnapshotReadModel[]>("perps_lp_snapshots", query, signal);
  }

  public listPerpsLpWithdrawals(
    vaultAddress: string,
    walletAddress: string,
    signal?: AbortSignal,
  ): Promise<readonly PerpsLpWithdrawalReadModel[]> {
    requireWalletAddress(vaultAddress);
    requireWalletAddress(walletAddress);
    const query = this.scopedQuery("request_id,owner_address,receiver_address,shares_18,unlock_at,state,assets_6,block_number,transaction_hash,updated_at");
    query.set("vault_address", `eq.${vaultAddress.toLowerCase()}`);
    query.set("owner_address", `eq.${walletAddress.toLowerCase()}`);
    query.set("order", "updated_at.desc");
    query.set("limit", "100");
    return this.client.select<readonly PerpsLpWithdrawalReadModel[]>("perps_lp_withdrawals", query, signal);
  }

  public async issueWalletChallenge(
    nonce: string,
    walletAddress: string,
    expiresAt: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.rpc("issue_wallet_auth_challenge", {
      p_environment: this.scope.environment,
      p_chain_id: this.scope.chainId,
      p_nonce: nonce,
      p_wallet_address: walletAddress.toLowerCase(),
      p_expires_at: expiresAt,
    }, signal);
  }

  public consumeWalletChallenge(
    nonce: string,
    walletAddress: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.client.rpc<boolean>("consume_wallet_auth_challenge", {
      p_environment: this.scope.environment,
      p_chain_id: this.scope.chainId,
      p_nonce: nonce,
      p_wallet_address: walletAddress.toLowerCase(),
    }, signal);
  }

  public takeRateLimit(
    keyHash: string,
    limit: number,
    windowSeconds = 60,
    signal?: AbortSignal,
  ): Promise<DistributedRateLimitResult> {
    if (!/^[a-f0-9]{64}$/.test(keyHash)) throw new Error("Invalid rate-limit key hash");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new Error("Invalid rate-limit maximum");
    if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
      throw new Error("Invalid rate-limit window");
    }
    return this.client.rpc<DistributedRateLimitResult>("take_api_rate_limit", {
      p_environment: this.scope.environment,
      p_chain_id: this.scope.chainId,
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }, signal);
  }

  private scopedQuery(select: string): URLSearchParams {
    return new URLSearchParams({
      select,
      environment: `eq.${this.scope.environment}`,
      chain_id: `eq.${this.scope.chainId}`,
    });
  }

  private environmentQuery(select: string): URLSearchParams {
    return new URLSearchParams({
      select,
      environment: `eq.${this.scope.environment}`,
    });
  }
}

function boundedLimit(limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Read-model limit must be an integer between 1 and 100");
  }
  return limit.toString();
}

function requireWalletAddress(walletAddress: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new Error("Invalid wallet address");
}
