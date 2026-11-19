begin;

alter table public.market_candidates
    drop constraint market_candidates_lifecycle_status_check;

alter table public.market_candidates
    add constraint market_candidates_lifecycle_status_check check (lifecycle_status in (
        'upcoming','listing_expected','listed','token_pending','detected',
        'verification_pending','approval_pending','rejected','suspected_fake',
        'token_live','oracle_pending','liquidity_pending','governance_pending',
        'active','suspended','removed'
    )),
    add column detected_token_address text
        check (detected_token_address is null or detected_token_address ~ '^0x[0-9a-fA-F]{40}$'),
    add column identity_approval_status text not null default 'unreviewed'
        check (identity_approval_status in ('unreviewed','pending','approved','rejected','legacy_approved')),
    add column identity_approved_at timestamptz,
    add column identity_approval_reference text,
    add column official_token_name text,
    add column token_decimals smallint check (token_decimals is null or token_decimals between 0 and 36),
    add column current_multiplier text check (
        current_multiplier is null or current_multiplier ~ '^[0-9]+(\.[0-9]+)?$'
    ),
    add column pending_multiplier text check (
        pending_multiplier is null or pending_multiplier ~ '^[0-9]+(\.[0-9]+)?$'
    ),
    add column trading_capabilities jsonb check (
        trading_capabilities is null or jsonb_typeof(trading_capabilities) = 'object'
    ),
    add column official_metadata_observed_at timestamptz;

alter table public.market_candidates
    add column trading_halted boolean,
    add column official_quote_generated_at timestamptz;

update public.market_candidates
set identity_approval_status = 'legacy_approved',
    identity_approved_at = coalesce(last_checked_at, updated_at),
    identity_approval_reference = 'pre-identity-gate migration',
    detected_token_address = token_address
where token_live or token_address is not null;

alter table public.market_candidates
    add constraint market_candidates_identity_approval_consistent check (
        (identity_approval_status in ('approved','legacy_approved'))
        or (not token_live and lifecycle_status not in (
            'token_live','oracle_pending','liquidity_pending','governance_pending','active'
        ))
    ),
    add constraint market_candidates_approved_identity_has_token check (
        identity_approval_status not in ('approved','legacy_approved')
        or token_address is not null
    ),
    add constraint market_candidates_detected_address_matches_approved check (
        identity_approval_status not in ('approved','legacy_approved')
        or detected_token_address = token_address
    );

create table public.market_candidate_identity_observations (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
    source_kind text not null check (source_kind in (
        'robinhood_asset_registry','robinhood_contract_registry','onchain_registry',
        'bytecode','deployer','interface','chainlink_feed','operator_review'
    )),
    source_url text check (source_url is null or source_url ~ '^https://'),
    passed boolean not null,
    evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
    evidence_hash text not null check (evidence_hash ~ '^0x[0-9a-f]{64}$'),
    observed_at timestamptz not null,
    recorded_at timestamptz not null default now(),
    primary key (environment, chain_id, candidate_id, token_address, source_kind, evidence_hash),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates(environment, chain_id, candidate_id)
        on delete cascade
);

create index market_candidate_identity_observations_lookup_idx
    on public.market_candidate_identity_observations (
        environment, chain_id, candidate_id, token_address, passed, observed_at desc
    );

create table public.market_candidate_lifecycle_events (
    event_id bigint generated always as identity primary key,
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    previous_status text,
    next_status text not null,
    previous_identity_approval_status text,
    next_identity_approval_status text not null,
    detected_token_address text,
    reason text,
    occurred_at timestamptz not null default now(),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates(environment, chain_id, candidate_id)
        on delete cascade
);

create index market_candidate_lifecycle_events_lookup_idx
    on public.market_candidate_lifecycle_events (
        environment, chain_id, candidate_id, occurred_at desc, event_id desc
    );

