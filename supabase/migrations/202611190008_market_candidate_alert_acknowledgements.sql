begin;

create table if not exists public.market_candidate_alerts (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    alert_code text not null,
    severity text not null check (severity in ('warning','critical')),
    fingerprint text not null check (fingerprint ~ '^0x[0-9a-f]{64}$'),
    payload jsonb not null,
    state text not null default 'open' check (state in ('open','acknowledged')),
    detected_at timestamptz not null,
    acknowledged_at timestamptz,
    acknowledged_by text,
    acknowledgement_note text,
    unique (environment, chain_id, fingerprint),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates (environment, chain_id, candidate_id)
        on delete cascade
);

create or replace function public.acknowledge_market_candidate_alert(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_alert_id bigint,
    p_acknowledged_by text,
    p_note text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if length(trim(p_acknowledged_by)) not between 3 and 100
        or length(trim(p_note)) not between 3 and 500
    then raise exception 'invalid alert acknowledgement'; end if;

    update public.market_candidate_alerts
    set state = 'acknowledged', acknowledged_at = now(),
        acknowledged_by = trim(p_acknowledged_by), acknowledgement_note = trim(p_note)
    where id = p_alert_id and environment = p_environment and chain_id = p_chain_id
      and state = 'open';
    if not found then raise exception 'open alert not found'; end if;
end;
$$;

alter table public.market_candidate_alerts enable row level security;
revoke all on public.market_candidate_alerts from anon, authenticated;
revoke all on function public.acknowledge_market_candidate_alert(
    public.network_environment,bigint,bigint,text,text
) from public, anon, authenticated;
grant execute on function public.acknowledge_market_candidate_alert(
    public.network_environment,bigint,bigint,text,text
) to service_role;

commit;
