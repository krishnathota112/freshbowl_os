-- ─────────────────────────────────────────────────────────────────────────────
-- 0042 · The hour axis carries half hours, because the Turner does.
--
-- THE DEFECT
--   0011 created the hour axis as `int`:
--       process_activity.standard_start_hour  int
--       process_activity.standard_end_hour    int
--       batch_activity.baseline_start_hour    int
--       batch_activity.baseline_end_hour      int
--
--   PROCESS-2026C's Turner does not run on whole hours. Twenty-four pile-passes,
--   1.5 h each, laid end to end from the H174 anchor:
--
--       P1 T0  H174   → H175.5
--       P2 T0  H175.5 → H177
--       P5 T0  H177   → H178.5
--       ...
--       P6 T3  H195.5 → H197
--
--   Sixteen of the twenty-four passes start or end on a half hour. Stored as int they
--   truncate: P2's T0 becomes H175, P1's T0 end becomes H175, and two passes that the
--   factory runs back to back become two passes that overlap by half an hour. Every
--   variance computed against that plan is wrong by up to thirty minutes, permanently,
--   because the plan freezes at activation.
--
--   The truncation is silent. `insert ... values (175.5)` into an int column rounds and
--   returns success. Nobody would see it until a supervisor asked why the Turner sheet
--   and the screen disagree.
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
--   Type only, int → numeric. A widening: every whole-hour value already stored keeps
--   its exact value, every comparison and every arithmetic expression still means what
--   it meant, and no function body needs to move.
--
--   The ONE expression that changes meaning is the rel_day constraint, because Postgres
--   integer division truncates and numeric division does not:
--
--       int      175 / 24 = 7          numeric  175.5 / 24 = 7.3125
--
--   So it becomes `floor(standard_start_hour / 24)`, which is the same rule stated in the
--   way that survives a fractional hour. On existing whole-hour rows it is a no-op —
--   asserted below rather than assumed.
--
-- THE VIEWS
--   Three views select these columns, so Postgres refuses the ALTER while they exist.
--   Their definitions are captured from pg_get_viewdef, the views dropped, the columns
--   widened, and the SAME definitions restored. Not retyped from a migration file — the
--   deployed definition is the one that gets restored, so this cannot silently roll a
--   view back to an older body. `docs/CLAUDE.md`: probe the deployed database.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  v          record;
  saved      jsonb := '[]'::jsonb;
  before_bad int;
begin
  -- ── 0 · The constraint must already hold under the new rule. ──────────────
  -- If any row today has rel_day <> floor(hour/24) the widening would be hiding a
  -- pre-existing inconsistency behind a type change. Refuse rather than paper over it.
  select count(*) into before_bad
    from public.process_activity
   where standard_start_hour is not null
     and rel_day <> floor(standard_start_hour::numeric / 24);
  if before_bad > 0 then
    raise exception
      '% process_activity row(s) already violate rel_day = floor(standard_start_hour/24). '
      'Fix the data before widening the axis — a type change must not be where an '
      'inconsistency becomes invisible.', before_bad;
  end if;

  -- ── 1 · Find every view that depends on these columns, and how deep. ──────
  --
  -- ⚠ DISCOVERED, NOT LISTED. This began as a hand-written list of the three views that
  -- depended on the columns the day it was written. `scripts/db.mjs` replays every migration on
  -- every run, so by the time 0045 had added two more the list was stale and the whole run
  -- stopped here with "cannot alter type of a column used by a view or rule" — a migration
  -- naming its own dependents is a list that goes out of date behind you.
  --
  -- `depth` is the distance from the base table, so a view built on another view is restored
  -- after the view it reads. pg_rewrite is what actually records a view's dependencies;
  -- pg_views.definition is text and would need parsing.
  create temporary table _axis_views on commit drop as
  with recursive dependents(oid, depth) as (
    select distinct r.ev_class, 1
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
     where d.refobjid in ('public.process_activity'::regclass, 'public.batch_activity'::regclass)
       and d.refobjsubid > 0
       and d.classid = 'pg_rewrite'::regclass
       and r.ev_class <> d.refobjid
    union
    select distinct r.ev_class, dep.depth + 1
      from dependents dep
      join pg_depend d on d.refobjid = dep.oid
      join pg_rewrite r on r.oid = d.objid
     where d.classid = 'pg_rewrite'::regclass
       and r.ev_class <> dep.oid
       and dep.depth < 10
  )
  select c.oid,
         n.nspname                            as schema_name,
         c.relname                            as view_name,
         max(dependents.depth)                as depth,
         pg_get_viewdef(c.oid, true)          as definition
    from dependents
    join pg_class c on c.oid = dependents.oid
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'v' and n.nspname = 'public'
   group by c.oid, n.nspname, c.relname;

  for v in select * from _axis_views order by depth loop
    saved := saved || jsonb_build_object('name', v.view_name, 'def', v.definition);
  end loop;

  -- Deepest first, and CASCADE for anything the recursion did not reach.
  for v in select * from _axis_views order by depth desc loop
    execute format('drop view if exists public.%I cascade', v.view_name);
  end loop;

  -- ── 2 · Widen. ────────────────────────────────────────────────────────────
  alter table public.process_activity
    alter column standard_start_hour type numeric,
    alter column standard_end_hour   type numeric;

  alter table public.batch_activity
    alter column baseline_start_hour type numeric,
    alter column baseline_end_hour   type numeric;

  -- ── 3 · The rel_day rule, restated so a half hour survives it. ────────────
  alter table public.process_activity
    drop constraint if exists process_activity_rel_day_derived;
  alter table public.process_activity
    add constraint process_activity_rel_day_derived check (
      standard_start_hour is null
      or rel_day = floor(standard_start_hour / 24));

  -- Half hours only. A minute-level plan is a different product, and an hour axis that
  -- silently accepts 174.37 is one where nobody can tell a reading from a rounding.
  alter table public.process_activity
    drop constraint if exists process_activity_hour_granularity;
  alter table public.process_activity
    add constraint process_activity_hour_granularity check (
      (standard_start_hour is null or (standard_start_hour * 2) = floor(standard_start_hour * 2))
      and
      (standard_end_hour   is null or (standard_end_hour   * 2) = floor(standard_end_hour   * 2)));

  -- ── 4 · Put the views back, shallowest first, exactly as they were. ───────
  for v in select * from jsonb_array_elements(saved) loop
    execute format('create view public.%I as %s', v.value->>'name', v.value->>'def');
    execute format('grant select on public.%I to authenticated', v.value->>'name');
  end loop;
end
$mig$;

comment on column public.process_activity.standard_start_hour is
  'Batch hour at which this activity starts, as the factory states it. NUMERIC since 0042: '
  'the Turner runs 1.5-hour passes and sixteen of its twenty-four start or end on a half '
  'hour. Constrained to half-hour granularity.';

comment on column public.batch_activity.baseline_start_hour is
  'The frozen plan position on the hour axis. NUMERIC since 0042 — see standard_start_hour.';
