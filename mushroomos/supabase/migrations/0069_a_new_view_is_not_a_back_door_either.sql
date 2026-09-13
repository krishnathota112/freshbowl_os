-- ─────────────────────────────────────────────────────────────────────────────
-- 0069 · A new view is not a back door either.
--
-- WHAT HAPPENED
--   Probing the deployed database as a real signed-in operator turned up exactly one view in the
--   whole schema carrying privileges it should never have had:
--
--       v_lab_approval_queue   anon           DELETE,INSERT,REFERENCES,SELECT,TRUNCATE,UPDATE
--       v_lab_approval_queue   authenticated  DELETE,INSERT,REFERENCES,TRUNCATE,UPDATE
--
--   Every other view carries `authenticated SELECT` and nothing else. This one was created by 0063
--   — AFTER 0061 swept the thirty-seven views that existed at the time — and so it simply inherited
--   the defaults Supabase grants on anything new in `public`.
--
--   0067 wrote the diagnosis for this exact shape before it happened again:
--
--       "This is the third appearance of the same shape: a class of defect fixed for today's
--        instances and not for tomorrow's. 0057 fixed FUNCTIONS and missed VIEWS (0061). Now
--        0057's own sweep is missed by anything created after it."
--
--   0067 then closed the class for FUNCTIONS and left VIEWS with a one-time sweep. This is the
--   fourth appearance, and it is the same lesson: a sweep fixes today, a trigger fixes the class.
--
-- HOW BAD WAS IT
--   Limited, and worth stating precisely rather than overstating. 0063 did set `security_invoker`
--   on the view, so row-level security on the underlying tables still applied and an
--   unauthenticated caller reading it got nothing. The grants were a hole in defence-in-depth, not
--   an open door. But they broke an invariant 0061 asserted, and the only reason we know is that
--   somebody signed in as an operator and looked.
--
-- WHAT THIS DOES NOT DO
--   It does not change WHO may read the queue's rows. An operator can currently see rows in it
--   because row-level security on the underlying tables lets them, which is a policy question for
--   the factory, not a grant bug. That is reported, not silently decided here.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Close the one that is open ───────────────────────────────────────────────

revoke all on public.v_lab_approval_queue from anon, authenticated, public;
grant select on public.v_lab_approval_queue to authenticated;

-- ── Close the class ──────────────────────────────────────────────────────────

create or replace function public.fn_new_view_is_not_public()
returns event_trigger language plpgsql as $fn$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
     where command_tag = 'CREATE VIEW'
       and schema_name = 'public'
       and object_type = 'view'
  loop
    -- Same shape 0061 established by hand: nothing for anon, read-only for a signed-in caller,
    -- and the view answers as the CALLER so row-level security is not bypassed.
    execute format('revoke all on %s from anon, authenticated, public', obj.object_identity);
    execute format('grant select on %s to authenticated', obj.object_identity);
    execute format('alter view %s set (security_invoker = on)', obj.object_identity);
  end loop;
end;
$fn$;

comment on function public.fn_new_view_is_not_public() is
  'Supabase grants the full privilege set on a new view in public to anon and authenticated. This '
  'takes it straight back and pins security_invoker, so 0061''s sweep holds for every view written '
  'after it. 0069.';

-- Deliberately NOT listening for ALTER VIEW: the `alter view ... set (security_invoker)` above
-- carries that tag, and the trigger would fire on its own work.
drop event trigger if exists new_view_is_not_public;
create event trigger new_view_is_not_public
  on ddl_command_end
  when tag in ('CREATE VIEW')
  execute function public.fn_new_view_is_not_public();

-- The trigger's own function was created before the trigger existed, exactly as 0067's was, and so
-- kept its default PUBLIC grant. 0067's event trigger catches this one; the revoke is kept explicit
-- so the migration does not depend on the order the two triggers happen to fire in.
revoke execute on function public.fn_new_view_is_not_public() from public, anon;

-- ── Assertions ───────────────────────────────────────────────────────────────

do $a$
declare
  bad text;
  n   int;
begin
  -- 1 · No view in public carries anything beyond SELECT for a signed-in caller, or anything at all
  --     for anon. This is 0061's invariant, restated so it fails loudly next time.
  select string_agg(format('%s→%s:%s', g.table_name, g.grantee, g.privilege_type), ', ')
    into bad
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'v'
     and g.grantee in ('anon', 'authenticated')
     and (g.grantee = 'anon' or g.privilege_type not in ('SELECT', 'TRIGGER'));
  if bad is not null then
    raise exception '0069 failed: views still carry privileges they should not — %', bad;
  end if;

  -- 2 · Every view answers as the caller, so RLS is never bypassed by reading through one.
  select string_agg(c.relname, ', ' order by c.relname) into bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'v'
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'off') <> 'on';
  if bad is not null then
    raise exception '0069 failed: these views are not security_invoker — %', bad;
  end if;

  -- 3 · The queue is still readable by the people who work it. A revoke that breaks the screen is
  --     not a fix.
  if not has_table_privilege('authenticated', 'public.v_lab_approval_queue', 'select') then
    raise exception '0069 failed: the approval queue is no longer readable by a signed-in caller';
  end if;

  select count(*) into n from pg_event_trigger where evtname = 'new_view_is_not_public';
  if n <> 1 then
    raise exception '0069 failed: the event trigger is not installed';
  end if;

  -- 4 · And it must actually work — the same proof 0067 demanded of itself.
  execute 'create view public.zz_0069_probe as select 1 as one';
  if has_table_privilege('anon', 'public.zz_0069_probe', 'select')
     or has_table_privilege('authenticated', 'public.zz_0069_probe', 'insert')
     or coalesce((select option_value from pg_options_to_table(
           (select reloptions from pg_class where oid = 'public.zz_0069_probe'::regclass))
         where option_name = 'security_invoker'), 'off') <> 'on' then
    execute 'drop view public.zz_0069_probe';
    raise exception '0069 failed: the event trigger did not secure a newly created view';
  end if;
  execute 'drop view public.zz_0069_probe';

  raise notice '0069 · anon reads no view, no view is writable, and a new view cannot change that';
end $a$;
