begin;

-- Perps projections are backend-owned. Browser clients consume bounded API
-- responses and never receive direct database credentials.
create table public.perps_markets (
    environment text not null,
    chain_id bigint not null,
    market_id text not null,
    symbol text not null,
    underlying_address text not null,
    underlying_uid text not null,
    price_feed_address text not null,
    market_state text not null,
    session_state text not null,
    isolated_only boolean not null,
    max_leverage_bps integer not null,
    initial_margin_bps integer not null,
    maintenance_margin_bps integer not null,
    open_interest_cap_bps integer not null,
    base_spread_bps integer not null,
    trading_fee_bps integer not null,
    max_price_age_seconds bigint not null,
    block_number bigint not null,
    transaction_hash text not null,
    updated_at timestamptz not null,
    primary key (environment, chain_id, market_id),
    check (market_state in ('disabled', 'active', 'reduce_only')),
    check (session_state in ('regular', 'extended', 'overnight', 'closed'))
);

create table public.perps_positions (
    environment text not null,
    chain_id bigint not null,
    account_address text not null,
    market_id text not null,
    margin_mode text not null,
    size_18 numeric not null,
    entry_price_usd_18 numeric not null,
    last_funding_index_18 numeric not null,
    realized_pnl_usd_18 numeric not null,
    pending_fees_usd_18 numeric not null,
    open_interest_usd_18 numeric not null,
    reserved_liability_6 numeric not null,
    block_number bigint not null,
    transaction_hash text not null,
    updated_at timestamptz not null,
    primary key (environment, chain_id, account_address, market_id),
    check (margin_mode in ('isolated', 'cross'))
);

create index perps_positions_market_idx
    on public.perps_positions (environment, chain_id, market_id, updated_at desc);

create table public.perps_collateral_accounts (
    environment text not null,
    chain_id bigint not null,
    account_address text not null,
    free_collateral_6 numeric not null,
    cross_collateral_6 numeric not null,
    cross_equity_usd_18 numeric not null,
    cross_initial_margin_usd_18 numeric not null,
    cross_maintenance_margin_usd_18 numeric not null,
    cross_margin_ratio_18 numeric not null,
    cross_liquidatable boolean not null,
    block_number bigint not null,
    updated_at timestamptz not null,
    primary key (environment, chain_id, account_address)
);

create table public.perps_funding_snapshots (
    environment text not null,
    chain_id bigint not null,
    market_id text not null,
    funding_index_18 numeric not null,
    funding_rate_18 numeric not null,
    long_open_interest_usd_18 numeric not null,
    short_open_interest_usd_18 numeric not null,
    block_number bigint not null,
    transaction_hash text not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, market_id, block_number)
);

create index perps_funding_history_idx
    on public.perps_funding_snapshots (environment, chain_id, market_id, observed_at desc);

create table public.perps_liquidations (
    environment text not null,
    chain_id bigint not null,
    transaction_hash text not null,
    log_index integer not null,
    account_address text not null,
    market_id text not null,
    keeper_address text not null,
    margin_mode text not null,
    closed_size_18 numeric not null,
    mark_price_usd_18 numeric not null,
    settlement_usd_18 numeric not null,
    liquidation_fee_6 numeric not null,
    bad_debt_6 numeric not null,
    insurance_covered_6 numeric not null,
    full_liquidation boolean not null,
    block_number bigint not null,
    block_hash text not null,
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index),
    check (margin_mode in ('isolated', 'cross'))
);

create index perps_liquidations_account_idx
    on public.perps_liquidations
        (environment, chain_id, account_address, block_number desc, log_index desc)
    where canonical;

create table public.perps_lp_state (
    environment text not null,
    chain_id bigint not null,
    vault_address text not null,
    managed_assets_6 numeric not null,
    available_liquidity_6 numeric not null,
    reserved_trader_liability_6 numeric not null,
    payable_withdrawal_assets_6 numeric not null,
    recognized_bad_debt_6 numeric not null,
    total_supply_18 numeric not null,
    utilization_bps numeric not null,
    operations_paused boolean not null,
    block_number bigint not null,
    updated_at timestamptz not null,
    primary key (environment, chain_id, vault_address)
);

create table public.perps_lp_withdrawals (
    environment text not null,
    chain_id bigint not null,
    request_id numeric not null,
    vault_address text not null,
    owner_address text not null,
    receiver_address text not null,
    shares_18 numeric not null,
    unlock_at timestamptz not null,
    state text not null,
    assets_6 numeric,
    block_number bigint not null,
    transaction_hash text not null,
    updated_at timestamptz not null,
    primary key (environment, chain_id, request_id),
    check (state in ('queued', 'cancelled', 'processed', 'claimed'))
);

create index perps_lp_withdrawals_owner_idx
    on public.perps_lp_withdrawals (environment, chain_id, owner_address, updated_at desc);

