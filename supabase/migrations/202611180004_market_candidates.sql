begin;

create table public.market_candidates (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null check (candidate_id ~ '^[a-z0-9-]+$'),
    symbol text not null check (symbol ~ '^[A-Z0-9.-]{1,16}$'),
    company_name text not null,
    lifecycle_status text not null check (lifecycle_status in (
        'upcoming','listing_expected','listed','token_pending','token_live',
        'oracle_pending','liquidity_pending','governance_pending','active','suspended','removed'
    )),
    ipo_date date,
    expected_listing_date date,
    eligible_from date,
    source_url text,
    token_address text check (token_address is null or token_address ~ '^0x[0-9a-fA-F]{40}$'),
    asset_uid text check (asset_uid is null or asset_uid ~ '^0x[0-9a-fA-F]{64}$'),
    isin text,
    logo_url text,
    token_live boolean not null default false,
    oracle_ready boolean not null default false,
    liquidity_ready boolean not null default false,
    governance_approved boolean not null default false,
    disabled_reason text,
    last_checked_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (environment, chain_id, candidate_id),
    unique (environment, chain_id, symbol)
);

create index market_candidates_status_idx
    on public.market_candidates (environment, chain_id, lifecycle_status, symbol);

alter table public.market_candidates enable row level security;
revoke all on public.market_candidates from anon, authenticated;

commit;
