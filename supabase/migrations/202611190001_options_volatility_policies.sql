begin;

create table public.options_volatility_policies (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    underlying text not null check (underlying ~ '^0x[0-9a-f]{40}$'),
    source text not null check (source in ('external-implied', 'sector-peer', 'basket-realized')),
    annualized_volatility double precision not null check (annualized_volatility > 0 and annualized_volatility <= 10),
    refresh_interval_seconds integer not null default 21600 check (refresh_interval_seconds between 900 and 86400),
    valid_until timestamptz not null,
    enabled boolean not null default true,
    rationale text not null check (length(rationale) between 1 and 500),
    updated_at timestamptz not null default now(),
    primary key (environment, chain_id, underlying)
);

create index options_volatility_policies_refresh_idx
    on public.options_volatility_policies (environment, chain_id, enabled, valid_until);

alter table public.options_volatility_policies enable row level security;
revoke all on public.options_volatility_policies from public, anon, authenticated;
grant select, insert, update on public.options_volatility_policies to service_role;

commit;
