-- ─────────────────────────────────────────────────────────────────────────────
-- 0067 · A new function is not public, and never will be again.
--
-- WHAT HAPPENED
--   0066 added two functions. `roleEnforcement.test.ts` failed on the next run:
--
--       expected [ 'assert_may_execute', 'evidence_path_is_consistent' ] to deeply equal []
--
--   Its own comment had predicted this exactly:
--       "Fifty-eight of these existed. The next one added must fail this, not be discovered by
--        somebody calling it."
--
--   PostgreSQL grants `EXECUTE` on a new function to `PUBLIC` by default. 0057 swept the 109 that
--   existed at the time; it could not sweep the ones that had not been written yet. So every
--   migration since has been silently reopening the door a crack, and would have gone on doing so.
--
--   This is the third appearance of the same shape: a class of defect fixed for today's instances
--   and not for tomorrow's. 0057 fixed FUNCTIONS and missed VIEWS (0061). Now 0057's own sweep is
--   missed by anything created after it.
--
-- THE FIX IS A TRIGGER, NOT A SWEEP
--   An event trigger revokes `EXECUTE` from `PUBLIC` and `anon` on every function created or
--   replaced in `public`, at the moment it is created. There is precedent: `rls_auto_enable`
--   already does the same job for row-level security on new tables.
--
--   A sweep would fix today. A trigger fixes the class.
--
-- ALSO HERE
--   `assert_may_execute` no longer decides whether an activity EXISTS. It was raising
--   'No such activity' for an unknown id, which turned `start_activity`'s previous silent no-op
--   into a 400 and broke a probe that was asking about AUTHORISATION, not existence. A guard should
--   answer the question it was asked and leave the rest alone.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The trigger ──────────────────────────────────────────────────────────────

create or replace function public.fn_revoke_public_execute()
returns event_trigger language plpgsql as $fn$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
     where command_tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
       and schema_name = 'public'
  loop
    -- `object_identity` is already schema-qualified and argument-typed, which is what REVOKE needs
    -- to name an overload unambiguously.
    execute format('revoke execute on function %s from public, anon', obj.object_identity);
  end loop;
end;
$fn$;

comment on function public.fn_revoke_public_execute() is
  'PostgreSQL grants EXECUTE on a new function to PUBLIC. This takes it straight back, so 0057''s '
  'sweep holds for every function written after it. 0067.';

drop event trigger if exists revoke_public_execute;
create event trigger revoke_public_execute
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
  execute function public.fn_revoke_public_execute();

-- ── Close the two 0066 opened, and the one this migration just opened ────────
--
-- `fn_revoke_public_execute` is itself a function created in `public`, and it was created BEFORE
-- the trigger that would have caught it. It kept its own default PUBLIC grant — the fix leaving
-- exactly the hole it exists to close, which the assertion below caught on the first apply.

revoke execute on function public.fn_revoke_public_execute() from public, anon;
revoke execute on function public.assert_may_execute(uuid, text) from public, anon;
revoke execute on function public.evidence_path_is_consistent(text, text) from public, anon;

-- ── A guard answers the question it was asked ────────────────────────────────

create or replace function public.assert_may_execute(p_activity uuid, p_action text)
returns void language plpgsql stable security definer set search_path = public as $fn$
declare
  r   app_role;
  own app_role;
  ttl text;
begin
  select ba.responsible_role, ba.title into own, ttl
    from batch_activity ba where ba.id = p_activity;

  -- 0067 · NOT FOUND IS NOT THIS FUNCTION'S BUSINESS.
  -- Raising here turned start_activity's long-standing silent no-op on an unknown id into a 400,
  -- and failed a probe that was asking whether an OPERATOR MAY START WORK — not whether that
  -- particular uuid exists. Authorisation is the question; existence belongs to the caller.
  if not found then
    return;
  end if;

  r := public.current_app_role();

  -- A supervisor and above may perform eligible downstream work — ROLE_AND_APPROVAL_MODEL §2.
  if r in ('supervisor', 'manager', 'admin', 'gm') then
    return;
  end if;

  if own is null or r is distinct from own then
    raise exception
      '% is %''s work, not a %''s. A % may execute the work their role is responsible for; a '
      'supervisor may take eligible downstream work. Ask a supervisor to reassign it.',
      ttl, coalesce(own::text, 'nobody'), coalesce(r::text, 'caller with no role'),
      coalesce(r::text, 'caller with no role')
      using errcode = 'insufficient_privilege';
  end if;
end;
$fn$;

grant execute on function public.assert_may_execute(uuid, text) to authenticated;

-- ── Assertions ───────────────────────────────────────────────────────────────

do $a$
declare
  open_names text;
  n int;
begin
  -- Nothing in `public` is executable by an unauthenticated caller. The whole point of 0057,
  -- now true for functions written after it as well.
  select string_agg(p.proname, ', ' order by p.proname) into open_names
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute');
  if open_names is not null then
    raise exception '0067 failed: still executable by anon — %', open_names;
  end if;

  select count(*) into n from pg_event_trigger where evtname = 'revoke_public_execute';
  if n <> 1 then
    raise exception '0067 failed: the event trigger is not installed';
  end if;

  -- And it must actually work. Create a throwaway function and check the grant is gone.
  execute 'create or replace function public.zz_0067_probe() returns int language sql as $p$ select 1 $p$';
  if has_function_privilege('anon', 'public.zz_0067_probe()', 'execute') then
    execute 'drop function public.zz_0067_probe()';
    raise exception '0067 failed: the event trigger did not revoke on a newly created function';
  end if;
  execute 'drop function public.zz_0067_probe()';

  raise notice '0067 · anon executes nothing, and a new function cannot change that';
end $a$;
