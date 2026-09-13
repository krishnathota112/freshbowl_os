-- ─────────────────────────────────────────────────────────────────────────────
-- 0058 · A signed-in user is not the same as an authorised one.
--
-- WHAT WAS FOUND, BY DOING IT
--   Signed in over HTTP as `operator@freshbowl.demo` — a real account, a real token, the role the
--   permission matrix gives the least authority to:
--
--       create_master_batch    200  "450da754-1811-47b2-be21-d5f9b484daa4"
--
--   **The operator created a master batch.** It was deleted after the probe. `activate_batch`
--   returned 204, `cancel_batch` and `set_activity_plan` both reached "no such batch" — that is,
--   past every guard, refused only by the id being fictional. A laboratory technician got the same
--   answers.
--
--   0057 shut the door on people who had not signed in. This one is about people who have.
--
-- WHY IT WAS OPEN
--   Sixteen functions carried `assert_role`. Sixty did not, and the ones that matter most were in
--   the second group — because the guard was added to each function as somebody happened to think
--   of it, and nothing ever asked "which writers have none?"
--
-- ── AND NO EXEMPTION FOR THE OWNER ─────────────────────────────────────────
--   Two exemptions were tried, so that the proof suites (which connect as `postgres`) would not be
--   refused. Both were removed. See the function body: one was true for every caller and disabled
--   every guard; the other made refusals vacuous over `pg` and unprovable for F3.
--
--   The fixtures adopt the role they need instead — `createDraftBatch` borrows `admin` and puts the
--   caller's role back — which is what `satisfyPrebatchMaterialCheck` was already doing.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The exemption, once. ────────────────────────────────────────────────

create or replace function public.assert_role(p_allowed public.app_role[], p_action text)
returns void language plpgsql stable as $fn$
begin
  -- ⚠ NO EXEMPTION. NOT FOR THE OWNER, NOT FOR ANYBODY.
  --
  -- Two were tried and both were wrong, and the way they were wrong is worth keeping:
  --
  --   1 · `rolbypassrls where rolname = current_user` — and inside a SECURITY DEFINER function
  --       `current_user` is the OWNER, so it was true for every caller and silently disabled every
  --       role guard in the product. The bodies still looked correct. Only re-running the
  --       adversarial HTTP probe caught it.
  --
  --   2 · `session_user` plus "no role claimed" — correct for HTTP, and it still made every
  --       assert_role refusal VACUOUS over `pg` for any suite that had not adopted a role. Those
  --       suites went green while proving nothing, which is worse than going red. F3's own proof
  --       — that an unauthenticated session is refused BY NAME — became unprovable.
  --
  -- So there is no exemption. A fixture that needs to create a batch adopts `admin` and puts the
  -- caller's role back, exactly as `satisfyPrebatchMaterialCheck` has always done. That costs a
  -- line in the harness and buys a guard that means the same thing over `pg` and over HTTP.
  if not public.has_role(variadic p_allowed) then
    raise exception '% requires role %, not %',
      p_action, array_to_string(p_allowed, ' or '),
      coalesce(public.current_app_role()::text, 'an unauthenticated session')
      using errcode = 'insufficient_privilege';
  end if;
end;
$fn$;


-- ── 2 · Guards on the writers that had none. ────────────────────────────────
-- Inserted into the deployed bodies rather than retyped: these carry validations, deviation
-- capture and state machines that a rewrite would silently drop.

do $mig$
declare
  spec record;
  src  text;
  n    int;
  ins  text;
begin
  for spec in
    select * from (values
      -- WHO MAY START, ACTIVATE AND CANCEL A BATCH. The Admin surface, per the PRD's role table.
      ('create_master_batch',    'admin,gm',                 'create a batch',
       'if not found then raise exception ''No such batch'''),
      ('activate_batch',         'admin,gm',                 'activate a batch', null),
      ('generate_activity_plan', 'admin,gm',                 'generate a batch plan', null),
      ('cancel_batch',           'admin,gm',                 'cancel a batch', null),
      -- Editing a DRAFT plan is a supervisory act. The freeze already stops it once active.
      ('set_activity_plan',      'admin,gm,supervisor',      'change a planned time', null),
      -- WHO MAY EXECUTE WORK. An admin is deliberately absent: the permission matrix does not
      -- tick "capture evidence" for them either, and a role that cannot prove work happened
      -- should not be recording that it did.
      ('start_activity',         'operator,supervisor,lab_tech', 'start an activity', null),
      ('submit_activity',        'operator,supervisor,lab_tech', 'submit an activity', null),
      -- Releasing elapsed rests moves a batch's state machine on. Supervisory.
      ('release_elapsed_rests',  'supervisor,admin,gm',      'release elapsed rests', null)
    ) as t(fname, roles, action, unused)
  loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = spec.fname;

    if src is null then
      raise warning '%() is not deployed — skipped.', spec.fname;
      continue;
    end if;

    if src like '%assert_role%' then
      raise notice '%() already carries a role guard.', spec.fname;
      continue;
    end if;

    ins := format(
      E'\n  perform public.assert_role(array[%s]::app_role[], %L);\n',
      (select string_agg(quote_literal(trim(x)), ', ')
         from unnest(string_to_array(spec.roles, ',')) x),
      spec.action);

    -- ⚠ Anchored on the FIRST `begin` that is followed by a newline, found by regex rather than by
    -- a literal, because these bodies carry CRLF line endings (see 0050) and a literal newline
    -- match silently finds nothing.
    n := coalesce(nullif(regexp_instr(src, 'AS \$function\$.*?\mbegin\M', 1, 1, 1, 'ns'), 0), 0);
    if n = 0 then
      raise exception 'Could not find the body opening of %(). Patch it by hand.', spec.fname;
    end if;

    execute substr(src, 1, n - 1) || ins || substr(src, n);
    raise notice '%() now requires %.', spec.fname, spec.roles;
  end loop;
end
$mig$;


-- ── 3 · The engine's own internals are not a public API. ───────────────────
-- `advance_batch` walks the state machine and `repair_plan_states` rewrites batch states wholesale.
-- Neither is called from `src/` — checked, not assumed — and both ran happily for an anonymous
-- caller until 0057. A guard is the wrong tool here: nothing outside the database should reach
-- them at all, so the grant goes rather than a role being named.
--
-- They keep working where they are actually used: `submit_activity` calls `advance_batch`, and a
-- SECURITY DEFINER function's inner calls run as the owner.

revoke execute on function public.advance_batch(uuid) from authenticated;
revoke execute on function public.repair_plan_states() from authenticated;


-- ── 4 · Which writers still have no guard, as data. ────────────────────────
-- The question nobody asked for sixty functions. A view, so it can be read at any time and
-- asserted in the suite rather than re-derived by the next person to wonder.

create or replace view public.v_unguarded_writer as
select
  p.proname                                        as function_name,
  pg_get_function_identity_arguments(p.oid)        as arguments,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_may_call,
  has_function_privilege('anon', p.oid, 'execute')          as anon_may_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and pg_get_functiondef(p.oid) not ilike '%assert_role%'
  and has_function_privilege('authenticated', p.oid, 'execute')
  -- Trigger functions are reached by the trigger, never by a caller, and take no arguments a
  -- client could supply. They are not an API surface.
  and p.prorettype <> 'trigger'::regtype;

grant select on public.v_unguarded_writer to authenticated;

comment on view public.v_unguarded_writer is
  'Every SECURITY DEFINER function a signed-in user may call that names no role. Not all of them '
  'are defects — several are reads — but the list must be looked at deliberately rather than '
  'grown by accident, which is how an operator came to be able to create a batch. 0058.';
