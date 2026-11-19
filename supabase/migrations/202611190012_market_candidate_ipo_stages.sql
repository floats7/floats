begin;

create type public.market_candidate_ipo_stage as enum (
    'confidential_filed',
    'public_s1',
    'roadshow',
    'priced',
    'trading',
    'withdrawn'
);

alter table public.market_candidates
    add column ipo_stage public.market_candidate_ipo_stage,
    add column ticker_announced boolean not null default true,
    add column exchange text,
    add column price_range_low numeric,
    add column price_range_high numeric,
    add column ipo_price numeric,
    add column stage_source_url text,
    add column stage_updated_at timestamptz,
    add constraint market_candidates_exchange_nonempty check (
        exchange is null or length(trim(exchange)) > 0
    ),
    add constraint market_candidates_positive_price_range check (
        (price_range_low is null and price_range_high is null)
        or (price_range_low > 0 and price_range_high >= price_range_low)
    ),
    add constraint market_candidates_positive_ipo_price check (
        ipo_price is null or ipo_price > 0
    ),
    add constraint market_candidates_stage_source_https check (
        stage_source_url is null or stage_source_url ~ '^https://'
    ),
    add constraint market_candidates_ipo_stage_evidence check (
        ipo_stage is null
        or (stage_source_url is not null and stage_updated_at is not null)
    ),
    add constraint market_candidates_roadshow_range check (
        ipo_stage not in ('roadshow','priced','trading')
        or (price_range_low is not null and price_range_high is not null)
    ),
    add constraint market_candidates_priced_value check (
        ipo_stage not in ('priced','trading') or ipo_price is not null
    ),
    add constraint market_candidates_trading_identity check (
        ipo_stage <> 'trading'
        or (ticker_announced and exchange is not null and expected_listing_date is not null)
    );

create table public.market_candidate_ipo_stage_events (
    event_id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    previous_stage public.market_candidate_ipo_stage,
    next_stage public.market_candidate_ipo_stage,
    previous_ticker_announced boolean not null,
    next_ticker_announced boolean not null,
    source_url text not null check (source_url ~ '^https://'),
    evidence_observed_at timestamptz not null,
    recorded_at timestamptz not null default now(),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates(environment, chain_id, candidate_id)
        on delete cascade
);

create index market_candidate_ipo_stage_events_lookup_idx
    on public.market_candidate_ipo_stage_events (
        environment, chain_id, candidate_id, recorded_at desc, event_id desc
    );

create or replace function public.enforce_market_candidate_ipo_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    old_rank integer;
    new_rank integer;
begin
    if old.ipo_stage is not distinct from new.ipo_stage then
        return new;
    end if;

    old_rank := case old.ipo_stage
        when 'confidential_filed' then 1
        when 'public_s1' then 2
        when 'roadshow' then 3
        when 'priced' then 4
        when 'trading' then 5
        when 'withdrawn' then 6
        else 0
    end;
    new_rank := case new.ipo_stage
        when 'confidential_filed' then 1
        when 'public_s1' then 2
        when 'roadshow' then 3
        when 'priced' then 4
        when 'trading' then 5
        when 'withdrawn' then 6
        else 0
    end;

    if new.ipo_stage is null or (new.ipo_stage <> 'withdrawn' and new_rank < old_rank) then
        raise exception 'IPO stage cannot move backward or be cleared';
    end if;
    return new;
end;
$$;

create trigger market_candidate_ipo_stage_transition_guard
before update of ipo_stage on public.market_candidates
for each row execute function public.enforce_market_candidate_ipo_stage_transition();

create or replace function public.record_market_candidate_ipo_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.ipo_stage is not null and (
       tg_op = 'INSERT'
       or old.ipo_stage is distinct from new.ipo_stage
       or old.ticker_announced is distinct from new.ticker_announced)
    then
        insert into public.market_candidate_ipo_stage_events (
            environment, chain_id, candidate_id, previous_stage, next_stage,
            previous_ticker_announced, next_ticker_announced, source_url,
            evidence_observed_at
        ) values (
            new.environment, new.chain_id, new.candidate_id,
            case when tg_op = 'INSERT' then null else old.ipo_stage end,
            new.ipo_stage,
            case when tg_op = 'INSERT' then false else old.ticker_announced end,
            new.ticker_announced,
            new.stage_source_url, new.stage_updated_at
        );
    end if;
    return new;
end;
$$;

create trigger market_candidate_ipo_stage_audit
after insert or update on public.market_candidates
for each row execute function public.record_market_candidate_ipo_stage_event();

alter table public.market_candidate_ipo_stage_events enable row level security;
revoke all on public.market_candidate_ipo_stage_events from anon, authenticated;

commit;
