begin;

create or replace function public.approve_market_candidate_public_filing(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_candidate_id text,
    p_accession_number text,
    p_reviewed_by text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    filing public.market_candidate_filing_observations%rowtype;
    changed boolean := false;
begin
    if p_chain_id <= 0
       or p_candidate_id !~ '^[a-z0-9-]{1,80}$'
       or p_accession_number !~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'
       or length(trim(p_reviewed_by)) < 2
    then
        raise exception 'invalid public filing approval';
    end if;

    select * into filing
    from public.market_candidate_filing_observations
    where environment = p_environment
      and chain_id = p_chain_id
      and candidate_id = p_candidate_id
      and accession_number = p_accession_number
    for update;

    if not found then
        raise exception 'public filing evidence not found';
    end if;

    if filing.reviewed_at is null then
        update public.market_candidate_filing_observations
        set reviewed_at = now(), reviewed_by = trim(p_reviewed_by)
        where environment = p_environment
          and chain_id = p_chain_id
          and candidate_id = p_candidate_id
          and accession_number = p_accession_number;
    elsif filing.reviewed_by <> trim(p_reviewed_by) then
        raise exception 'public filing was reviewed by another operator';
    end if;

    update public.market_candidates
    set ipo_stage = 'public_s1',
        stage_source_url = filing.source_url,
        stage_updated_at = now(),
        disabled_reason = 'Public registration statement filed. Ticker, exchange, pricing and listing date remain pending.',
        updated_at = now()
    where environment = p_environment
      and chain_id = p_chain_id
      and candidate_id = p_candidate_id
      and ipo_stage = 'confidential_filed';

    changed := found;

    if not changed and not exists (
        select 1 from public.market_candidates
        where environment = p_environment
          and chain_id = p_chain_id
          and candidate_id = p_candidate_id
          and ipo_stage = 'public_s1'
          and stage_source_url = filing.source_url
    ) then
        raise exception 'candidate is not eligible for public filing promotion';
    end if;

    return changed;
end;
$$;

revoke all on function public.approve_market_candidate_public_filing(
    public.network_environment,bigint,text,text,text
) from public, anon, authenticated;
grant execute on function public.approve_market_candidate_public_filing(
    public.network_environment,bigint,text,text,text
) to service_role;

commit;
