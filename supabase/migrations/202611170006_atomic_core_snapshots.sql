begin;

alter table public.nav_snapshots
    add column canonical boolean not null default true;

alter table public.holding_snapshots
    add column block_hash text,
    add column oracle_health text,
    add column oracle_updated_at bigint,
    add column observed_at timestamptz,
    add column canonical boolean not null default true;

alter table public.holding_snapshots
    add constraint holding_snapshots_block_hash_check
        check (block_hash is null or block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    add constraint holding_snapshots_health_check
        check (oracle_health is null or oracle_health in ('unconfigured', 'live', 'stale', 'paused', 'invalid')),
    add constraint holding_snapshots_oracle_time_check
        check (oracle_updated_at is null or oracle_updated_at >= 0);

create index nav_snapshots_canonical_idx
    on public.nav_snapshots (environment, chain_id, vault_address, block_number desc)
    where canonical;

create index holding_snapshots_canonical_idx
    on public.holding_snapshots (environment, chain_id, vault_address, block_number desc, token_address)
    where canonical;

create or replace function public.commit_core_snapshot(
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
    if p_vault_address !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'INVALID_VAULT_ADDRESS'; end if;
    if p_block_number < 0 then raise exception 'INVALID_SNAPSHOT_BLOCK'; end if;
    if p_block_hash !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'INVALID_SNAPSHOT_HASH'; end if;
    if p_nav_usd_18 < 0 or p_total_supply_18 < 0 or p_share_price_usd_18 < 0 then
        raise exception 'INVALID_SNAPSHOT_VALUE';
    end if;

    insert into public.nav_snapshots (
        environment, chain_id, vault_address, block_number, block_hash,
        nav_usd_18, total_supply_18, share_price_usd_18, oracle_health,
        observed_at, canonical
    ) values (
        p_environment, p_chain_id, lower(p_vault_address), p_block_number, p_block_hash,
        p_nav_usd_18, p_total_supply_18, p_share_price_usd_18,
        coalesce((select jsonb_object_agg(item.token_address, item.oracle_health)
                  from jsonb_to_recordset(p_holdings) as item(token_address text, oracle_health text)), '{}'::jsonb),
        p_observed_at, true
    )
    on conflict (environment, chain_id, vault_address, block_number) do update set
        block_hash = excluded.block_hash,
        nav_usd_18 = excluded.nav_usd_18,
        total_supply_18 = excluded.total_supply_18,
        share_price_usd_18 = excluded.share_price_usd_18,
        oracle_health = excluded.oracle_health,
        observed_at = excluded.observed_at,
        canonical = true;

    insert into public.holding_snapshots (
        environment, chain_id, vault_address, token_address, block_number,
        block_hash, raw_balance, ui_multiplier_18, normalized_price_usd_18,
        value_usd_18, oracle_health, oracle_updated_at, observed_at, canonical
    )
    select
        p_environment, p_chain_id, lower(p_vault_address), lower(item.token_address),
        p_block_number, p_block_hash, item.raw_balance, item.ui_multiplier_18,
        item.normalized_price_usd_18, item.value_usd_18, item.oracle_health,
        item.oracle_updated_at, p_observed_at, true
    from jsonb_to_recordset(p_holdings) as item(
        token_address text,
        raw_balance numeric,
        ui_multiplier_18 numeric,
        normalized_price_usd_18 numeric,
        value_usd_18 numeric,
        oracle_health text,
        oracle_updated_at bigint
    )
    on conflict (environment, chain_id, vault_address, token_address, block_number) do update set
        block_hash = excluded.block_hash,
        raw_balance = excluded.raw_balance,
        ui_multiplier_18 = excluded.ui_multiplier_18,
        normalized_price_usd_18 = excluded.normalized_price_usd_18,
        value_usd_18 = excluded.value_usd_18,
        oracle_health = excluded.oracle_health,
        oracle_updated_at = excluded.oracle_updated_at,
        observed_at = excluded.observed_at,
        canonical = true;
end;
$$;

revoke all on function public.commit_core_snapshot(public.network_environment, bigint, text, bigint, text, timestamptz, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.commit_core_snapshot(public.network_environment, bigint, text, bigint, text, timestamptz, numeric, numeric, numeric, jsonb) to service_role;

create or replace function public.rewind_indexer(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_consumer text,
    p_replay_from_block bigint
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_replay_from_block < 0 then raise exception 'INVALID_REPLAY_BLOCK'; end if;

    update public.protocol_events set canonical = false
    where environment = p_environment and chain_id = p_chain_id
      and block_number >= p_replay_from_block and canonical;
    update public.nav_snapshots set canonical = false
    where environment = p_environment and chain_id = p_chain_id
      and block_number >= p_replay_from_block and canonical;
    update public.holding_snapshots set canonical = false
    where environment = p_environment and chain_id = p_chain_id
      and block_number >= p_replay_from_block and canonical;

    insert into public.chain_checkpoints (
        environment, chain_id, consumer, next_block,
        last_finalized_block, last_finalized_hash, updated_at
    ) values (
        p_environment, p_chain_id, p_consumer, p_replay_from_block, null, null, now()
    )
    on conflict (environment, chain_id, consumer) do update set
        next_block = excluded.next_block,
        last_finalized_block = null,
        last_finalized_hash = null,
        updated_at = excluded.updated_at;
end;
$$;

commit;
