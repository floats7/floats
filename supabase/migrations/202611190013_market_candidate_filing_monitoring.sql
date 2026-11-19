begin;

create table public.market_candidate_filing_observations (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    cik text not null check (cik ~ '^[0-9]{10}$'),
    registrant_name text not null,
    form_type text not null check (form_type in ('S-1','S-1/A')),
    accession_number text not null check (accession_number ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
    filing_date date not null,
    primary_document text not null,
    source_url text not null check (source_url ~ '^https://www\.sec\.gov/'),
    reviewed_at timestamptz,
    reviewed_by text,
    recorded_at timestamptz not null default now(),
    primary key (environment, chain_id, candidate_id, accession_number),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates(environment, chain_id, candidate_id)
        on delete cascade,
    check ((reviewed_at is null) = (reviewed_by is null))
);

create index market_candidate_filing_observations_review_idx
    on public.market_candidate_filing_observations (
        environment, chain_id, candidate_id, reviewed_at, filing_date desc
    );

alter table public.market_candidate_filing_observations enable row level security;
revoke all on public.market_candidate_filing_observations from anon, authenticated;

commit;
