begin;

create type public.network_environment as enum ('testnet', 'mainnet');
create type public.ingestion_status as enum ('healthy', 'degraded', 'halted');
create type public.transaction_status as enum ('pending', 'confirmed', 'failed', 'replaced');

create table public.assets (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
    asset_uid text not null check (asset_uid ~ '^0x[0-9a-fA-F]{64}$'),
    symbol text not null check (length(symbol) between 1 and 32),
    decimals smallint not null check (decimals between 0 and 36),
    feed_address text check (feed_address is null or feed_address ~ '^0x[0-9a-fA-F]{40}$'),
    active boolean not null default false,
    registry_version bigint not null check (registry_version >= 0),
    source_block bigint not null check (source_block >= 0),
    updated_at timestamptz not null default now(),
    primary key (environment, chain_id, token_address),
    unique (environment, chain_id, asset_uid)
);

create table public.chain_checkpoints (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    consumer text not null check (length(consumer) between 1 and 64),
    next_block bigint not null check (next_block >= 0),
    last_finalized_block bigint check (last_finalized_block is null or last_finalized_block >= 0),
    last_finalized_hash text check (
        last_finalized_hash is null or last_finalized_hash ~ '^0x[0-9a-fA-F]{64}$'
    ),
    updated_at timestamptz not null default now(),
    primary key (environment, chain_id, consumer)
);

create table public.protocol_events (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    transaction_index integer not null check (transaction_index >= 0),
    log_index integer not null check (log_index >= 0),
    contract_address text not null check (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    event_name text not null check (length(event_name) between 1 and 128),
    payload jsonb not null,
    block_timestamp timestamptz not null,
    canonical boolean not null default true,
    ingested_at timestamptz not null default now(),
    primary key (environment, chain_id, transaction_hash, log_index)
);

create index protocol_events_replay_idx
    on public.protocol_events (environment, chain_id, block_number, log_index)
    where canonical;

create table public.nav_snapshots (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    vault_address text not null check (vault_address ~ '^0x[0-9a-fA-F]{40}$'),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    nav_usd_18 numeric(78, 0) not null check (nav_usd_18 >= 0),
    total_supply_18 numeric(78, 0) not null check (total_supply_18 >= 0),
    share_price_usd_18 numeric(78, 0),
    oracle_health jsonb not null,
    observed_at timestamptz not null,
    primary key (environment, chain_id, vault_address, block_number)
);

create table public.holding_snapshots (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    vault_address text not null check (vault_address ~ '^0x[0-9a-fA-F]{40}$'),
    token_address text not null check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
    block_number bigint not null check (block_number >= 0),
    raw_balance numeric(78, 0) not null check (raw_balance >= 0),
    ui_multiplier_18 numeric(78, 0) not null check (ui_multiplier_18 > 0),
    normalized_price_usd_18 numeric(78, 0),
    value_usd_18 numeric(78, 0),
    primary key (environment, chain_id, vault_address, token_address, block_number)
);

create table public.user_transactions (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    action text not null check (length(action) between 1 and 64),
    status public.transaction_status not null,
    block_number bigint check (block_number is null or block_number >= 0),
    asset_amount numeric(78, 0),
    share_amount numeric(78, 0),
    failure_code text,
    submitted_at timestamptz not null,
    finalized_at timestamptz,
    primary key (environment, chain_id, transaction_hash, wallet_address)
);

create index user_transactions_wallet_idx
    on public.user_transactions (environment, chain_id, wallet_address, submitted_at desc);

create table public.ingestion_health (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    consumer text not null check (length(consumer) between 1 and 64),
    status public.ingestion_status not null,
    latest_seen_block bigint check (latest_seen_block is null or latest_seen_block >= 0),
    lag_blocks bigint check (lag_blocks is null or lag_blocks >= 0),
    last_error text,
    checked_at timestamptz not null,
    primary key (environment, chain_id, consumer)
);

alter table public.assets enable row level security;
alter table public.chain_checkpoints enable row level security;
alter table public.protocol_events enable row level security;
alter table public.nav_snapshots enable row level security;
alter table public.holding_snapshots enable row level security;
alter table public.user_transactions enable row level security;
alter table public.ingestion_health enable row level security;

create policy "public assets are readable"
    on public.assets for select to anon, authenticated using (true);

create policy "public nav snapshots are readable"
    on public.nav_snapshots for select to anon, authenticated using (true);

create policy "public holding snapshots are readable"
    on public.holding_snapshots for select to anon, authenticated using (true);

create policy "public ingestion health is readable"
    on public.ingestion_health for select to anon, authenticated using (true);

-- Checkpoints, raw events, and user transaction history intentionally have no
-- client policies. The server-only backend secret performs ingestion and bypasses
-- RLS; an application API must authorize wallet-specific history reads.

commit;