create or replace function public.record_market_candidate_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if old.lifecycle_status is distinct from new.lifecycle_status
       or old.identity_approval_status is distinct from new.identity_approval_status
       or old.detected_token_address is distinct from new.detected_token_address
    then
        insert into public.market_candidate_lifecycle_events (
            environment, chain_id, candidate_id, previous_status, next_status,
            previous_identity_approval_status, next_identity_approval_status,
            detected_token_address, reason, occurred_at
        ) values (
            new.environment, new.chain_id, new.candidate_id, old.lifecycle_status,
            new.lifecycle_status, old.identity_approval_status, new.identity_approval_status,
            new.detected_token_address, new.disabled_reason, now()
        );
    end if;
    return new;
end;
$$;

create trigger market_candidate_lifecycle_audit
after update on public.market_candidates
for each row execute function public.record_market_candidate_lifecycle_event();

create table public.market_candidate_identity_approvals (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    candidate_id text not null,
    token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
    multisig_address text not null check (multisig_address ~ '^0x[0-9a-fA-F]{40}$'),
    approval_transaction_hash text not null unique
        check (approval_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    approved_by text not null,
    approved_at timestamptz not null,
    recorded_at timestamptz not null default now(),
    primary key (environment, chain_id, candidate_id, token_address),
    foreign key (environment, chain_id, candidate_id)
        references public.market_candidates(environment, chain_id, candidate_id)
        on delete cascade
);

create or replace function public.approve_market_candidate_identity(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_candidate_id text,
    p_token_address text,
    p_multisig_address text,
    p_approval_transaction_hash text,
    p_approved_by text,
    p_approved_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_primary_sources integer;
    v_onchain_signals integer;
begin
    if p_token_address !~ '^0x[0-9a-fA-F]{40}$'
        or p_multisig_address !~ '^0x[0-9a-fA-F]{40}$'
        or p_approval_transaction_hash !~ '^0x[0-9a-fA-F]{64}$'
        or length(trim(p_approved_by)) = 0
        or p_approved_at > now() + interval '5 minutes'
    then
        raise exception 'invalid market candidate approval';
    end if;

    select
        count(*) filter (where source_kind in ('robinhood_asset_registry','robinhood_contract_registry')),
        count(*) filter (where source_kind in ('deployer','interface','chainlink_feed'))
    into v_primary_sources, v_onchain_signals
    from (
        select distinct source_kind
        from public.market_candidate_identity_observations
        where environment = p_environment
          and chain_id = p_chain_id
          and candidate_id = p_candidate_id
          and lower(token_address) = lower(p_token_address)
          and passed
    ) evidence;

    if v_primary_sources < 1 or v_onchain_signals < 2 then
        raise exception 'insufficient canonical identity evidence';
    end if;

    insert into public.market_candidate_identity_approvals (
        environment, chain_id, candidate_id, token_address, multisig_address,
        approval_transaction_hash, approved_by, approved_at
    ) values (
        p_environment, p_chain_id, p_candidate_id, lower(p_token_address),
        lower(p_multisig_address), lower(p_approval_transaction_hash), p_approved_by, p_approved_at
    );

    update public.market_candidates
    set token_address = lower(p_token_address),
        detected_token_address = lower(p_token_address),
        token_live = true,
        identity_approval_status = 'approved',
        identity_approved_at = p_approved_at,
        identity_approval_reference = lower(p_approval_transaction_hash),
        lifecycle_status = 'oracle_pending',
        disabled_reason = 'Oracle verification pending',
        updated_at = now()
    where environment = p_environment
      and chain_id = p_chain_id
      and candidate_id = p_candidate_id
      and lower(detected_token_address) = lower(p_token_address)
      and identity_approval_status in ('unreviewed','pending');

    if not found then
        raise exception 'candidate identity is not approval-ready';
    end if;
end;
$$;

alter table public.market_candidate_identity_observations enable row level security;
alter table public.market_candidate_identity_approvals enable row level security;
alter table public.market_candidate_lifecycle_events enable row level security;

revoke all on public.market_candidate_identity_observations from anon, authenticated;
revoke all on public.market_candidate_identity_approvals from anon, authenticated;
revoke all on public.market_candidate_lifecycle_events from anon, authenticated;
revoke all on function public.approve_market_candidate_identity(
    public.network_environment,bigint,text,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.approve_market_candidate_identity(
    public.network_environment,bigint,text,text,text,text,text,timestamptz
) to service_role;

commit;
