begin;

alter table public.market_candidates
    add column if not exists spot_paused boolean not null default false,
    add column if not exists options_paused boolean not null default false,
    add column if not exists product_pause_reason text,
    add column if not exists product_control_updated_at timestamptz;

create table if not exists public.market_candidate_product_control_events (
    id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    product text not null check (product in ('spot','options')),
    paused boolean not null,
    reason text not null check (length(trim(reason)) between 3 and 500),
    operator_reference text not null check (length(trim(operator_reference)) between 3 and 200),
    changed_at timestamptz not null default now(),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates (environment, chain_id, candidate_id)
        on delete cascade
);

create index if not exists market_candidate_product_control_events_lookup_idx
    on public.market_candidate_product_control_events
    (environment, chain_id, candidate_id, changed_at desc);

create or replace function public.set_market_candidate_product_pause(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_candidate_id text,
    p_product text,
    p_paused boolean,
    p_reason text,
    p_operator_reference text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_product not in ('spot','options')
        or length(trim(p_reason)) not between 3 and 500
        or length(trim(p_operator_reference)) not between 3 and 200
    then
        raise exception 'invalid candidate product control';
    end if;

    update public.market_candidates
    set spot_paused = case when p_product = 'spot' then p_paused else spot_paused end,
        options_paused = case when p_product = 'options' then p_paused else options_paused end,
        product_pause_reason = case when p_paused then trim(p_reason) else null end,
        product_control_updated_at = now(),
        updated_at = now()
    where environment = p_environment
      and chain_id = p_chain_id
      and candidate_id = p_candidate_id;

    if not found then raise exception 'market candidate not found'; end if;

    insert into public.market_candidate_product_control_events (
        environment, chain_id, candidate_id, product, paused, reason, operator_reference
    ) values (
        p_environment, p_chain_id, p_candidate_id, p_product, p_paused,
        trim(p_reason), trim(p_operator_reference)
    );
end;
$$;

alter table public.market_candidate_product_control_events enable row level security;
revoke all on public.market_candidate_product_control_events from anon, authenticated;
revoke all on function public.set_market_candidate_product_pause(
    public.network_environment,bigint,text,text,boolean,text,text
) from public, anon, authenticated;
grant execute on function public.set_market_candidate_product_pause(
    public.network_environment,bigint,text,text,boolean,text,text
) to service_role;

commit;
