begin;

create table if not exists public.market_candidate_operator_signoffs (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    tier text not null check (tier in ('market','spot','options','index')),
    decision text not null check (decision in ('approved','rejected')),
    operator_reference text not null check (length(trim(operator_reference)) between 3 and 200),
    reviewer_reference text not null check (length(trim(reviewer_reference)) between 3 and 200),
    evidence_references jsonb not null check (
        jsonb_typeof(evidence_references) = 'array'
        and jsonb_array_length(evidence_references) > 0
    ),
    readiness_snapshot jsonb not null check (jsonb_typeof(readiness_snapshot) = 'object'),
    governance_or_canary_reference text,
    rationale text not null check (length(trim(rationale)) between 3 and 1000),
    signed_at timestamptz not null default now(),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates (environment, chain_id, candidate_id)
        on delete restrict
);

create or replace function public.prevent_market_candidate_signoff_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    raise exception 'market candidate operator sign-offs are append-only';
end;
$$;

drop trigger if exists market_candidate_operator_signoffs_append_only
    on public.market_candidate_operator_signoffs;
create trigger market_candidate_operator_signoffs_append_only
before update or delete on public.market_candidate_operator_signoffs
for each row execute function public.prevent_market_candidate_signoff_mutation();

create or replace function public.record_market_candidate_operator_signoff(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_candidate_id text,
    p_tier text,
    p_decision text,
    p_operator_reference text,
    p_reviewer_reference text,
    p_evidence_references jsonb,
    p_readiness_snapshot jsonb,
    p_governance_or_canary_reference text,
    p_rationale text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    signoff_id bigint;
begin
    if p_tier not in ('market','spot','options','index')
        or p_decision not in ('approved','rejected')
        or length(trim(p_operator_reference)) not between 3 and 200
        or length(trim(p_reviewer_reference)) not between 3 and 200
        or trim(p_operator_reference) = trim(p_reviewer_reference)
        or jsonb_typeof(p_evidence_references) is distinct from 'array'
        or jsonb_array_length(p_evidence_references) = 0
        or jsonb_typeof(p_readiness_snapshot) is distinct from 'object'
        or length(trim(p_rationale)) not between 3 and 1000
    then
        raise exception 'invalid market candidate operator sign-off';
    end if;

    insert into public.market_candidate_operator_signoffs (
        environment, chain_id, candidate_id, tier, decision,
        operator_reference, reviewer_reference, evidence_references,
        readiness_snapshot, governance_or_canary_reference, rationale
    ) values (
        p_environment, p_chain_id, trim(p_candidate_id), p_tier, p_decision,
        trim(p_operator_reference), trim(p_reviewer_reference), p_evidence_references,
        p_readiness_snapshot, nullif(trim(p_governance_or_canary_reference), ''), trim(p_rationale)
    ) returning id into signoff_id;

    return signoff_id;
end;
$$;

alter table public.market_candidate_operator_signoffs enable row level security;
revoke all on public.market_candidate_operator_signoffs from anon, authenticated;
revoke all on function public.record_market_candidate_operator_signoff(
    public.network_environment,bigint,text,text,text,text,text,jsonb,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.record_market_candidate_operator_signoff(
    public.network_environment,bigint,text,text,text,text,text,jsonb,jsonb,text,text
) to service_role;

commit;
