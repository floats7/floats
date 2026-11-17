begin;

create type public.keeper_job_status as enum (
    'ready',
    'simulated',
    'broadcast',
    'confirmed',
    'failed',
    'abandoned'
);

create table public.keeper_jobs (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    job_name text not null check (length(job_name) between 1 and 64),
    idempotency_key text not null check (length(idempotency_key) between 1 and 256),
    status public.keeper_job_status not null,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    transaction_hash text check (
        transaction_hash is null or transaction_hash ~ '^0x[0-9a-fA-F]{64}$'
    ),
    transaction_nonce bigint check (transaction_nonce is null or transaction_nonce >= 0),
    payload jsonb not null,
    last_error text,
    next_attempt_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (environment, chain_id, job_name, idempotency_key)
);

create index keeper_jobs_runnable_idx
    on public.keeper_jobs (environment, chain_id, status, next_attempt_at)
    where status in ('ready', 'simulated', 'failed');

alter table public.keeper_jobs enable row level security;

-- No browser policy: only the server-side keeper backend may access this table.

commit;
