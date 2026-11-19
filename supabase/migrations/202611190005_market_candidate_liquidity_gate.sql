begin;

alter table public.market_candidates
    add column if not exists dex_reference_price_18 numeric(78,0),
    add column if not exists liquidity_observed_at timestamptz;

create table if not exists public.market_candidate_liquidity_observations (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
    pool_address text not null check (pool_address ~ '^0x[0-9a-f]{40}$'),
    notional_usdg_6 numeric(78,0) not null check (notional_usdg_6 > 0),
    buy_price_impact_bps integer check (buy_price_impact_bps between 0 and 10000),
    sell_price_impact_bps integer check (sell_price_impact_bps between 0 and 10000),
    dex_buy_price_18 numeric(78,0),
    oracle_deviation_bps integer check (oracle_deviation_bps between 0 and 10000),
    passed boolean not null,
    failure_code text,
    observed_at timestamptz not null,
    created_at timestamptz not null default now(),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates (environment, chain_id, candidate_id)
        on delete cascade
);

create index if not exists market_candidate_liquidity_observations_lookup_idx
    on public.market_candidate_liquidity_observations
    (environment, chain_id, candidate_id, observed_at desc);

alter table public.market_candidate_liquidity_observations enable row level security;
revoke all on public.market_candidate_liquidity_observations from anon, authenticated;

commit;
