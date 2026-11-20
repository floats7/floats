begin;

-- fUSD projections remain private to the backend. The public API applies the
-- deployed vault address as an additional boundary so similarly named ERC-4626
-- events from other contracts can never leak into the fUSD product.
create table public.fusd_events (
    environment text not null,
    chain_id bigint not null,
    transaction_hash text not null,
    log_index integer not null,
    block_number bigint not null,
    block_hash text not null,
    contract_address text not null,
    event_name text not null,
    wallet_address text,
    receiver_address text,
    request_id numeric,
    assets_6 numeric,
    shares_18 numeric,
    payload jsonb not null,
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create index fusd_events_contract_history_idx
    on public.fusd_events (environment, chain_id, contract_address, block_number desc, log_index desc)
    where canonical;

create index fusd_events_wallet_history_idx
    on public.fusd_events (environment, chain_id, contract_address, wallet_address, block_number desc)
    where canonical and wallet_address is not null;

alter table public.fusd_events enable row level security;
revoke all on public.fusd_events from public, anon, authenticated;
grant select on public.fusd_events to service_role;

create or replace function public.project_fusd_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    wallet_value text;
    receiver_value text;
    request_value numeric;
    assets_value numeric;
    shares_value numeric;
begin
    if new.event_name not in (
        'Deposit', 'Withdraw', 'FUSDWithdrawalRequested',
        'FUSDWithdrawalProcessed', 'WithdrawalCancelled', 'WithdrawalClaimed',
        'FUSDPerformanceFeeAccrued', 'FUSDStrategyInvested',
        'FUSDStrategyWithdrawn', 'FUSDStrategyEmergencyExited'
    ) then
        return new;
    end if;

    wallet_value := lower(coalesce(
        new.payload->>'owner', new.payload->>'sender', new.payload->>'caller'
    ));
    receiver_value := lower(new.payload->>'receiver');
    request_value := nullif(new.payload->>'requestId', '')::numeric;
    assets_value := nullif(coalesce(
        new.payload->>'assets', new.payload->>'assetsRecovered', new.payload->>'feeAssets'
    ), '')::numeric;
    shares_value := nullif(coalesce(
        new.payload->>'shares', new.payload->>'feeShares'
    ), '')::numeric;

    insert into public.fusd_events (
        environment, chain_id, transaction_hash, log_index, block_number,
        block_hash, contract_address, event_name, wallet_address,
        receiver_address, request_id, assets_6, shares_18, payload,
        canonical, observed_at
    ) values (
        new.environment, new.chain_id, new.transaction_hash, new.log_index,
        new.block_number, new.block_hash, lower(new.contract_address),
        new.event_name, wallet_value, receiver_value, request_value,
        assets_value, shares_value, new.payload, new.canonical,
        new.block_timestamp
    )
    on conflict (environment, chain_id, transaction_hash, log_index)
    do update set
        block_number = excluded.block_number,
        block_hash = excluded.block_hash,
        contract_address = excluded.contract_address,
        event_name = excluded.event_name,
        wallet_address = excluded.wallet_address,
        receiver_address = excluded.receiver_address,
        request_id = excluded.request_id,
        assets_6 = excluded.assets_6,
        shares_18 = excluded.shares_18,
        payload = excluded.payload,
        canonical = excluded.canonical,
        observed_at = excluded.observed_at;

    return new;
end;
$$;

create trigger project_fusd_event_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_fusd_event();

insert into public.fusd_events (
    environment, chain_id, transaction_hash, log_index, block_number,
    block_hash, contract_address, event_name, wallet_address,
    receiver_address, request_id, assets_6, shares_18, payload,
    canonical, observed_at
)
select
    event.environment, event.chain_id, event.transaction_hash, event.log_index,
    event.block_number, event.block_hash, lower(event.contract_address),
    event.event_name,
    lower(coalesce(event.payload->>'owner', event.payload->>'sender', event.payload->>'caller')),
    lower(event.payload->>'receiver'),
    nullif(event.payload->>'requestId', '')::numeric,
    nullif(coalesce(event.payload->>'assets', event.payload->>'assetsRecovered', event.payload->>'feeAssets'), '')::numeric,
    nullif(coalesce(event.payload->>'shares', event.payload->>'feeShares'), '')::numeric,
    event.payload, event.canonical, event.block_timestamp
from public.protocol_events event
where event.event_name in (
    'Deposit', 'Withdraw', 'FUSDWithdrawalRequested',
    'FUSDWithdrawalProcessed', 'WithdrawalCancelled', 'WithdrawalClaimed',
    'FUSDPerformanceFeeAccrued', 'FUSDStrategyInvested',
    'FUSDStrategyWithdrawn', 'FUSDStrategyEmergencyExited'
)
on conflict (environment, chain_id, transaction_hash, log_index) do nothing;

create view public.api_fusd_activity as
select
    environment, chain_id, transaction_hash, log_index, block_number,
    contract_address, event_name, wallet_address, receiver_address,
    request_id::text, assets_6::text, shares_18::text, observed_at
from public.fusd_events
where canonical;

create view public.api_fusd_withdrawals as
select
    requested.environment,
    requested.chain_id,
    requested.contract_address,
    requested.request_id::text as request_id,
    requested.wallet_address as owner_address,
    requested.receiver_address,
    requested.shares_18::text,
    latest.event_name as state,
    latest.assets_6::text,
    latest.observed_at as updated_at
from public.fusd_events requested
cross join lateral (
    select event.event_name, event.assets_6, event.observed_at
    from public.fusd_events event
    where event.environment = requested.environment
      and event.chain_id = requested.chain_id
      and event.contract_address = requested.contract_address
      and event.request_id = requested.request_id
      and event.canonical
    order by event.block_number desc, event.log_index desc
    limit 1
) latest
where requested.event_name = 'FUSDWithdrawalRequested'
  and requested.canonical;

revoke all on function public.project_fusd_event() from public, anon, authenticated;
revoke all on public.api_fusd_activity, public.api_fusd_withdrawals from public, anon, authenticated;
grant select on public.api_fusd_activity, public.api_fusd_withdrawals to service_role;

commit;
