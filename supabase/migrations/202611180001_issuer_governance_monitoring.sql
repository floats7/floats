begin;

alter table public.operational_actions
    drop constraint operational_actions_module_check;

alter table public.operational_actions
    add constraint operational_actions_module_check
        check (module in ('vault', 'fees', 'rebalance', 'issuer'));

create or replace function public.project_issuer_governance_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.operational_actions (
        environment, chain_id, transaction_hash, log_index, block_number,
        block_hash, module, action, payload, canonical, observed_at
    ) values (
        new.environment, new.chain_id, new.transaction_hash, new.log_index,
        new.block_number, new.block_hash, 'issuer', new.event_name,
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

    return new;
end;
$$;

create trigger project_issuer_governance_event_after_write
after insert or update of canonical, payload, block_hash on public.protocol_events
for each row
when (new.event_name in (
    'IssuerRoleGranted',
    'IssuerRoleRevoked',
    'IssuerImplementationUpgraded',
    'IssuerPaused',
    'IssuerUnpaused'
))
execute function public.project_issuer_governance_event();

revoke all on function public.project_issuer_governance_event() from public, anon, authenticated;

commit;
