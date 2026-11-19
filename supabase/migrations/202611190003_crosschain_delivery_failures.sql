begin;

create table public.crosschain_delivery_failures (
    environment public.network_environment not null,
    source_eid bigint not null check (source_eid > 0),
    destination_chain_id bigint not null check (destination_chain_id > 0),
    guid text not null check (guid ~ '^0x[0-9a-fA-F]{64}$'),
    receiver_address text not null check (receiver_address ~ '^0x[0-9a-fA-F]{40}$'),
    executor_address text not null check (executor_address ~ '^0x[0-9a-fA-F]{40}$'),
    reason_hash text not null check (reason_hash ~ '^0x[0-9a-fA-F]{64}$'),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, source_eid, guid)
);

create index crosschain_delivery_failures_active_idx
    on public.crosschain_delivery_failures (environment, destination_chain_id, observed_at desc)
    where canonical;

alter table public.crosschain_delivery_failures enable row level security;
revoke all on public.crosschain_delivery_failures from anon, authenticated;

create or replace function public.project_crosschain_delivery_failure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.event_name <> 'LzReceiveAlert' then
        return new;
    end if;

    if not exists (
        select 1 from public.crosschain_networks network
        where network.environment = new.environment
          and network.chain_id = new.chain_id
          and network.active
    ) then
        raise exception 'CROSSCHAIN_DESTINATION_NETWORK_NOT_CONFIGURED';
    end if;

    insert into public.crosschain_delivery_failures (
        environment, source_eid, destination_chain_id, guid, receiver_address,
        executor_address, reason_hash, transaction_hash, block_number, block_hash,
        canonical, observed_at
    ) values (
        new.environment, (new.payload->>'srcEid')::bigint, new.chain_id,
        lower(new.payload->>'guid'), lower(new.payload->>'receiverAddress'),
        lower(new.payload->>'executorAddress'), lower(new.payload->>'reasonHash'),
        lower(new.transaction_hash), new.block_number, lower(new.block_hash),
        new.canonical, new.block_timestamp
    )
    on conflict (environment, source_eid, guid) do update set
        destination_chain_id = excluded.destination_chain_id,
        receiver_address = excluded.receiver_address,
        executor_address = excluded.executor_address,
        reason_hash = excluded.reason_hash,
        transaction_hash = excluded.transaction_hash,
        block_number = excluded.block_number,
        block_hash = excluded.block_hash,
        canonical = excluded.canonical,
        observed_at = excluded.observed_at;

    if new.canonical then
        update public.crosschain_messages message set
            state = 'retryable',
            updated_at = greatest(message.updated_at, new.block_timestamp)
        where message.environment = new.environment
          and message.source_eid = (new.payload->>'srcEid')::bigint
          and message.guid = lower(new.payload->>'guid')
          and message.state in ('pending', 'retryable')
          and message.destination_transaction_hash is null;
    else
        update public.crosschain_messages message set
            state = 'pending',
            updated_at = greatest(message.sent_at, new.block_timestamp)
        where message.environment = new.environment
          and message.source_eid = (new.payload->>'srcEid')::bigint
          and message.guid = lower(new.payload->>'guid')
          and message.state = 'retryable'
          and message.destination_transaction_hash is null;
    end if;

    return new;
end;
$$;

create trigger project_crosschain_delivery_failure_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_crosschain_delivery_failure();

revoke execute on function public.project_crosschain_delivery_failure() from public;

create or replace function public.apply_crosschain_delivery_failure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.state = 'pending' and exists (
        select 1 from public.crosschain_delivery_failures failure
        where failure.environment = new.environment
          and failure.source_eid = new.source_eid
          and failure.guid = new.guid
          and failure.canonical
    ) then
        new.state := 'retryable';
    end if;
    return new;
end;
$$;

create trigger apply_crosschain_delivery_failure_before_write
before insert or update of state, canonical on public.crosschain_messages
for each row execute function public.apply_crosschain_delivery_failure();

revoke execute on function public.apply_crosschain_delivery_failure() from public;

commit;
