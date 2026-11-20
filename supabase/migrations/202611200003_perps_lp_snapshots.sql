begin;

-- Keeper-owned, direct-contract observations used for operational alerts and
-- realized LP share-price history. They are evidence snapshots, not promised yield.
create table public.perps_lp_snapshots (
    environment text not null,
    chain_id bigint not null,
    vault_address text not null,
    block_number bigint not null,
    managed_assets_6 numeric not null,
    total_supply_18 numeric not null,
    share_price_18 numeric not null,
    utilization_bps numeric not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, vault_address, block_number),
    check (managed_assets_6 >= 0),
    check (total_supply_18 >= 0),
    check (share_price_18 >= 0),
    check (utilization_bps >= 0 and utilization_bps <= 10000)
);

create index perps_lp_snapshots_history_idx
    on public.perps_lp_snapshots
        (environment, chain_id, vault_address, observed_at desc);

alter table public.perps_lp_snapshots enable row level security;
revoke all on public.perps_lp_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.perps_lp_snapshots to service_role;

commit;
