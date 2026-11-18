begin;

create table public.options_quote_audit (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    request_id text not null check (length(request_id) between 1 and 128),
    series_id text not null check (series_id ~ '^0x[0-9a-f]{64}$'),
    buyer text not null check (buyer ~ '^0x[0-9a-f]{40}$'),
    side text not null check (side in ('buy', 'sell-back')),
    decision text not null check (decision in ('quoted', 'rejected')),
    reason text,
    policy_input jsonb not null,
    pricing_result jsonb,
    created_at timestamptz not null default now(),
    unique (environment, chain_id, request_id),
    check (
        (decision = 'quoted' and pricing_result is not null and reason is null)
        or (decision = 'rejected' and pricing_result is null and reason is not null)
    )
);

create index options_quote_audit_series_created_idx
    on public.options_quote_audit (environment, chain_id, series_id, created_at desc);

alter table public.options_quote_audit enable row level security;

create table public.options_quote_nonces (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    buyer text not null check (buyer ~ '^0x[0-9a-f]{40}$'),
    next_nonce numeric(78, 0) not null check (next_nonce >= 0),
    updated_at timestamptz not null default now(),
    primary key (environment, chain_id, buyer)
);

alter table public.options_quote_nonces enable row level security;

create or replace function public.allocate_options_quote_nonce(
    target_environment public.network_environment,
    target_chain_id bigint,
    target_buyer text
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
    allocated numeric(78, 0);
begin
    if target_chain_id <= 0 or target_buyer !~ '^0x[0-9a-f]{40}$' then
        raise exception 'invalid quote nonce scope';
    end if;
    insert into public.options_quote_nonces (environment, chain_id, buyer, next_nonce)
    values (target_environment, target_chain_id, target_buyer, 1)
    on conflict (environment, chain_id, buyer) do update
       set next_nonce = options_quote_nonces.next_nonce + 1,
           updated_at = now()
    returning next_nonce - 1 into allocated;
    return allocated::text;
end;
$$;

revoke all on public.options_quote_nonces from anon, authenticated;
revoke all on function public.allocate_options_quote_nonce(public.network_environment, bigint, text)
    from public, anon, authenticated;

create table public.options_volatility_observations (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    underlying text not null check (underlying ~ '^0x[0-9a-f]{40}$'),
    source text not null check (source in ('external-implied', 'sector-peer', 'basket-realized')),
    annualized_volatility double precision not null check (annualized_volatility > 0 and annualized_volatility <= 10),
    observed_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (environment, chain_id, underlying, source, observed_at)
);

create index options_volatility_lookup_idx on public.options_volatility_observations
    (environment, chain_id, underlying, observed_at desc);

alter table public.options_volatility_observations enable row level security;
revoke all on public.options_volatility_observations from anon, authenticated;

-- No browser policy: quote audit evidence is server-only.

commit;
