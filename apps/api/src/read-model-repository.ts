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

export interface ReadModelScope {
  readonly environment: AppEnvironment;
  readonly chainId: number;
}

export interface DistributedRateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
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
