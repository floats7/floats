begin;

alter table public.market_candidates
    add column if not exists official_token_detected_at timestamptz,
    add column if not exists public_available_at timestamptz,
    add column if not exists publication_sla_seconds integer
        check (publication_sla_seconds is null or publication_sla_seconds >= 0);

create or replace function public.capture_market_candidate_publication_sla()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if new.detected_token_address is not null and old.detected_token_address is null then
        new.official_token_detected_at = coalesce(new.official_token_detected_at, now());
    end if;
    if new.identity_approval_status = 'approved'
        and old.identity_approval_status is distinct from 'approved'
    then
        new.public_available_at = coalesce(new.public_available_at, now());
        if new.official_token_detected_at is not null then
            new.publication_sla_seconds = greatest(
                0,
                floor(extract(epoch from (new.public_available_at - new.official_token_detected_at)))::integer
            );
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists market_candidate_publication_sla_trigger on public.market_candidates;
create trigger market_candidate_publication_sla_trigger
before update on public.market_candidates
for each row execute function public.capture_market_candidate_publication_sla();

create or replace function public.reject_market_candidate_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    raise exception 'market candidate audit records are append-only';
end;
$$;

drop trigger if exists market_candidate_identity_observations_immutable on public.market_candidate_identity_observations;
create trigger market_candidate_identity_observations_immutable
before update or delete on public.market_candidate_identity_observations
for each row execute function public.reject_market_candidate_audit_mutation();

drop trigger if exists market_candidate_identity_approvals_immutable on public.market_candidate_identity_approvals;
create trigger market_candidate_identity_approvals_immutable
before update or delete on public.market_candidate_identity_approvals
for each row execute function public.reject_market_candidate_audit_mutation();

drop trigger if exists market_candidate_lifecycle_events_immutable on public.market_candidate_lifecycle_events;
create trigger market_candidate_lifecycle_events_immutable
before update or delete on public.market_candidate_lifecycle_events
for each row execute function public.reject_market_candidate_audit_mutation();

drop trigger if exists market_candidate_liquidity_observations_immutable on public.market_candidate_liquidity_observations;
create trigger market_candidate_liquidity_observations_immutable
before update or delete on public.market_candidate_liquidity_observations
for each row execute function public.reject_market_candidate_audit_mutation();

drop trigger if exists market_candidate_oracle_observations_immutable on public.market_candidate_oracle_observations;
create trigger market_candidate_oracle_observations_immutable
before update or delete on public.market_candidate_oracle_observations
for each row execute function public.reject_market_candidate_audit_mutation();

drop trigger if exists market_candidate_options_risk_observations_immutable on public.market_candidate_options_risk_observations;
create trigger market_candidate_options_risk_observations_immutable
before update or delete on public.market_candidate_options_risk_observations
for each row execute function public.reject_market_candidate_audit_mutation();

drop trigger if exists market_candidate_product_control_events_immutable on public.market_candidate_product_control_events;
create trigger market_candidate_product_control_events_immutable
before update or delete on public.market_candidate_product_control_events
for each row execute function public.reject_market_candidate_audit_mutation();

commit;
