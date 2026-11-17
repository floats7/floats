begin;

create table public.wallet_auth_challenges (
    environment public.network_environment not null,
    chain_id bigint not null check (chain_id > 0),
    nonce text not null check (nonce ~ '^[a-f0-9]{32}$'),
    wallet_address text not null check (wallet_address ~ '^0x[0-9a-f]{40}$'),
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (environment, chain_id, nonce)
);

alter table public.wallet_auth_challenges enable row level security;
revoke all on public.wallet_auth_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.wallet_auth_challenges to service_role;

create or replace function public.issue_wallet_auth_challenge(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_nonce text,
    p_wallet_address text,
    p_expires_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    delete from public.wallet_auth_challenges
    where expires_at < now() - interval '1 hour';

    insert into public.wallet_auth_challenges (
        environment, chain_id, nonce, wallet_address, expires_at
    ) values (
        p_environment, p_chain_id, p_nonce, lower(p_wallet_address), p_expires_at
    );
end;
$$;

create or replace function public.consume_wallet_auth_challenge(
    p_environment public.network_environment,
    p_chain_id bigint,
    p_nonce text,
    p_wallet_address text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    updated_count integer;
begin
    update public.wallet_auth_challenges
    set consumed_at = now()
    where environment = p_environment
      and chain_id = p_chain_id
      and nonce = p_nonce
      and wallet_address = lower(p_wallet_address)
      and consumed_at is null
      and expires_at > now();
    get diagnostics updated_count = row_count;
    return updated_count = 1;
end;
$$;

revoke all on function public.issue_wallet_auth_challenge(public.network_environment, bigint, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_wallet_auth_challenge(public.network_environment, bigint, text, text) from public, anon, authenticated;
grant execute on function public.issue_wallet_auth_challenge(public.network_environment, bigint, text, text, timestamptz) to service_role;
grant execute on function public.consume_wallet_auth_challenge(public.network_environment, bigint, text, text) to service_role;

commit;
