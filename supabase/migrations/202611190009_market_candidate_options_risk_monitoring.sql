begin;

alter table public.market_candidates
    add column if not exists options_exposure_warning boolean not null default false;

create table if not exists public.market_candidate_options_risk_observations (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
    risk_manager_address text not null check (risk_manager_address ~ '^0x[0-9a-f]{40}$'),
    exposure_6 numeric(78,0) not null,
    capital_6 numeric(78,0) not null,
    maximum_exposure_6 numeric(78,0) not null,
    cap_utilization_bps integer not null check (cap_utilization_bps between 0 and 10000),
    warning boolean not null,
    observed_at timestamptz not null,
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates (environment, chain_id, candidate_id)
        on delete cascade
);

create index if not exists market_candidate_options_risk_lookup_idx
    on public.market_candidate_options_risk_observations
    (environment, chain_id, candidate_id, observed_at desc);
alter table public.market_candidate_options_risk_observations enable row level security;
revoke all on public.market_candidate_options_risk_observations from anon, authenticated;

commit;
