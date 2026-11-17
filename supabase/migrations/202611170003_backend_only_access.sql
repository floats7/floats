begin;

drop policy if exists "public assets are readable" on public.assets;
drop policy if exists "public nav snapshots are readable" on public.nav_snapshots;
drop policy if exists "public holding snapshots are readable" on public.holding_snapshots;
drop policy if exists "public ingestion health is readable" on public.ingestion_health;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

commit;
