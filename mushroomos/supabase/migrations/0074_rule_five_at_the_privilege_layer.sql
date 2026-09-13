-- ─────────────────────────────────────────────────────────────────────────────
-- 0074 · Rule 5, enforced by privileges and not only by policy.
--
--     "Read from views, never base tables. Write through RPCs, never insert or update."
--
-- That rule was true in practice and false in the grant table. Sweeping every base table in
-- `public` as part of the adversarial pass:
--
--     54 tables granted INSERT / UPDATE / DELETE / TRUNCATE to `authenticated`
--     of those, 30 had no write policy at all
--
-- Nothing was exploitable today, and that is worth stating precisely rather than dressing the
-- finding up: row-level security is enabled on every table, `anon` holds nothing on any of them,
-- and a table with no write policy denies the write regardless of the grant. The attack that
-- surfaced this — deleting the lab_checkpoint_activity row an open gate depends on — returned
-- HTTP 204 and deleted nothing, because RLS refused it. All 41 bindings survived.
--
-- But the grant is the last line, not the first. Two things make it worth closing:
--
--   · TRUNCATE IS NOT SUBJECT TO ROW-LEVEL SECURITY. It is not reachable through PostgREST, so
--     there is no route to it from a phone; but the privilege being there at all means the
--     protection rests entirely on the API surface rather than on the database.
--   · A single permissive policy added later — by anyone, for a good reason — silently converts a
--     dormant grant into a live write path. The defect would then be in the policy, and nobody
--     would think to look at grants made years earlier.
--
-- Every write RPC is SECURITY DEFINER (66 of them; the 11 SECURITY INVOKER functions are trigger
-- bodies and none writes), so they run as the owner and are unaffected by this.
--
-- ONE FRONTEND CHANGE GOES WITH THIS. `cancelScheduledBatchGroup` was the single place in `src/`
-- that wrote a table directly, and it duplicated an RPC that already existed. It now calls
-- `cancel_monthly_schedule_group`, which is what rule 5 asked for in the first place.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Take the writes back ─────────────────────────────────────────────────────

do $sweep$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    -- anon gets nothing at all; a signed-in caller reads and writes nothing directly.
    execute format('revoke all on public.%I from anon, public', t.relname);
    execute format('revoke insert, update, delete, truncate, references on public.%I from authenticated', t.relname);
    execute format('grant select on public.%I to authenticated', t.relname);
  end loop;
end $sweep$;

-- ── Close the class, the way 0067 and 0069 did ───────────────────────────────

create or replace function public.fn_new_table_is_read_only()
returns event_trigger language plpgsql as $fn$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
     where command_tag = 'CREATE TABLE' and schema_name = 'public' and object_type = 'table'
  loop
    execute format('revoke all on %s from anon, public', obj.object_identity);
    execute format('revoke insert, update, delete, truncate, references on %s from authenticated', obj.object_identity);
    execute format('grant select on %s to authenticated', obj.object_identity);
  end loop;
end;
$fn$;

comment on function public.fn_new_table_is_read_only() is
  'A new table in public is readable by a signed-in caller and written only through an RPC. '
  'Supabase grants the full set by default; this takes it straight back, so rule 5 holds for '
  'tables written after 0074 as well. 0074.';

drop event trigger if exists new_table_is_read_only;
create event trigger new_table_is_read_only
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.fn_new_table_is_read_only();

revoke execute on function public.fn_new_table_is_read_only() from public, anon;

-- ── Assertions ───────────────────────────────────────────────────────────────

do $a$
declare
  bad text;
  n   int;
begin
  -- 1 · No signed-in write privilege survives on any base table.
  select string_agg(format('%s:%s', g.table_name, g.privilege_type), ', ')
    into bad
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r'
     and ((g.grantee = 'authenticated'
           and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'))
       or g.grantee = 'anon');
  if bad is not null then
    raise exception '0074 failed: write privileges remain — %', left(bad, 400);
  end if;

  -- 2 · Reading still works, or every screen breaks.
  if not has_table_privilege('authenticated', 'public.batch_activity', 'select')
     or not has_table_privilege('authenticated', 'public.master_batch', 'select') then
    raise exception '0074 failed: a signed-in caller can no longer read';
  end if;

  -- 3 · Row-level security is still on everywhere. Revoking grants is not a substitute for it.
  select string_agg(tablename, ', ') into bad
    from pg_tables where schemaname = 'public' and not rowsecurity;
  if bad is not null then
    raise exception '0074 failed: row-level security is off on — %', bad;
  end if;

  select count(*) into n from pg_event_trigger where evtname = 'new_table_is_read_only';
  if n <> 1 then raise exception '0074 failed: the event trigger is not installed'; end if;

  -- 4 · And it works on a table created after it.
  execute 'create table public.zz_0074_probe (id int)';
  if has_table_privilege('authenticated', 'public.zz_0074_probe', 'insert')
     or has_table_privilege('anon', 'public.zz_0074_probe', 'select') then
    execute 'drop table public.zz_0074_probe';
    raise exception '0074 failed: the event trigger did not secure a newly created table';
  end if;
  execute 'drop table public.zz_0074_probe';

  raise notice '0074 · a signed-in caller reads tables and writes none of them';
end $a$;
