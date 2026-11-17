begin;

alter table public.assets
    add column target_weight_bps integer not null default 0,
    add column eligible_from bigint not null default 0,
    add column exit_after bigint not null default 0,
    add column registry_status text not null default 'none';

alter table public.assets
    add constraint assets_target_weight_check check (target_weight_bps between 0 and 10000),
    add constraint assets_eligible_from_check check (eligible_from >= 0),
    add constraint assets_exit_after_check check (exit_after >= eligible_from),
    add constraint assets_registry_status_check check (registry_status in ('none', 'active', 'removed'));

create or replace function public.commit_core_snapshot_v2(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_vault_address text,
    p_block_number bigint,
    p_block_hash text,
    p_observed_at timestamptz,
    p_nav_usd_18 numeric,
    p_total_supply_18 numeric,
    p_share_price_usd_18 numeric,
    p_holdings jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.commit_core_snapshot(
        p_environment, p_chain_id, p_vault_address, p_block_number, p_block_hash,
        p_observed_at, p_nav_usd_18, p_total_supply_18, p_share_price_usd_18, p_holdings
    );

    insert into public.assets (
        environment, chain_id, token_address, asset_uid, symbol, decimals,
        feed_address, active, registry_version, source_block, updated_at,
        target_weight_bps, eligible_from, exit_after, registry_status
    )
    select
        p_environment, p_chain_id, lower(item.token_address), lower(item.asset_uid),
        item.symbol, item.decimals, lower(item.feed_address),
        item.registry_status = 'active', item.registry_version, p_block_number,
        p_observed_at, item.target_weight_bps, item.eligible_from,
        item.exit_after, item.registry_status
    from jsonb_to_recordset(p_holdings) as item(
        token_address text,
        asset_uid text,
        symbol text,
        decimals smallint,
        feed_address text,
        registry_status text,
        registry_version bigint,
        target_weight_bps integer,
        eligible_from bigint,
        exit_after bigint
    )
    on conflict (environment, chain_id, token_address) do update set
        asset_uid = excluded.asset_uid,
        symbol = excluded.symbol,
        decimals = excluded.decimals,
        feed_address = excluded.feed_address,
        active = excluded.active,
        registry_version = excluded.registry_version,
        source_block = excluded.source_block,
        updated_at = excluded.updated_at,
        target_weight_bps = excluded.target_weight_bps,
        eligible_from = excluded.eligible_from,
        exit_after = excluded.exit_after,
        registry_status = excluded.registry_status;
end;
$$;

revoke all on function public.commit_core_snapshot_v2(public.network_environment, bigint, text, bigint, text, timestamptz, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.commit_core_snapshot_v2(public.network_environment, bigint, text, bigint, text, timestamptz, numeric, numeric, numeric, jsonb) to service_role;

commit;
