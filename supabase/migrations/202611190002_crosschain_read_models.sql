begin;

create table public.crosschain_networks (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    eid bigint not null check (eid > 0),
    network_name text not null check (network_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$'),
    explorer_url text not null check (explorer_url ~ '^https://'),
    active boolean not null default false,
    primary key (environment, chain_id),
    unique (environment, eid)
);

create table public.crosschain_messages (
    environment public.network_environment not null,
    source_chain_id bigint not null check (source_chain_id > 0),
    destination_chain_id bigint not null check (destination_chain_id > 0),
    source_eid bigint not null check (source_eid > 0),
    destination_eid bigint not null check (destination_eid > 0),
    guid text not null check (guid ~ '^0x[0-9a-fA-F]{64}$'),
    sender_address text not null check (sender_address ~ '^0x[0-9a-fA-F]{40}$'),
    recipient_address text not null check (recipient_address ~ '^0x[0-9a-fA-F]{40}$'),
    token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
    amount_local numeric(78, 0) not null check (amount_local > 0),
    native_fee numeric(78, 0) not null check (native_fee >= 0),
    state text not null check (state in ('pending', 'delivered', 'retryable', 'failed')),
    source_transaction_hash text not null
        check (source_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    destination_transaction_hash text
        check (destination_transaction_hash is null or destination_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    source_block_number bigint not null check (source_block_number >= 0),
    source_block_hash text not null check (source_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    destination_block_number bigint check (destination_block_number is null or destination_block_number >= 0),
    destination_block_hash text
        check (destination_block_hash is null or destination_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    canonical boolean not null default true,
    sent_at timestamptz not null,
    updated_at timestamptz not null,
    primary key (environment, source_eid, guid),
    check (source_chain_id <> destination_chain_id),
    check (source_eid <> destination_eid),
    check (updated_at >= sent_at),
    check (
        (state = 'delivered' and destination_transaction_hash is not null
            and destination_block_number is not null and destination_block_hash is not null)
        or state <> 'delivered'
    )
);

create table public.crosschain_receipts (
    environment public.network_environment not null,
    source_eid bigint not null check (source_eid > 0),
    destination_chain_id bigint not null check (destination_chain_id > 0),
    guid text not null check (guid ~ '^0x[0-9a-fA-F]{64}$'),
    recipient_address text not null check (recipient_address ~ '^0x[0-9a-fA-F]{40}$'),
    amount_received_local numeric(78, 0) not null check (amount_received_local > 0),
    destination_transaction_hash text not null
        check (destination_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    destination_block_number bigint not null check (destination_block_number >= 0),
    destination_block_hash text not null check (destination_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, source_eid, guid)
);

create table public.crosschain_nav_messages (
    environment public.network_environment not null,
    source_chain_id bigint not null check (source_chain_id > 0),
    destination_chain_id bigint not null check (destination_chain_id > 0),
    source_eid bigint not null check (source_eid > 0),
    destination_eid bigint not null check (destination_eid > 0),
    guid text not null check (guid ~ '^0x[0-9a-fA-F]{64}$'),
    sequence numeric(20, 0) not null check (sequence > 0),
    nav_18 numeric(78, 0) not null check (nav_18 > 0),
    canonical_total_supply_18 numeric(78, 0) not null check (canonical_total_supply_18 > 0),
    state text not null check (state in ('published', 'mirrored')),
    source_transaction_hash text not null
        check (source_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    destination_transaction_hash text
        check (destination_transaction_hash is null or destination_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    source_block_number bigint not null check (source_block_number >= 0),
    source_block_hash text not null check (source_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    destination_block_number bigint check (destination_block_number is null or destination_block_number >= 0),
    destination_block_hash text
        check (destination_block_hash is null or destination_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    source_canonical boolean not null default true,
    destination_canonical boolean not null default false,
    observed_at timestamptz not null,
    published_at timestamptz not null,
    mirrored_at timestamptz,
    updated_at timestamptz not null,
    primary key (environment, source_eid, guid),
    unique (environment, source_eid, sequence),
    check (source_chain_id <> destination_chain_id),
    check (source_eid <> destination_eid),
    check (
        (state = 'mirrored' and destination_transaction_hash is not null
            and destination_block_number is not null and destination_block_hash is not null
            and mirrored_at is not null and destination_canonical)
        or state = 'published'
    )
);

create table public.crosschain_nav_receipts (
    environment public.network_environment not null,
    source_eid bigint not null check (source_eid > 0),
    destination_chain_id bigint not null check (destination_chain_id > 0),
    guid text not null check (guid ~ '^0x[0-9a-fA-F]{64}$'),
    sequence numeric(20, 0) not null check (sequence > 0),
    nav_18 numeric(78, 0) not null check (nav_18 > 0),
    canonical_total_supply_18 numeric(78, 0) not null check (canonical_total_supply_18 > 0),
    destination_transaction_hash text not null
        check (destination_transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    destination_block_number bigint not null check (destination_block_number >= 0),
    destination_block_hash text not null check (destination_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    canonical boolean not null default true,
    observed_at timestamptz not null,
    mirrored_at timestamptz not null,
    primary key (environment, source_eid, guid)
);

create index crosschain_messages_history_idx
    on public.crosschain_messages (environment, sent_at desc, source_eid, guid)
    where canonical;
create index crosschain_messages_sender_idx
    on public.crosschain_messages (environment, sender_address, sent_at desc)
    where canonical;
create index crosschain_messages_recipient_idx
    on public.crosschain_messages (environment, recipient_address, sent_at desc)
    where canonical;
create index crosschain_messages_pending_idx
    on public.crosschain_messages (environment, state, sent_at)
    where canonical and state in ('pending', 'retryable', 'failed');
create index crosschain_receipts_destination_idx
    on public.crosschain_receipts (environment, destination_chain_id, destination_block_number desc)
    where canonical;
create index crosschain_nav_messages_latest_idx
    on public.crosschain_nav_messages (
        environment, destination_chain_id, sequence desc, published_at desc
    )
    where source_canonical;
create index crosschain_nav_messages_pending_idx
    on public.crosschain_nav_messages (environment, state, published_at)
    where source_canonical and state = 'published';
create index crosschain_nav_receipts_destination_idx
    on public.crosschain_nav_receipts (
        environment, destination_chain_id, destination_block_number desc
    )
    where canonical;

alter table public.crosschain_networks enable row level security;
alter table public.crosschain_messages enable row level security;
alter table public.crosschain_receipts enable row level security;
alter table public.crosschain_nav_messages enable row level security;
alter table public.crosschain_nav_receipts enable row level security;
revoke all on public.crosschain_networks, public.crosschain_messages, public.crosschain_receipts,
    public.crosschain_nav_messages, public.crosschain_nav_receipts
    from anon, authenticated;

create or replace function public.project_crosschain_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    local_eid bigint;
    remote_chain_id bigint;
    receipt public.crosschain_receipts%rowtype;
begin
    if new.event_name not in ('OFTSent', 'OFTReceived') then
        return new;
    end if;

    select network.eid into local_eid
    from public.crosschain_networks network
    where network.environment = new.environment
      and network.chain_id = new.chain_id
      and network.active;
    if local_eid is null then
        raise exception 'CROSSCHAIN_LOCAL_NETWORK_NOT_CONFIGURED';
    end if;

    if new.event_name = 'OFTSent' then
        select network.chain_id into remote_chain_id
        from public.crosschain_networks network
        where network.environment = new.environment
          and network.eid = (new.payload->>'dstEid')::bigint
          and network.active;
        if remote_chain_id is null then
            raise exception 'CROSSCHAIN_DESTINATION_NETWORK_NOT_CONFIGURED';
        end if;

        select * into receipt
        from public.crosschain_receipts stored
        where stored.environment = new.environment
          and stored.source_eid = local_eid
          and stored.guid = lower(new.payload->>'guid')
          and stored.canonical;

        insert into public.crosschain_messages (
            environment, source_chain_id, destination_chain_id, source_eid, destination_eid,
            guid, sender_address, recipient_address, token_address, amount_local, native_fee,
            state, source_transaction_hash, destination_transaction_hash, source_block_number,
            source_block_hash, destination_block_number, destination_block_hash, canonical,
            sent_at, updated_at
        ) values (
            new.environment, new.chain_id, remote_chain_id, local_eid,
            (new.payload->>'dstEid')::bigint, lower(new.payload->>'guid'),
            lower(new.payload->>'fromAddress'), lower(new.payload->>'toAddress'),
            lower(new.contract_address), (new.payload->>'amountReceivedLD')::numeric,
            (new.payload->>'nativeFee')::numeric,
            case when receipt.guid is null then 'pending' else 'delivered' end,
            lower(new.transaction_hash), receipt.destination_transaction_hash,
            new.block_number, lower(new.block_hash), receipt.destination_block_number,
            receipt.destination_block_hash, new.canonical, new.block_timestamp,
            coalesce(receipt.observed_at, new.block_timestamp)
        )
        on conflict (environment, source_eid, guid) do update set
            destination_chain_id = excluded.destination_chain_id,
            destination_eid = excluded.destination_eid,
            sender_address = excluded.sender_address,
            recipient_address = excluded.recipient_address,
            token_address = excluded.token_address,
            amount_local = excluded.amount_local,
            native_fee = excluded.native_fee,
            state = excluded.state,
            source_transaction_hash = excluded.source_transaction_hash,
            destination_transaction_hash = excluded.destination_transaction_hash,
            source_block_number = excluded.source_block_number,
            source_block_hash = excluded.source_block_hash,
            destination_block_number = excluded.destination_block_number,
            destination_block_hash = excluded.destination_block_hash,
            canonical = excluded.canonical,
            sent_at = excluded.sent_at,
            updated_at = excluded.updated_at;
    else
        select network.chain_id into remote_chain_id
        from public.crosschain_networks network
        where network.environment = new.environment
          and network.eid = (new.payload->>'srcEid')::bigint
          and network.active;
        if remote_chain_id is null then
            raise exception 'CROSSCHAIN_SOURCE_NETWORK_NOT_CONFIGURED';
        end if;

        insert into public.crosschain_receipts (
            environment, source_eid, destination_chain_id, guid, recipient_address,
            amount_received_local, destination_transaction_hash, destination_block_number,
            destination_block_hash, canonical, observed_at
        ) values (
            new.environment, (new.payload->>'srcEid')::bigint, new.chain_id,
            lower(new.payload->>'guid'), lower(new.payload->>'toAddress'),
            (new.payload->>'amountReceivedLD')::numeric, lower(new.transaction_hash),
            new.block_number, lower(new.block_hash), new.canonical, new.block_timestamp
        )
        on conflict (environment, source_eid, guid) do update set
            destination_chain_id = excluded.destination_chain_id,
            recipient_address = excluded.recipient_address,
            amount_received_local = excluded.amount_received_local,
            destination_transaction_hash = excluded.destination_transaction_hash,
            destination_block_number = excluded.destination_block_number,
            destination_block_hash = excluded.destination_block_hash,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;

        update public.crosschain_messages message set
            state = case when new.canonical then 'delivered' else 'pending' end,
            destination_transaction_hash = case when new.canonical then lower(new.transaction_hash) else null end,
            destination_block_number = case when new.canonical then new.block_number else null end,
            destination_block_hash = case when new.canonical then lower(new.block_hash) else null end,
            updated_at = new.block_timestamp
        where message.environment = new.environment
          and message.source_eid = (new.payload->>'srcEid')::bigint
          and message.guid = lower(new.payload->>'guid')
          and message.recipient_address = lower(new.payload->>'toAddress')
          and message.amount_local = (new.payload->>'amountReceivedLD')::numeric;
    end if;

    return new;
end;
$$;

create trigger project_crosschain_event_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_crosschain_event();

create or replace function public.project_crosschain_nav_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    local_eid bigint;
    remote_chain_id bigint;
    receipt public.crosschain_nav_receipts%rowtype;
    existing_message public.crosschain_nav_messages%rowtype;
begin
    if new.event_name not in ('NavPublished', 'NavMirrored') then
        return new;
    end if;

    select network.eid into local_eid
    from public.crosschain_networks network
    where network.environment = new.environment
      and network.chain_id = new.chain_id
      and network.active;
    if local_eid is null then
        raise exception 'CROSSCHAIN_LOCAL_NETWORK_NOT_CONFIGURED';
    end if;

    if new.event_name = 'NavPublished' then
        select network.chain_id into remote_chain_id
        from public.crosschain_networks network
        where network.environment = new.environment
          and network.eid = (new.payload->>'dstEid')::bigint
          and network.active;
        if remote_chain_id is null then
            raise exception 'CROSSCHAIN_DESTINATION_NETWORK_NOT_CONFIGURED';
        end if;

        select * into receipt
        from public.crosschain_nav_receipts stored
        where stored.environment = new.environment
          and stored.source_eid = local_eid
          and stored.guid = lower(new.payload->>'guid')
          and stored.sequence = (new.payload->>'sequence')::numeric
          and stored.nav_18 = (new.payload->>'nav18')::numeric
          and stored.canonical_total_supply_18 = (new.payload->>'canonicalTotalSupply')::numeric
          and stored.canonical;

        insert into public.crosschain_nav_messages (
            environment, source_chain_id, destination_chain_id, source_eid, destination_eid,
            guid, sequence, nav_18, canonical_total_supply_18, state,
            source_transaction_hash, destination_transaction_hash, source_block_number,
            source_block_hash, destination_block_number, destination_block_hash,
            source_canonical, destination_canonical, observed_at, published_at, mirrored_at,
            updated_at
        ) values (
            new.environment, new.chain_id, remote_chain_id, local_eid,
            (new.payload->>'dstEid')::bigint, lower(new.payload->>'guid'),
            (new.payload->>'sequence')::numeric, (new.payload->>'nav18')::numeric,
            (new.payload->>'canonicalTotalSupply')::numeric,
            case when receipt.guid is null then 'published' else 'mirrored' end,
            lower(new.transaction_hash), receipt.destination_transaction_hash,
            new.block_number, lower(new.block_hash), receipt.destination_block_number,
            receipt.destination_block_hash, new.canonical, coalesce(receipt.canonical, false),
            to_timestamp((new.payload->>'observedAt')::double precision),
            new.block_timestamp, receipt.mirrored_at,
            coalesce(receipt.mirrored_at, new.block_timestamp)
        )
        on conflict (environment, source_eid, guid) do update set
            destination_chain_id = excluded.destination_chain_id,
            destination_eid = excluded.destination_eid,
            sequence = excluded.sequence,
            nav_18 = excluded.nav_18,
            canonical_total_supply_18 = excluded.canonical_total_supply_18,
            state = excluded.state,
            source_transaction_hash = excluded.source_transaction_hash,
            destination_transaction_hash = excluded.destination_transaction_hash,
            source_block_number = excluded.source_block_number,
            source_block_hash = excluded.source_block_hash,
            destination_block_number = excluded.destination_block_number,
            destination_block_hash = excluded.destination_block_hash,
            source_canonical = excluded.source_canonical,
            destination_canonical = excluded.destination_canonical,
            observed_at = excluded.observed_at,
            published_at = excluded.published_at,
            mirrored_at = excluded.mirrored_at,
            updated_at = excluded.updated_at;
    else
        select network.chain_id into remote_chain_id
        from public.crosschain_networks network
        where network.environment = new.environment
          and network.eid = (new.payload->>'srcEid')::bigint
          and network.active;
        if remote_chain_id is null then
            raise exception 'CROSSCHAIN_SOURCE_NETWORK_NOT_CONFIGURED';
        end if;

        select * into existing_message
        from public.crosschain_nav_messages message
        where message.environment = new.environment
          and message.source_eid = (new.payload->>'srcEid')::bigint
          and message.guid = lower(new.payload->>'guid');
        if existing_message.guid is not null and (
            existing_message.sequence <> (new.payload->>'sequence')::numeric
            or existing_message.nav_18 <> (new.payload->>'nav18')::numeric
            or existing_message.canonical_total_supply_18 <>
                (new.payload->>'canonicalTotalSupply')::numeric
        ) then
            raise exception 'CROSSCHAIN_NAV_MIRROR_MISMATCH';
        end if;

        insert into public.crosschain_nav_receipts (
            environment, source_eid, destination_chain_id, guid, sequence, nav_18,
            canonical_total_supply_18, destination_transaction_hash,
            destination_block_number, destination_block_hash, canonical, observed_at,
            mirrored_at
        ) values (
            new.environment, (new.payload->>'srcEid')::bigint, new.chain_id,
            lower(new.payload->>'guid'), (new.payload->>'sequence')::numeric,
            (new.payload->>'nav18')::numeric,
            (new.payload->>'canonicalTotalSupply')::numeric,
            lower(new.transaction_hash), new.block_number, lower(new.block_hash),
            new.canonical, to_timestamp((new.payload->>'observedAt')::double precision),
            new.block_timestamp
        )
        on conflict (environment, source_eid, guid) do update set
            destination_chain_id = excluded.destination_chain_id,
            sequence = excluded.sequence,
            nav_18 = excluded.nav_18,
            canonical_total_supply_18 = excluded.canonical_total_supply_18,
            destination_transaction_hash = excluded.destination_transaction_hash,
            destination_block_number = excluded.destination_block_number,
            destination_block_hash = excluded.destination_block_hash,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at,
            mirrored_at = excluded.mirrored_at;

        update public.crosschain_nav_messages message set
            state = case when new.canonical then 'mirrored' else 'published' end,
            destination_transaction_hash = case when new.canonical then lower(new.transaction_hash) else null end,
            destination_block_number = case when new.canonical then new.block_number else null end,
            destination_block_hash = case when new.canonical then lower(new.block_hash) else null end,
            destination_canonical = new.canonical,
            mirrored_at = case when new.canonical then new.block_timestamp else null end,
            updated_at = new.block_timestamp
        where message.environment = new.environment
          and message.source_eid = (new.payload->>'srcEid')::bigint
          and message.guid = lower(new.payload->>'guid')
          and message.sequence = (new.payload->>'sequence')::numeric
          and message.nav_18 = (new.payload->>'nav18')::numeric
          and message.canonical_total_supply_18 =
              (new.payload->>'canonicalTotalSupply')::numeric;
    end if;

    return new;
end;
$$;

create trigger project_crosschain_nav_event_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_crosschain_nav_event();

commit;
