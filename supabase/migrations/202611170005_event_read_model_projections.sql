begin;

alter table public.user_transactions
    add column source_log_index integer,
    add column source_block_hash text,
    add column canonical boolean not null default true;

alter table public.user_transactions
    add constraint user_transactions_source_log_check
        check (source_log_index is null or source_log_index >= 0),
    add constraint user_transactions_source_hash_check
        check (source_block_hash is null or source_block_hash ~ '^0x[0-9a-fA-F]{64}$');

create table public.registry_changes (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    change_kind text not null check (change_kind in (
        'configuration_proposed', 'configuration_cancelled', 'configuration_executed',
        'constituent_configured', 'constituent_removed'
    )),
    configuration_hash text,
    registry_version bigint,
    token_address text,
    payload jsonb not null,
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index),
    check (configuration_hash is null or configuration_hash ~ '^0x[0-9a-fA-F]{64}$'),
    check (token_address is null or token_address ~ '^0x[0-9a-fA-F]{40}$'),
    check (registry_version is null or registry_version >= 0)
);

create index registry_changes_canonical_idx
    on public.registry_changes (environment, chain_id, block_number desc, log_index desc)
    where canonical;

create table public.operational_actions (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    module text not null check (module in ('vault', 'fees', 'rebalance')),
    action text not null check (length(action) between 1 and 128),
    payload jsonb not null,
    canonical boolean not null default true,
    observed_at timestamptz not null,
    primary key (environment, chain_id, transaction_hash, log_index)
);

create index operational_actions_canonical_idx
    on public.operational_actions (environment, chain_id, module, block_number desc, log_index desc)
    where canonical;

alter table public.registry_changes enable row level security;
alter table public.operational_actions enable row level security;
revoke all on public.registry_changes, public.operational_actions from anon, authenticated;

create or replace function public.project_protocol_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    wallet text;
    transaction_action text;
    registry_kind text;
    module_name text;
begin
    if new.event_name in ('Deposit', 'Withdraw', 'InKindRedeemed') then
        wallet := lower(new.payload->>'owner');
        transaction_action := case new.event_name
            when 'Deposit' then 'cash_mint'
            when 'Withdraw' then 'cash_redeem'
            else 'in_kind_redeem'
        end;

        if wallet is null or wallet !~ '^0x[0-9a-fA-F]{40}$' then
            raise exception 'INVALID_PROJECTED_WALLET';
        end if;

        insert into public.user_transactions (
            environment, chain_id, transaction_hash, wallet_address, action, status,
            block_number, asset_amount, share_amount, submitted_at, finalized_at,
            source_log_index, source_block_hash, canonical
        ) values (
            new.environment, new.chain_id, new.transaction_hash, wallet,
            transaction_action,
            case when new.canonical then 'confirmed'::public.transaction_status
                 else 'replaced'::public.transaction_status end,
            new.block_number,
            nullif(new.payload->>'assets', '')::numeric,
            nullif(new.payload->>'shares', '')::numeric,
            new.block_timestamp, new.block_timestamp, new.log_index, new.block_hash, new.canonical
        )
        on conflict (environment, chain_id, transaction_hash, wallet_address) do update set
            action = excluded.action,
            status = excluded.status,
            block_number = excluded.block_number,
            asset_amount = excluded.asset_amount,
            share_amount = excluded.share_amount,
            finalized_at = excluded.finalized_at,
            source_log_index = excluded.source_log_index,
            source_block_hash = excluded.source_block_hash,
            canonical = excluded.canonical;
    end if;

    registry_kind := case new.event_name
        when 'ConfigurationProposed' then 'configuration_proposed'
        when 'ConfigurationCancelled' then 'configuration_cancelled'
        when 'ConfigurationExecuted' then 'configuration_executed'
        when 'ConstituentConfigured' then 'constituent_configured'
        when 'ConstituentRemoved' then 'constituent_removed'
        else null
    end;

    if registry_kind is not null then
        insert into public.registry_changes (
            environment, chain_id, transaction_hash, log_index, block_number,
            block_hash, change_kind, configuration_hash, registry_version,
            token_address, payload, canonical, observed_at
        ) values (
            new.environment, new.chain_id, new.transaction_hash, new.log_index,
            new.block_number, new.block_hash, registry_kind,
            new.payload->>'configurationHash',
            nullif(new.payload->>'version', '')::bigint,
            lower(new.payload->>'token'), new.payload, new.canonical, new.block_timestamp
        )
        on conflict (environment, chain_id, transaction_hash, log_index) do update set
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            change_kind = excluded.change_kind,
            configuration_hash = excluded.configuration_hash,
            registry_version = excluded.registry_version,
            token_address = excluded.token_address,
            payload = excluded.payload,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;
    end if;

    module_name := case
        when new.event_name in (
            'CashOperationsPauseSet', 'DepositsPauseSet', 'FeeModuleSet',
            'RebalancerSet', 'TvlCapSet'
        ) then 'vault'
        when new.event_name in ('FeesAccrued', 'RatesSet', 'TreasurySet') then 'fees'
        when new.event_name in (
            'ChunkLimitSet', 'InstructionAuthorized', 'InstructionCancelled',
            'InstructionExecuted', 'KeeperSet'
        ) then 'rebalance'
        else null
    end;

    if module_name is not null then
        insert into public.operational_actions (
            environment, chain_id, transaction_hash, log_index, block_number,
            block_hash, module, action, payload, canonical, observed_at
        ) values (
            new.environment, new.chain_id, new.transaction_hash, new.log_index,
            new.block_number, new.block_hash, module_name, new.event_name,
            new.payload, new.canonical, new.block_timestamp
        )
        on conflict (environment, chain_id, transaction_hash, log_index) do update set
            block_number = excluded.block_number,
            block_hash = excluded.block_hash,
            module = excluded.module,
            action = excluded.action,
            payload = excluded.payload,
            canonical = excluded.canonical,
            observed_at = excluded.observed_at;
    end if;

    return new;
end;
$$;

create trigger project_protocol_event_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row execute function public.project_protocol_event();

revoke all on function public.project_protocol_event() from public, anon, authenticated;

commit;
