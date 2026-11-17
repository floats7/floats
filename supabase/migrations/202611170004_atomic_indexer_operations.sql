begin;

create or replace function public.commit_indexer_batch(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_consumer text,
    p_from_block bigint,
    p_to_block bigint,
    p_finalized_hash text,
    p_events jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    expected_next_block bigint;
begin
    if p_from_block < 0 or p_to_block < p_from_block then
        raise exception 'INVALID_BLOCK_RANGE';
    end if;
    if p_finalized_hash !~ '^0x[0-9a-fA-F]{64}$' then
        raise exception 'INVALID_FINALIZED_HASH';
    end if;

    select next_block into expected_next_block
    from public.chain_checkpoints
    where environment = p_environment and chain_id = p_chain_id and consumer = p_consumer
    for update;

    if expected_next_block is not null and expected_next_block <> p_from_block then
        raise exception 'CHECKPOINT_CONFLICT';
    end if;

    insert into public.protocol_events (
        environment, chain_id, block_number, block_hash, transaction_hash,
        transaction_index, log_index, contract_address, event_name, payload,
        block_timestamp, canonical
    )
    select
        p_environment, p_chain_id, event.block_number, event.block_hash,
        event.transaction_hash, event.transaction_index, event.log_index,
        event.contract_address, event.event_name, event.payload,
        event.block_timestamp, true
    from jsonb_to_recordset(p_events) as event(
        block_number bigint,
        block_hash text,
        transaction_hash text,
        transaction_index integer,
        log_index integer,
        contract_address text,
        event_name text,
        payload jsonb,
        block_timestamp timestamptz
    )
    on conflict (environment, chain_id, transaction_hash, log_index)
    do update set
        block_number = excluded.block_number,
        block_hash = excluded.block_hash,
        transaction_index = excluded.transaction_index,
        contract_address = excluded.contract_address,
        event_name = excluded.event_name,
        payload = excluded.payload,
        block_timestamp = excluded.block_timestamp,
        canonical = true;

    insert into public.chain_checkpoints (
        environment, chain_id, consumer, next_block,
        last_finalized_block, last_finalized_hash, updated_at
    ) values (
        p_environment, p_chain_id, p_consumer, p_to_block + 1,
        p_to_block, p_finalized_hash, now()
    )
    on conflict (environment, chain_id, consumer) do update set
        next_block = excluded.next_block,
        last_finalized_block = excluded.last_finalized_block,
        last_finalized_hash = excluded.last_finalized_hash,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.rewind_indexer(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_consumer text,
    p_replay_from_block bigint
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_replay_from_block < 0 then raise exception 'INVALID_REPLAY_BLOCK'; end if;

    update public.protocol_events
    set canonical = false
    where environment = p_environment
      and chain_id = p_chain_id
      and block_number >= p_replay_from_block
      and canonical;

    insert into public.chain_checkpoints (
        environment, chain_id, consumer, next_block,
        last_finalized_block, last_finalized_hash, updated_at
    ) values (
        p_environment, p_chain_id, p_consumer, p_replay_from_block,
        null, null, now()
    )
    on conflict (environment, chain_id, consumer) do update set
        next_block = excluded.next_block,
        last_finalized_block = null,
        last_finalized_hash = null,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.report_ingestion_health(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_consumer text,
    p_status public.ingestion_status,
    p_latest_seen_block bigint default null,
    p_lag_blocks bigint default null,
    p_last_error text default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
    insert into public.ingestion_health (
        environment, chain_id, consumer, status, latest_seen_block,
        lag_blocks, last_error, checked_at
    ) values (
        p_environment, p_chain_id, p_consumer, p_status, p_latest_seen_block,
        p_lag_blocks, p_last_error, now()
    )
    on conflict (environment, chain_id, consumer) do update set
        status = excluded.status,
        latest_seen_block = excluded.latest_seen_block,
        lag_blocks = excluded.lag_blocks,
        last_error = excluded.last_error,
        checked_at = excluded.checked_at;
$$;

revoke all on function public.commit_indexer_batch(public.network_environment, bigint, text, bigint, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.rewind_indexer(public.network_environment, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.report_ingestion_health(public.network_environment, bigint, text, public.ingestion_status, bigint, bigint, text) from public, anon, authenticated;

grant execute on function public.commit_indexer_batch(public.network_environment, bigint, text, bigint, bigint, text, jsonb) to service_role;
grant execute on function public.rewind_indexer(public.network_environment, bigint, text, bigint) to service_role;
grant execute on function public.report_ingestion_health(public.network_environment, bigint, text, public.ingestion_status, bigint, bigint, text) to service_role;

commit;