create table public.perps_activity (
    environment text not null,
    chain_id bigint not null,
    transaction_hash text not null,
    log_index integer not null,
    block_number bigint not null,
    block_hash text not null,
    contract_address text not null,
    event_name text not null,
    account_address text,
    market_id text,
    payload jsonb not null,
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create index perps_activity_public_idx
    on public.perps_activity (environment, chain_id, block_number desc, log_index desc)
    where canonical;

create index perps_activity_wallet_idx
    on public.perps_activity
        (environment, chain_id, account_address, block_number desc, log_index desc)
    where canonical and account_address is not null;

create or replace function public.project_perps_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.event_name not like 'Perps%' then
        return new;
    end if;

    insert into public.perps_activity (
        environment, chain_id, transaction_hash, log_index, block_number,
        block_hash, contract_address, event_name, account_address, market_id,
        payload, canonical, observed_at
    ) values (
        new.environment, new.chain_id, new.transaction_hash, new.log_index,
        new.block_number, new.block_hash, lower(new.contract_address),
        new.event_name, lower(coalesce(new.payload->>'account', new.payload->>'owner', new.payload->>'receiver')),
        lower(new.payload->>'marketId'), new.payload, new.canonical,
        new.block_timestamp
    )
    on conflict (environment, chain_id, transaction_hash, log_index)
    do update set
        block_number = excluded.block_number,
        block_hash = excluded.block_hash,
        contract_address = excluded.contract_address,
        event_name = excluded.event_name,
        account_address = excluded.account_address,
        market_id = excluded.market_id,
        payload = excluded.payload,
        canonical = excluded.canonical,
        observed_at = excluded.observed_at;

    if new.event_name = 'PerpsWithdrawalRequested' then
        insert into public.perps_lp_withdrawals (
            environment, chain_id, request_id, vault_address, owner_address,
            receiver_address, shares_18, unlock_at, state, assets_6,
            block_number, transaction_hash, updated_at
        ) values (
            new.environment, new.chain_id, (new.payload->>'requestId')::numeric,
            lower(new.contract_address), lower(new.payload->>'owner'),
            lower(new.payload->>'receiver'), (new.payload->>'shares')::numeric,
            to_timestamp((new.payload->>'unlockAt')::numeric), 'queued', null,
            new.block_number, new.transaction_hash, new.block_timestamp
        )
        on conflict (environment, chain_id, request_id) do update set
            vault_address = excluded.vault_address,
            owner_address = excluded.owner_address,
            receiver_address = excluded.receiver_address,
            shares_18 = excluded.shares_18,
            unlock_at = excluded.unlock_at,
            state = excluded.state,
            assets_6 = null,
            block_number = excluded.block_number,
            transaction_hash = excluded.transaction_hash,
            updated_at = excluded.updated_at;
    elsif new.event_name = 'PerpsWithdrawalCancelled' then
        update public.perps_lp_withdrawals set
            state = 'cancelled', block_number = new.block_number,
            transaction_hash = new.transaction_hash, updated_at = new.block_timestamp
        where environment = new.environment and chain_id = new.chain_id
          and request_id = (new.payload->>'requestId')::numeric;
    elsif new.event_name = 'PerpsWithdrawalProcessed' then
        update public.perps_lp_withdrawals set
            state = 'processed', assets_6 = (new.payload->>'assets')::numeric,
            block_number = new.block_number, transaction_hash = new.transaction_hash,
            updated_at = new.block_timestamp
        where environment = new.environment and chain_id = new.chain_id
          and request_id = (new.payload->>'requestId')::numeric;
    elsif new.event_name = 'PerpsWithdrawalClaimed' then
        update public.perps_lp_withdrawals set
            state = 'claimed', assets_6 = (new.payload->>'assets')::numeric,
            block_number = new.block_number, transaction_hash = new.transaction_hash,
            updated_at = new.block_timestamp
        where environment = new.environment and chain_id = new.chain_id
          and request_id = (new.payload->>'requestId')::numeric;
    end if;

    return new;
end;
$$;

create trigger project_perps_activity_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_perps_activity();

alter table public.perps_markets enable row level security;
alter table public.perps_positions enable row level security;
alter table public.perps_collateral_accounts enable row level security;
alter table public.perps_funding_snapshots enable row level security;
alter table public.perps_liquidations enable row level security;
alter table public.perps_lp_state enable row level security;
alter table public.perps_lp_withdrawals enable row level security;
alter table public.perps_activity enable row level security;

revoke all on public.perps_markets from public, anon, authenticated;
revoke all on public.perps_positions from public, anon, authenticated;
revoke all on public.perps_collateral_accounts from public, anon, authenticated;
revoke all on public.perps_funding_snapshots from public, anon, authenticated;
revoke all on public.perps_liquidations from public, anon, authenticated;
revoke all on public.perps_lp_state from public, anon, authenticated;
revoke all on public.perps_lp_withdrawals from public, anon, authenticated;
revoke all on public.perps_activity from public, anon, authenticated;

grant select, insert, update, delete on public.perps_markets to service_role;
grant select, insert, update, delete on public.perps_positions to service_role;
grant select, insert, update, delete on public.perps_collateral_accounts to service_role;
grant select, insert, update, delete on public.perps_funding_snapshots to service_role;
grant select, insert, update, delete on public.perps_liquidations to service_role;
grant select, insert, update, delete on public.perps_lp_state to service_role;
grant select, insert, update, delete on public.perps_lp_withdrawals to service_role;
grant select, insert, update, delete on public.perps_activity to service_role;

revoke all on function public.project_perps_activity() from public, anon, authenticated;

commit;
