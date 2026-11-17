begin;

create view public.api_user_transactions
with (security_invoker = true)
as
select
    environment,
    chain_id,
    transaction_hash,
    wallet_address,
    action,
    status,
    block_number,
    asset_amount::text as asset_amount,
    share_amount::text as share_amount,
    failure_code,
    submitted_at,
    finalized_at,
    canonical
from public.user_transactions;

revoke all on public.api_user_transactions from public, anon, authenticated;
grant select on public.api_user_transactions to service_role;

commit;
