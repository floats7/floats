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

export interface ReadModelScope {
  readonly environment: AppEnvironment;
  readonly chainId: number;
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
