import type { AppEnvironment } from "../../api/src/config.ts";
import type { SupabaseRestClient } from "../../api/src/supabase-rest-client.ts";
import type { CoreSnapshot } from "./snapshot-reader.ts";

export class SupabaseSnapshotStore {
  public constructor(
    private readonly client: SupabaseRestClient,
    private readonly environment: AppEnvironment,
    private readonly chainId: number,
  ) {}

  public async commit(snapshot: CoreSnapshot): Promise<void> {
    await this.client.rpc("commit_core_snapshot_v2", {
      p_environment: this.environment,
      p_chain_id: this.chainId,
      p_vault_address: snapshot.vaultAddress,
      p_block_number: snapshot.block.number.toString(),
      p_block_hash: snapshot.block.hash,
      p_observed_at: snapshot.block.timestamp.toISOString(),
      p_nav_usd_18: snapshot.navUsd18.toString(),
      p_total_supply_18: snapshot.totalSupply18.toString(),
      p_share_price_usd_18: snapshot.sharePriceUsd18?.toString() ?? null,
      p_holdings: snapshot.holdings.map((holding) => ({
        token_address: holding.tokenAddress,
        raw_balance: holding.rawBalance.toString(),
        ui_multiplier_18: holding.uiMultiplier18.toString(),
        normalized_price_usd_18: holding.normalizedPriceUsd18.toString(),
        value_usd_18: holding.valueUsd18.toString(),
        oracle_health: holding.oracleHealth,
        oracle_updated_at: holding.oracleUpdatedAt.toString(),
        symbol: holding.symbol,
        decimals: holding.decimals,
        asset_uid: holding.assetUid,
        feed_address: holding.feedAddress,
        target_weight_bps: holding.targetWeightBps,
        eligible_from: holding.eligibleFrom.toString(),
        exit_after: holding.exitAfter.toString(),
        registry_status: holding.registryStatus,
        registry_version: holding.registryVersion.toString(),
      })),
    });
  }
}
