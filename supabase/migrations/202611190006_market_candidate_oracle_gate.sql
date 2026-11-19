begin;

alter table public.market_candidates
    add column if not exists official_feed_address text,
    add column if not exists oracle_healthy_since timestamptz,
    add column if not exists oracle_last_price_18 numeric(78,0),
    add column if not exists oracle_last_failure text;

alter table public.market_candidates
    drop constraint if exists market_candidates_official_feed_address_check;
alter table public.market_candidates
    add constraint market_candidates_official_feed_address_check
    check (official_feed_address is null or official_feed_address ~ '^0x[0-9a-f]{40}$');

create table if not exists public.market_candidate_oracle_observations (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
    feed_address text not null check (feed_address ~ '^0x[0-9a-f]{40}$'),
    round_id numeric(78,0),
    answered_in_round numeric(78,0),
    price_18 numeric(78,0),
    feed_updated_at timestamptz,
    passed boolean not null,
    failure_code text,
    observed_at timestamptz not null,
    created_at timestamptz not null default now(),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates (environment, chain_id, candidate_id)
        on delete cascade
);

create index if not exists market_candidate_oracle_observations_lookup_idx
    on public.market_candidate_oracle_observations
    (environment, chain_id, candidate_id, observed_at desc);

alter table public.market_candidate_oracle_observations enable row level security;
revoke all on public.market_candidate_oracle_observations from anon, authenticated;

commit;
