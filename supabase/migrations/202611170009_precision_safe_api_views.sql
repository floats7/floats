begin;

create or replace view public.api_nav_snapshots
with (security_invoker = true)
as
select
    environment,
    chain_id,
    vault_address,
    block_number,
    block_hash,
    nav_usd_18::text as nav_usd_18,
    total_supply_18::text as total_supply_18,
    share_price_usd_18::text as share_price_usd_18,
    oracle_health,
    canonical,
    observed_at
from public.nav_snapshots;

create or replace view public.api_holding_snapshots
with (security_invoker = true)
as
select
    environment,
    chain_id,
    vault_address,
    token_address,
    block_number,
    block_hash,
    raw_balance::text as raw_balance,
    ui_multiplier_18::text as ui_multiplier_18,
    normalized_price_usd_18::text as normalized_price_usd_18,
    value_usd_18::text as value_usd_18,
    oracle_health,
    oracle_updated_at,
    canonical,
    observed_at
from public.holding_snapshots;

revoke all on public.api_nav_snapshots from public, anon, authenticated;
revoke all on public.api_holding_snapshots from public, anon, authenticated;
grant select on public.api_nav_snapshots to service_role;
grant select on public.api_holding_snapshots to service_role;

commit;
