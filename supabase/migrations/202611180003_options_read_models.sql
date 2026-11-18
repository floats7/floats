begin;

create table public.options_series_events (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    series_id text not null check (series_id ~ '^0x[0-9a-fA-F]{64}$'),
    event_name text not null check (event_name in ('SeriesCreated', 'SeriesStateChanged')),
    payload jsonb not null,
    canonical boolean not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create table public.options_market_events (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    series_id text not null check (series_id ~ '^0x[0-9a-fA-F]{64}$'),
    wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    event_name text not null check (event_name in ('OptionBought', 'OptionSoldBack', 'OptionClaimed')),
    size_18 numeric(78, 0) not null check (size_18 > 0),
    cash_amount_6 numeric(78, 0) not null check (cash_amount_6 >= 0),
    payload jsonb not null,
    canonical boolean not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create table public.options_settlement_events (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    series_id text not null check (series_id ~ '^0x[0-9a-fA-F]{64}$'),
    settlement_price_usd_18 numeric(78, 0) not null check (settlement_price_usd_18 > 0),
    payoff_per_unit_usd_18 numeric(78, 0) not null check (payoff_per_unit_usd_18 >= 0),
    total_claimable_6 numeric(78, 0) not null check (total_claimable_6 >= 0),
    manual boolean not null,
    canonical boolean not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create table public.options_withdrawal_events (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    request_id numeric(78, 0) not null check (request_id > 0),
    event_name text not null check (event_name in (
        'WithdrawalRequested', 'WithdrawalCancelled', 'WithdrawalFinalized', 'WithdrawalClaimed'
    )),
    owner_address text check (owner_address is null or owner_address ~ '^0x[0-9a-fA-F]{40}$'),
    receiver_address text check (receiver_address is null or receiver_address ~ '^0x[0-9a-fA-F]{40}$'),
    shares numeric(78, 0) check (shares is null or shares > 0),
    assets_6 numeric(78, 0) check (assets_6 is null or assets_6 >= 0),
    unlock_at timestamptz,
    payload jsonb not null,
    canonical boolean not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create index options_series_events_lookup_idx
    on public.options_series_events (environment, chain_id, series_id, block_number desc, log_index desc)
    where canonical;
create index options_market_events_wallet_idx
    on public.options_market_events (environment, chain_id, wallet_address, block_number desc, log_index desc)
    where canonical;
create index options_settlement_events_series_idx
    on public.options_settlement_events (environment, chain_id, series_id, block_number desc)
    where canonical;
create index options_withdrawal_events_request_idx
    on public.options_withdrawal_events (environment, chain_id, request_id, block_number desc, log_index desc)
    where canonical;

alter table public.options_series_events enable row level security;
alter table public.options_market_events enable row level security;
alter table public.options_settlement_events enable row level security;
alter table public.options_withdrawal_events enable row level security;
revoke all on public.options_series_events, public.options_market_events,
    public.options_settlement_events, public.options_withdrawal_events from anon, authenticated;

create or replace function public.project_options_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    series_id_value text;
    wallet_value text;
    cash_value numeric;
begin
    series_id_value := lower(new.payload->>'seriesId');

    if new.event_name in ('SeriesCreated', 'SeriesStateChanged') then
        insert into public.options_series_events (
            environment, chain_id, transaction_hash, log_index, block_number,
            block_hash, series_id, event_name, payload, canonical, observed_at
        ) values (
            new.environment, new.chain_id, new.transaction_hash, new.log_index,
            new.block_number, new.block_hash, series_id_value, new.event_name,
            new.payload, new.canonical, new.block_timestamp
        )
        on conflict (environment, chain_id, transaction_hash, log_index) do update set
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            series_id = excluded.series_id,
            event_name = excluded.event_name,
            payload = excluded.payload,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;
    end if;

    if new.event_name in ('OptionBought', 'OptionSoldBack', 'OptionClaimed') then
        wallet_value := lower(coalesce(new.payload->>'buyer', new.payload->>'account'));
        cash_value := case new.event_name
            when 'OptionBought' then (new.payload->>'premium6')::numeric
            when 'OptionSoldBack' then (new.payload->>'payout6')::numeric
            else (new.payload->>'payout6')::numeric
        end;
        insert into public.options_market_events (
            environment, chain_id, transaction_hash, log_index, block_number,
            block_hash, series_id, wallet_address, event_name, size_18,
            cash_amount_6, payload, canonical, observed_at
        ) values (
            new.environment, new.chain_id, new.transaction_hash, new.log_index,
            new.block_number, new.block_hash, series_id_value, wallet_value,
            new.event_name, (new.payload->>'size18')::numeric, cash_value,
            new.payload, new.canonical, new.block_timestamp
        )
        on conflict (environment, chain_id, transaction_hash, log_index) do update set
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            series_id = excluded.series_id,
            wallet_address = excluded.wallet_address,
            event_name = excluded.event_name,
            size_18 = excluded.size_18,
            cash_amount_6 = excluded.cash_amount_6,
            payload = excluded.payload,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;
    end if;

    if new.event_name = 'SeriesSettled' then
        insert into public.options_settlement_events (
            environment, chain_id, transaction_hash, log_index, block_number,
            block_hash, series_id, settlement_price_usd_18,
            payoff_per_unit_usd_18, total_claimable_6, manual, canonical, observed_at
        ) values (
            new.environment, new.chain_id, new.transaction_hash, new.log_index,
            new.block_number, new.block_hash, series_id_value,
            (new.payload->>'settlementPriceUsd18')::numeric,
            (new.payload->>'payoffPerUnitUsd18')::numeric,
            (new.payload->>'totalClaimable6')::numeric,
            (new.payload->>'manual')::boolean, new.canonical, new.block_timestamp
        )
        on conflict (environment, chain_id, transaction_hash, log_index) do update set
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            series_id = excluded.series_id,
            settlement_price_usd_18 = excluded.settlement_price_usd_18,
            payoff_per_unit_usd_18 = excluded.payoff_per_unit_usd_18,
            total_claimable_6 = excluded.total_claimable_6,
            manual = excluded.manual,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;
    end if;

    if new.event_name in (
        'WithdrawalRequested', 'WithdrawalCancelled', 'WithdrawalFinalized', 'WithdrawalClaimed'
    ) then
        insert into public.options_withdrawal_events (
            environment, chain_id, transaction_hash, log_index, block_number,
            block_hash, request_id, event_name, owner_address, receiver_address,
            shares, assets_6, unlock_at, payload, canonical, observed_at
        ) values (
            new.environment, new.chain_id, new.transaction_hash, new.log_index,
            new.block_number, new.block_hash, (new.payload->>'requestId')::numeric,
            new.event_name, lower(new.payload->>'owner'), lower(new.payload->>'receiver'),
            nullif(new.payload->>'shares', '')::numeric,
            nullif(new.payload->>'assets', '')::numeric,
            case when new.payload ? 'unlockAt'
                 then to_timestamp((new.payload->>'unlockAt')::double precision)
                 else null end,
            new.payload, new.canonical, new.block_timestamp
        )
        on conflict (environment, chain_id, transaction_hash, log_index) do update set
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            request_id = excluded.request_id,
            event_name = excluded.event_name,
            owner_address = excluded.owner_address,
            receiver_address = excluded.receiver_address,
            shares = excluded.shares,
            assets_6 = excluded.assets_6,
            unlock_at = excluded.unlock_at,
            payload = excluded.payload,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;
    end if;

    return new;
end;
$$;

create trigger project_options_event_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_options_event();

create view public.api_options_series
with (security_invoker = true)
as
select
    created.environment,
    created.chain_id,
    created.series_id,
    created.payload->>'underlying' as underlying,
    asset.symbol as underlying_symbol,
    created.payload->>'underlyingUid' as underlying_uid,
    created.payload->>'priceSource' as price_source,
    created.payload->>'kind' as kind,
    created.payload->>'strikeUsd18' as strike_usd_18,
    created.payload->>'capUsd18' as cap_usd_18,
    created.payload->>'expiry' as expiry,
    created.payload->>'contractSize18' as contract_size_18,
    created.payload->>'corporateActionPolicyVersion' as corporate_action_policy_version,
    coalesce(latest.payload->>'newState', '0') as state,
    settlement.settlement_price_usd_18::text,
    settlement.payoff_per_unit_usd_18::text,
    settlement.total_claimable_6::text,
    settlement.manual,
    created.observed_at as created_at
from public.options_series_events created
left join public.assets asset
  on asset.environment = created.environment
 and asset.chain_id = created.chain_id
 and lower(asset.token_address) = lower(created.payload->>'underlying')
left join lateral (
    select state.payload
    from public.options_series_events state
    where state.environment = created.environment
      and state.chain_id = created.chain_id
      and state.series_id = created.series_id
      and state.event_name = 'SeriesStateChanged'
      and state.canonical
    order by state.block_number desc, state.log_index desc
    limit 1
) latest on true
left join lateral (
    select settled.*
    from public.options_settlement_events settled
    where settled.environment = created.environment
      and settled.chain_id = created.chain_id
      and settled.series_id = created.series_id
      and settled.canonical
    order by settled.block_number desc, settled.log_index desc
    limit 1
) settlement on true
where created.event_name = 'SeriesCreated' and created.canonical;

create view public.api_options_positions
with (security_invoker = true)
as
select
    market.environment,
    market.chain_id,
    market.wallet_address,
    market.series_id,
    created.payload->>'underlying' as underlying,
    asset.symbol as underlying_symbol,
    sum(case market.event_name when 'OptionBought' then market.size_18 else -market.size_18 end)::text as size_18,
    sum(case market.event_name
        when 'OptionBought' then -cash_amount_6
        else cash_amount_6
    end)::text as net_cash_flow_6,
    max(market.observed_at) as updated_at
from public.options_market_events market
join public.options_series_events created
  on created.environment = market.environment
 and created.chain_id = market.chain_id
 and created.series_id = market.series_id
 and created.event_name = 'SeriesCreated'
 and created.canonical
left join public.assets asset
  on asset.environment = market.environment
 and asset.chain_id = market.chain_id
 and lower(asset.token_address) = lower(created.payload->>'underlying')
where market.canonical
group by market.environment, market.chain_id, market.wallet_address, market.series_id,
         created.payload->>'underlying', asset.symbol
having sum(case market.event_name when 'OptionBought' then market.size_18 else -market.size_18 end) > 0;

create view public.api_options_activity
with (security_invoker = true)
as
select
    environment, chain_id, transaction_hash, log_index, block_number, series_id,
    wallet_address, event_name, size_18::text, cash_amount_6::text, observed_at
from public.options_market_events
where canonical;

create view public.api_options_withdrawals
with (security_invoker = true)
as
select
    requested.environment,
    requested.chain_id,
    requested.request_id::text,
    latest.event_name as state,
    requested.owner_address,
    requested.receiver_address,
    requested.shares::text,
    latest.assets_6::text,
    requested.unlock_at,
    latest.observed_at as updated_at
from public.options_withdrawal_events requested
join lateral (
    select event.event_name, event.assets_6, event.observed_at
    from public.options_withdrawal_events event
    where event.environment = requested.environment
      and event.chain_id = requested.chain_id
      and event.request_id = requested.request_id
      and event.canonical
    order by event.block_number desc, event.log_index desc
    limit 1
) latest on true
where requested.event_name = 'WithdrawalRequested' and requested.canonical;

revoke all on function public.project_options_event() from public, anon, authenticated;
revoke all on public.api_options_series, public.api_options_positions,
    public.api_options_activity, public.api_options_withdrawals from public, anon, authenticated;
grant select on public.api_options_series, public.api_options_positions,
    public.api_options_activity, public.api_options_withdrawals to service_role;

commit;
