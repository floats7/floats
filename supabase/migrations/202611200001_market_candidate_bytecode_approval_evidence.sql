begin;

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
        count(*) filter (where source_kind in ('interface','bytecode','deployer','chainlink_feed'))
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

revoke all on function public.approve_market_candidate_identity(
    public.network_environment,bigint,text,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.approve_market_candidate_identity(
    public.network_environment,bigint,text,text,text,text,text,timestamptz
) to service_role;

commit;
