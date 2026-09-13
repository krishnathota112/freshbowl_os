-- ─────────────────────────────────────────────────────────────────────────────
-- 0070 · The approval queue is management's, in the database and not only on the screen.
--
-- WHAT WAS TRUE BEFORE THIS
--   Signed in as the demo operator and asking PostgREST directly:
--
--       operator sees 697 rows;  supervisor sees 697 rows
--
--   Identical. `v_lab_approval_queue` had no role predicate at all, so any signed-in account read
--   every lab decision on every batch — the verdict, the reason, `decided_by_name`, and which roles
--   were entitled to decide.
--
--   0069 had just removed the stray GRANTs on this same view. That was a different bug: grants are
--   about what SQL you may run, this is about which ROWS come back. Fixing one did not fix the
--   other, and it would have been easy to stop after the first and call the view safe.
--
-- WHY THIS IS A DEFECT AND NOT A POLICY CHOICE
--   The application already treats the queue as management-only and says so in two places:
--
--       App.tsx      <Route path="/lab/approvals" element={<RoleGuard allow={MGMT}>…
--       AdminToday   the admin dashboard, LAB GATES panel
--
--   Those are the only two readers in `src/`. No operator screen and no lab screen reads this view.
--   So the intent was already settled; only the enforcement was in the wrong layer — a button that
--   is hidden rather than a row that is withheld. `v_batch_event` is already management-only and
--   refuses an operator correctly; this view was the odd one out.
--
-- THE GUARD IS WRITTEN THE WAY THIS SCHEMA ALREADY WRITES GUARDS
--   `v_my_work` scopes itself with `current_app_role() in ('supervisor','manager','admin','gm')`.
--   Same function, same four roles, so there is one idea here and not two.
--
-- HOW IT IS APPLIED
--   By wrapping the deployed definition rather than transcribing it. The body of this view is forty
--   lines of joins and lateral counts; retyping it to add one predicate is how a definition quietly
--   drifts from what was actually running. The wrap keeps every column, in order, untouched.
-- ─────────────────────────────────────────────────────────────────────────────

do $m$
declare
  d text;
begin
  select pg_get_viewdef('public.v_lab_approval_queue'::regclass, true) into d;
  d := regexp_replace(d, ';\s*$', '');

  if position('current_app_role' in d) > 0 then
    raise notice '0070 · the queue is already role-scoped; leaving it alone';
  else
    execute format(
      'create or replace view public.v_lab_approval_queue as '
      'select * from (%s) q '
      'where public.current_app_role() in (''supervisor'', ''manager'', ''admin'', ''gm'')', d);
  end if;
end $m$;

comment on view public.v_lab_approval_queue is
  'Lab submissions and the decision standing on each. Management only — a supervisor, manager, '
  'admin or GM. An operator or lab technician reads nothing here, and the database is what says so, '
  'not the route guard. 0063 created it, 0069 took its stray grants back, 0070 scoped its rows.';

-- ── Assertions ───────────────────────────────────────────────────────────────

do $a$
declare
  n int;
begin
  -- 1 · The guard is actually in the deployed definition, not merely in this file.
  if position('current_app_role' in pg_get_viewdef('public.v_lab_approval_queue'::regclass, true)) = 0 then
    raise exception '0070 failed: the deployed view carries no role predicate';
  end if;

  -- 2 · 0069's invariants survived the CREATE OR REPLACE. Replacing a view is exactly the moment
  --     grants and security_invoker get quietly reset, which is why 0069's trigger exists.
  if has_table_privilege('anon', 'public.v_lab_approval_queue', 'select')
     or has_table_privilege('authenticated', 'public.v_lab_approval_queue', 'insert') then
    raise exception '0070 failed: replacing the view reopened the grants 0069 closed';
  end if;
  if coalesce((select option_value from pg_options_to_table(
        (select reloptions from pg_class where oid = 'public.v_lab_approval_queue'::regclass))
      where option_name = 'security_invoker'), 'off') <> 'on' then
    raise exception '0070 failed: the replaced view is not security_invoker';
  end if;

  -- 3 · Still readable by the people who work it.
  if not has_table_privilege('authenticated', 'public.v_lab_approval_queue', 'select') then
    raise exception '0070 failed: management can no longer read the queue';
  end if;

  select count(*) into n from pg_views where schemaname='public' and viewname='v_lab_approval_queue';
  if n <> 1 then raise exception '0070 failed: the view is missing'; end if;

  raise notice '0070 · the approval queue answers management and nobody else';
end $a$;
