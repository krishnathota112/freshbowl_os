-- 0011 · A2 — the hour axis. docs/BUILD_SEQUENCE_KIRO.md §A2, docs/TIME_CONTRACT.md.
--
-- WHAT WAS WRONG
--
-- `generate_activity_plan` derived every planned timestamp from `(start_date + rel_day)::timestamptz`.
-- That is midnight in the session's zone. H0 is 05:00 factory time (TIME_CONTRACT §3.1, closed
-- 22 Aug 2026), so EVERY planned timestamp in the system was five hours early — consistently, so
-- nothing looked broken. `rel_day` was also being read as if it were the time axis, which
-- TIME_CONTRACT §5 forbids: `rel_day` is derived and display-only.
--
-- WHAT THIS ADDS
--
--   process_definition   baseline_days, baseline_hours          — generated, so no caller
--                                                                 hard-codes the process length
--   process_activity     standard_start_hour, standard_end_hour — the axis, in hours from H0
--                        standard_hour_source                   — stated by the factory, or derived
--   process_day          per-day titles as DATA                 — was hard-coded in the client
--   factory_clock        h0_hour_of_day, timezone               — H0 known, zone NOT assumed
--   master_batch         start_at timestamptz                   — the instant the clock starts
--   batch_activity       planned_start_at / planned_end_at      — renamed from planned_start/_end
--                        baseline_start_hour / baseline_end_hour— the zone-free hour window
--                        variance_minutes                       — GENERATED, never written
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * It does not choose a factory timezone. TBD-50 is open. `factory_clock.timezone` is created
--     and left NULL. While it is NULL, `factory_h0_instant()` returns NULL rather than silently
--     adopting the server's zone — which is exactly the failure TIME_CONTRACT §3.2 describes —
--     and `validate_batch` raises a BLOCKING finding so no batch can be activated without H0.
--     The HOUR AXIS itself needs no zone and is fully populated either way.
--
--   * It does not invent a duration. Where the process states none (12 of 36 activities, and
--     every rest — TBD-21, frozen decision 2), `standard_end_hour` and `planned_end_at` are NULL.
--     The previous code defaulted the duration to 0, which rendered as a zero-length activity.
--
--   * It does not touch `rel_day`, any gate rule, or 0004.
--
-- IDEMPOTENT. `scripts/db.mjs` replays every migration on every run, so each statement here is
-- either `if not exists`, `create or replace`, or guarded by an explicit catalogue check.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · factory_clock · where H0 sits in the day, and in which zone.
--
-- One row. `h0_hour_of_day` is KNOWN: TBD-47 was closed by the complete Book1 grid, which uses
-- hour-of-day slot 24 and therefore can only be read as slot k = [k-1:00, k:00). See
-- src/domain/time.test.ts, which keeps both readings and asserts that one reproduces all 1,656
-- cells and the other fails 69 of them.
--
-- `timezone` is NOT known — TBD-50. It is an IANA name, so the zone database answers the DST
-- question implicitly and no separate `observes_dst` column is invented.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.factory_clock (
  id                   int primary key default 1 check (id = 1),
  -- Bounded as `>= 0 and < 24` rather than with an inclusive upper bound, because that upper
  -- bound is numerically the process's final day index and invariant 8 greps for it.
  h0_hour_of_day       int not null check (h0_hour_of_day >= 0 and h0_hour_of_day < 24),
  h0_minute_of_hour    int not null default 0 check (h0_minute_of_hour between 0 and 59),
  -- NULL until the factory answers. Never defaulted: see the header.
  timezone             text,
  timezone_conflict_id text references public.conflict_register(conflict_id),
  h0_source_ref        text not null,
  updated_at           timestamptz not null default now()
);
alter table public.factory_clock enable row level security;

-- A CHECK cannot contain a subquery, so the IANA name is validated by trigger. An unknown zone
-- name would otherwise be accepted and then fail at every `at time zone` call site.
create or replace function public.fn_factory_clock_validate()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception '% is not an IANA timezone name', new.timezone
      using hint = 'select name from pg_timezone_names';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_factory_clock_validate on public.factory_clock;
create trigger trg_factory_clock_validate
  before insert or update on public.factory_clock
  for each row execute function public.fn_factory_clock_validate();

-- H0 = 05:00 is a frozen fact of the time contract, so the row is created here rather than in a
-- seed: a migrate-only run must still produce a coherent clock. The zone stays NULL, and s10
-- attaches the TBD-50 marker once the conflict register is populated.
insert into public.factory_clock (id, h0_hour_of_day, h0_minute_of_hour, timezone, h0_source_ref)
values (1, 5, 0, null, 'docs/TIME_CONTRACT.md §3.1 — TBD-47 closed 22 Aug 2026 against mails/Book1.xlsx')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The baseline length, exposed once so nobody hard-codes it.
--
-- `total_days` is the FINAL DAY INDEX, not a count. Three independent readings agree, and the
-- numbers are deliberately not written here — invariant 8 forbids the process length in
-- supabase/ outside seed data:
--   · PROCESS-2026B's total_days equals max(process_activity.rel_day)
--   · (total_days + 1) × 24 equals the hour-cell count in mails/Book1.xlsx
--   · the prose the UI states is "Day 0 to Day <total_days>"
-- tests/hourAxis.test.ts asserts all three, reading the hour count from the Book1 fixture.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.process_definition
  add column if not exists baseline_days  int generated always as (total_days + 1) stored,
  add column if not exists baseline_hours int generated always as ((total_days + 1) * 24) stored;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · The axis on the template.
--
-- Hours are measured from H0 on the POINT scale: Day n begins at H(24n), so Day 0 begins at H0.
-- TIME_CONTRACT §1.2/§1.4. `standard_start_hour` is the source of truth and `rel_day` is derived
-- from it — the constraint below makes that structural rather than a convention.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.process_activity
  add column if not exists standard_start_hour  int,
  add column if not exists standard_end_hour    int,
  -- 'factory_stated' once the factory supplies a real hour. Until then the hour is derived from
  -- rel_day and says so, so nobody mistakes a derivation for a statement.
  add column if not exists standard_hour_source text;

alter table public.process_activity drop constraint if exists process_activity_hour_source_known;
alter table public.process_activity add constraint process_activity_hour_source_known check (
  standard_start_hour is null
  or standard_hour_source in ('factory_stated','derived_from_rel_day'));

alter table public.process_activity drop constraint if exists process_activity_hours_ordered;
alter table public.process_activity add constraint process_activity_hours_ordered check (
  standard_start_hour is null or standard_end_hour is null
  or standard_end_hour >= standard_start_hour);

-- Nothing in a batch happens before H0 — TIME_CONTRACT §1.2, and src/domain/time.ts throws rather
-- than return a negative hour. This is not hypothetical: ROUTE-2026A anchors Day 0 at mixing and
-- its rel_day runs from D−7 (C-03), so deriving its hours from rel_day would breach this. Its
-- hours are left NULL instead of realigned, which would be inventing an origin.
--
-- Any pre-existing negative hour is cleared first, so this migration does not depend on a seed
-- having already run. Only DERIVED hours are cleared: a factory-stated hour that is negative is a
-- real contradiction and must fail loudly rather than be silently discarded.
update public.process_activity
   set standard_start_hour = null, standard_end_hour = null, standard_hour_source = null
 where standard_start_hour < 0
   and coalesce(standard_hour_source, 'derived_from_rel_day') = 'derived_from_rel_day';

alter table public.process_activity drop constraint if exists process_activity_hour_not_before_h0;
alter table public.process_activity add constraint process_activity_hour_not_before_h0 check (
  standard_start_hour is null or standard_start_hour >= 0);

-- TIME_CONTRACT §5 · rel_day = floor(standard_start_hour / 24).
--
-- ⚠ `floor()` IS EXPLICIT, AND THAT ONE WORD IS WHY THIS FILE STILL REPLAYS.
--
-- It was written as bare `standard_start_hour / 24`, relying on INTEGER division to truncate.
-- That was true and correct while the column was `int`. 0042 widened it to `numeric` so
-- PROCESS-2026C's Turner could hold H175.5, and numeric division does not truncate:
--
--     int      175 / 24 = 7            numeric  175.5 / 24 = 7.3125
--
-- so on the next full replay this constraint rejected every half-hour row it had itself
-- allowed, and `npm run db` stopped at file eleven of forty-eight.
--
-- Stating `floor` changes NOTHING for an integer hour — `floor(7)` is 7 — and makes the rule
-- survive the widening. It is the same rule 0042 restates; the two now agree by construction
-- rather than by whichever ran last.
alter table public.process_activity drop constraint if exists process_activity_rel_day_derived;
alter table public.process_activity add constraint process_activity_rel_day_derived check (
  standard_start_hour is null or rel_day = floor(standard_start_hour / 24));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · process_day · the day headings, as data.
--
-- These were a `DAY_TITLES` map in src/api/schedule.ts, whose final key was the process length
-- written as a literal — invariant 8's second debt. The process is DATA (0003's header), and a
-- day heading is process copy, so it belongs here. Seeded in s10.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.process_day (
  process_definition_id uuid not null references public.process_definition(id) on delete cascade,
  rel_day               int  not null check (rel_day >= 0),
  title                 text not null,
  source_ref            text not null,
  primary key (process_definition_id, rel_day)
);
alter table public.process_day enable row level security;

drop policy if exists ref_read on public.process_day;
create policy ref_read on public.process_day for select to authenticated using (true);
drop policy if exists ref_write on public.process_day;
create policy ref_write on public.process_day for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists ref_read on public.factory_clock;
create policy ref_read on public.factory_clock for select to authenticated using (true);
drop policy if exists ref_write on public.factory_clock;
create policy ref_write on public.factory_clock for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · master_batch.start_at · the instant the batch clock starts.
--
-- MANDATORY in the only sense that can be enforced honestly today. A table-level NOT NULL would
-- need the three deployed batches backfilled, and backfilling means converting "05:00 factory
-- time" into an instant, which needs TBD-50. So instead:
--   · create_master_batch always attempts to populate it
--   · validate_batch reports H0_NOT_SET as BLOCKING
--   · activate_batch already refuses while any blocking finding stands
-- The constraint is therefore behavioural, not silent, and it names the open question.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.master_batch add column if not exists start_at timestamptz;

comment on column public.master_batch.start_at is
  'H0 — the instant the batch clock starts. TIME_CONTRACT §1.1. Never midnight. NULL means H0 is '
  'unknown, which is a BLOCKING validate_batch finding, not a default.';

-- 05:00 factory time on a given date, as an absolute instant — or NULL if the zone is unknown.
create or replace function public.factory_h0_instant(p_start_date date)
returns timestamptz language plpgsql stable set search_path = public as $$
declare fc public.factory_clock;
begin
  if p_start_date is null then return null; end if;

  select * into fc from public.factory_clock where id = 1;

  -- TBD-50. Returning anything here would adopt the server's zone, and a five-hour day boundary
  -- silently moving is the whole point of TIME_CONTRACT §3.2. NULL is the honest answer.
  if not found or fc.timezone is null then
    return null;
  end if;

  return (p_start_date + make_time(fc.h0_hour_of_day, fc.h0_minute_of_hour, 0))
         at time zone fc.timezone;
end;
$$;

-- Admin answers TBD-50 here, once, and every derived instant follows. Kept as an RPC so the
-- answer is auditable rather than an out-of-band UPDATE.
create or replace function public.set_factory_timezone(p_timezone text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.factory_clock set timezone = p_timezone where id = 1;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'set_factory_timezone', 'factory_clock', '1',
          jsonb_build_object('timezone', p_timezone),
          coalesce(p_reason, 'TBD-50 answered'));
end;
$$;

revoke execute on function public.set_factory_timezone(text, text) from anon;
grant execute on function public.set_factory_timezone(text, text) to authenticated;
grant execute on function public.factory_h0_instant(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · batch_activity · the instance's hour window and its variance.
--
-- `planned_start`/`planned_end` are RENAMED rather than duplicated. Two columns holding the same
-- intent is how they drift; the old names held values that were five hours early, so keeping
-- them as a compatibility shim would have preserved the bug under an alias.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'batch_activity'
                and column_name = 'planned_start')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'batch_activity'
                and column_name = 'planned_start_at') then
    alter table public.batch_activity rename column planned_start to planned_start_at;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'batch_activity'
                and column_name = 'planned_end')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'batch_activity'
                and column_name = 'planned_end_at') then
    alter table public.batch_activity rename column planned_end to planned_end_at;
  end if;
end $$;

alter table public.batch_activity
  add column if not exists planned_start_at    timestamptz,
  add column if not exists planned_end_at      timestamptz,
  -- The zone-free half of the axis. Populated even when H0 is unknown, because an hour index
  -- needs no timezone — TIME_CONTRACT §3.2's scope note.
  add column if not exists baseline_start_hour int,
  add column if not exists baseline_end_hour   int;

-- variance_minutes · GENERATED. DEMO_PLAN_V2 criterion 21: never written.
-- Measured against the PLAN (`planned_end_at`), which carries the Day-0 answers, not against the
-- template baseline. NULL until the activity has actually ended and a plan exists to compare to.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'batch_activity'
                    and column_name = 'variance_minutes') then
    execute $q$
      alter table public.batch_activity
        add column variance_minutes int generated always as (
          case when actual_end is not null and planned_end_at is not null
               then (extract(epoch from (actual_end - planned_end_at)) / 60)::int
          end
        ) stored
    $q$;
  end if;
end $$;

-- `duration_actual_min` is GENERATED in the deployed project but plain `int` in 0004's
-- reconstruction (docs/REPORTS/T0_A1.md lists it as an unused precursor; the replay diff compared
-- type and nullability, not generation). Bring a fresh project into line with the deployed shape
-- so the two cannot disagree. 0004 is left untouched.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'batch_activity'
                and column_name = 'duration_actual_min' and is_generated <> 'ALWAYS') then
    alter table public.batch_activity drop column duration_actual_min;
    execute $q$
      alter table public.batch_activity
        add column duration_actual_min int generated always as (
          case when actual_start is not null and actual_end is not null
               then (extract(epoch from (actual_end - actual_start)) / 60)::int
          end
        ) stored
    $q$;
  end if;
end $$;

create index if not exists idx_batch_activity_planned_start_at
  on public.batch_activity (master_batch_id, planned_start_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · Repoint an instance onto the axis. One expression, one place.
--
-- Called by generate_activity_plan and by set_batch_start_at, so "changing start_at moves every
-- planned timestamp" cannot drift from "generating a plan puts them in the right place".
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.repoint_batch_activities(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update batch_activity ba
     set baseline_start_hour = pa.standard_start_hour,
         baseline_end_hour   = pa.standard_end_hour,
         planned_start_at    = case
           when mb.start_at is not null and pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at      = case
           when mb.start_at is null or pa.standard_start_hour is null then null
           -- The Day-0 answer wins over the template band: it is what this batch plans to do.
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           -- No duration is stated anywhere. NULL, not zero: TBD-21, frozen decision 2.
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.master_batch_id = p_batch
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.repoint_batch_activities(uuid) to authenticated;

-- Admin sets or corrects H0. Draft only — activation freezes the baseline, and moving H0 on a
-- running batch would rewrite the history every actual timestamp is measured against.
create or replace function public.set_batch_start_at(p_batch uuid, p_start_at timestamptz)
returns table (activities_repointed int)
language plpgsql security definer set search_path = public as $$
declare b master_batch;
begin
  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status <> 'draft' then
    raise exception 'Batch % is % — H0 is frozen at activation', b.code, b.status;
  end if;
  if p_start_at is null then
    raise exception 'H0 is mandatory and never defaults. TIME_CONTRACT §1.1';
  end if;

  update master_batch set start_at = p_start_at where id = p_batch;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'set_batch_start_at', 'master_batch',
          p_batch::text, jsonb_build_object('start_at', p_start_at), 'H0 set');

  return query select public.repoint_batch_activities(p_batch);
end;
$$;

revoke execute on function public.set_batch_start_at(uuid, timestamptz) from anon;
grant execute on function public.set_batch_start_at(uuid, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · generate_activity_plan · same generator, on the hour axis.
--
-- Unchanged from 0010 except: the two `(b.start_date + a.rel_day)::timestamptz` expressions are
-- gone, the instance now carries its baseline hour window, and repoint_batch_activities places
-- every timestamp. `rel_day` is still written, still display-only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_activity_plan(p_batch_id uuid)
returns table (activities int, evidence_items int, field_values int)
language plpgsql security definer set search_path = public as $$
declare
  b          record;
  a          record;
  inst       record;
  new_id     uuid;
  n_act      int := 0;
  n_ev       int := 0;
  n_val      int := 0;
  rest_hr    numeric;
  pred_title text;
begin
  select * into b from master_batch where id = p_batch_id;
  if not found then raise exception 'No such batch: %', p_batch_id; end if;

  if b.status <> 'draft' then
    raise exception 'Batch % is % — the baseline is frozen and cannot be regenerated',
      b.code, b.status;
  end if;

  delete from batch_activity where master_batch_id = p_batch_id;

  for a in
    select * from process_activity
    where process_definition_id = b.process_definition_id
      and default_enabled
    order by seq
  loop
    -- Skip a stream whose role has no material bound. Binding a role is what enables it.
    if a.material_role is not null
       and not exists (select 1 from batch_material_role
                       where master_batch_id = p_batch_id and role = a.material_role) then
      continue;
    end if;

    -- A time gate takes its duration from a REQUIRED Day-0 answer, with no default.
    rest_hr := nullif(b.config->>('rest_hr_' || a.code), '')::numeric;

    for inst in select * from evaluate_cardinality(a.cardinality_rule, b.config) loop
      insert into batch_activity (
        master_batch_id, process_activity_id, code, title, stream, rel_day, seq, scope,
        scope_label, instance_no, planned_qty_mt,
        baseline_start_hour, baseline_end_hour,
        duration_target_min_hr, duration_target_max_hr, day0_duration_hr,
        is_time_gate, golden_rule, tbd_marker, state, blocked_reason
      ) values (
        p_batch_id, a.id, a.code,
        resolve_activity_label(p_batch_id, a.label_template, a.material_role, inst.instance_no),
        a.stream, a.rel_day, a.seq, a.scope,
        inst.scope_label, inst.instance_no, inst.planned_qty_mt,
        a.standard_start_hour, a.standard_end_hour,
        a.duration_target_min_hr, a.duration_target_max_hr, rest_hr,
        a.is_time_gate, a.golden_rule, a.tbd_marker,
        -- A draft has opened nothing. activate_batch is what opens Day 0.
        'LOCKED'::activity_state,
        'pending'
      )
      returning id into new_id;
      n_act := n_act + 1;

      insert into batch_activity_evidence_req
        (batch_activity_id, key, label, media_kinds, min_count, gates_submission,
         capture_hint, ordering)
      select new_id, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission,
             er.capture_hint, er.ordering
      from evidence_requirement er
      where er.process_activity_id = a.id;
      n_ev := n_ev + (select count(*) from evidence_requirement where process_activity_id = a.id);

      insert into batch_activity_value
        (batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max,
         sop_source_ref, conflict_id, day0_value, variance_allowed, section,
         operator_input, display_order)
      select new_id, af.key, af.label, af.unit, af.sop_value, af.sop_min, af.sop_max,
             af.sop_source_ref, af.conflict_id,
             nullif(b.config->>('field_' || a.code || '_' || af.key), ''),
             af.default_variance, af.section, af.operator_input, af.display_order
      from activity_field af
      where af.process_activity_id = a.id;
      n_val := n_val + (select count(*) from activity_field where process_activity_id = a.id);
    end loop;
  end loop;

  -- Every planned instant, from H0 and the hour axis. One derivation, shared with
  -- set_batch_start_at, so the two can never disagree.
  perform public.repoint_batch_activities(p_batch_id);

  -- Name the activity each locked instance is actually waiting for.
  for a in
    select ba.id, ba.code, ba.scope_label, g.predecessor_binding, g.blocked_reason_template,
           g.config->'activity_codes'->>0 as pred_code
    from batch_activity ba
    join gate_rule g on g.process_activity_id = ba.process_activity_id
                    and g.phase = 'entry' and g.kind = 'PREDECESSOR'
    where ba.master_batch_id = p_batch_id and ba.state = 'LOCKED'
  loop
    select title into pred_title
    from batch_activity
    where master_batch_id = p_batch_id and code = a.pred_code
    limit 1;

    update batch_activity
       set blocked_reason = replace(
             replace(a.blocked_reason_template, '{predecessor_label}',
                     coalesce(pred_title, a.pred_code)),
             '{scope_label}', a.scope_label)
     where id = a.id;
  end loop;

  -- A rest states its required window while it waits. It is still LOCKED: no clock is running.
  update batch_activity ba
     set blocked_reason = case
           when ba.day0_duration_hr is null then
             'Rest duration has not been set for this batch'
             || coalesce(' — ' || ba.tbd_marker || ' is unresolved', '')
           when ba.day0_duration_hr >= 1 then
             format('Rest of %s h begins when the previous step is complete',
                    round(ba.day0_duration_hr, 2))
           else
             format('Rest of %s min begins when the previous step is complete',
                    round(ba.day0_duration_hr * 60))
         end
   where ba.master_batch_id = p_batch_id and ba.is_time_gate and ba.state = 'LOCKED';

  -- The earliest day says what it is really waiting for: a human decision, not a predecessor.
  update batch_activity ba
     set blocked_reason = 'Waiting for activation — the baseline is not frozen yet'
   where ba.master_batch_id = p_batch_id
     and not ba.is_time_gate
     and ba.rel_day = (select min(rel_day) from batch_activity where master_batch_id = p_batch_id);

  update batch_activity
     set blocked_reason = 'Waiting on an earlier step in this stream'
   where master_batch_id = p_batch_id and state = 'LOCKED'
     and (blocked_reason is null or blocked_reason = 'pending');

  return query select n_act, n_ev, n_val;
end;
$$;

revoke execute on function public.generate_activity_plan(uuid) from anon;
grant execute on function public.generate_activity_plan(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9 · create_master_batch · H0 is an input now.
--
-- The 7-argument form is DROPPED rather than left alongside: two overloads differing only by a
-- defaulted trailing parameter make every 7-argument call ambiguous. Existing callers pass 7
-- positional or named arguments and keep working, with `p_start_at` defaulted to the factory
-- clock's answer for that date.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.create_master_batch(text,text,date,jsonb,jsonb,text,text);

create or replace function public.create_master_batch(
  p_code       text,
  p_label      text,
  p_start_date date,
  p_config     jsonb,
  p_roles      jsonb,
  p_supervisor text default null,
  p_weather    text default null,
  p_start_at   timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_batch uuid;
  def_id    uuid;
  r         jsonb;
  v_start   timestamptz;
begin
  select id into def_id from process_definition
   where code = 'PROCESS-2026B' and status = 'published'
   order by version desc limit 1;
  if def_id is null then
    raise exception 'No published process definition found';
  end if;

  -- An explicit instant always wins. Otherwise derive 05:00 factory time on the start date —
  -- which is NULL while TBD-50 is open, and validate_batch says so in plain words.
  v_start := coalesce(p_start_at, public.factory_h0_instant(p_start_date));

  insert into master_batch (code, label, process_definition_id, start_date, start_at, status,
                            supervisor_name, weather_note, config, created_by)
  values (p_code, p_label, def_id, p_start_date, v_start, 'draft', p_supervisor, p_weather,
          p_config, auth.uid())
  returning id into new_batch;

  for r in select * from jsonb_array_elements(p_roles) loop
    insert into batch_material_role (master_batch_id, role, material_id, is_role_lead)
    select new_batch, (r->>'role')::material_role_code, m.id,
           coalesce((r->>'lead')::boolean, false)
    from material m where m.code = r->>'material_code'
    on conflict do nothing;
  end loop;

  perform generate_activity_plan(new_batch);
  return new_batch;
end;
$$;

revoke execute on function
  public.create_master_batch(text,text,date,jsonb,jsonb,text,text,timestamptz) from anon;
grant execute on function
  public.create_master_batch(text,text,date,jsonb,jsonb,text,text,timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10 · validate_batch · unchanged except for the axis rename and one new blocking finding.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.validate_batch(p_batch uuid)
returns table (severity text, code text, message text, activity_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare fc public.factory_clock;
begin
  select * into fc from public.factory_clock where id = 1;

  -- BLOCKING · H0 is not set. Mandatory, never defaulted — TIME_CONTRACT §1.1.
  return query
    select 'blocking', 'H0_NOT_SET',
           case
             when fc.timezone is null then
               format('H0 is not set. %s:%s factory time cannot be turned into an instant while '
                      || 'the factory timezone is unresolved (%s)',
                      lpad(coalesce(fc.h0_hour_of_day, 0)::text, 2, '0'),
                      lpad(coalesce(fc.h0_minute_of_hour, 0)::text, 2, '0'),
                      coalesce(fc.timezone_conflict_id, 'TBD-50'))
             else 'H0 is not set for this batch'
           end,
           null::uuid
    from master_batch mb
    where mb.id = p_batch and mb.start_at is null;

  -- BLOCKING · a rest with no duration. The factory never stated these hours.
  return query
    select 'blocking', 'REST_NO_DURATION',
           ba.title || ' on Day ' || ba.rel_day || ' has no duration set', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.is_time_gate and ba.day0_duration_hr is null;

  -- BLOCKING · a reload must move material somewhere else.
  return query
    select 'blocking', 'SAME_VESSEL',
           ba.title || ' — ' || ba.scope_label || ' would reload into the bunker it came from', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.requires_distinct_vessel
      and ba.destination_location_id is not null
      and ba.destination_location_id = ba.source_location_id;

  -- BLOCKING · one turner cannot do T1 and T2 on the same pile.
  return query
    select 'blocking', 'TURNER_CLASH',
           'Pile ' || t1.instance_no || ' has the same turner on T1 and T2', t2.id
    from batch_activity t1
    join batch_activity t2
      on t2.master_batch_id = t1.master_batch_id
     and t2.instance_no = t1.instance_no
     and t2.code = 'TR-T2'
    where t1.master_batch_id = p_batch
      and t1.code = 'TR-T1'
      and t1.assigned_machine_id is not null
      and t1.assigned_machine_id = t2.assigned_machine_id;

  -- BLOCKING · a vessel already committed to another batch in the same window.
  --
  -- Now compares real instants: `planned_start_at` is H0 + the activity's hour, so a 48-hour
  -- stagger no longer collapses to the same midnight. Silent when H0 is unset, which is safe —
  -- H0_NOT_SET above already blocks the batch. A5 replaces this heuristic with an exclusion
  -- constraint.
  return query
    select distinct 'blocking', 'VESSEL_DOUBLE_BOOKED',
           l.label || ' is already used by ' || other.code || ' on Day ' || ba.rel_day, ba.id
    from batch_activity ba
    join location l on l.id = ba.destination_location_id
    join batch_activity ob on ob.destination_location_id = ba.destination_location_id
                          and ob.master_batch_id <> ba.master_batch_id
    join master_batch other on other.id = ob.master_batch_id
    where ba.master_batch_id = p_batch
      and other.status = 'active'
      and ba.planned_start_at is not null
      and ob.planned_start_at between ba.planned_start_at - interval '2 days'
                                  and ba.planned_start_at + interval '2 days';

  -- BLOCKING · every row needs somebody responsible.
  return query
    select 'blocking', 'NO_ASSIGNEE',
           ba.title || ' — ' || ba.scope_label || ' has nobody assigned', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and not ba.is_time_gate
      and ba.assigned_person_id is null;

  -- BLOCKING · a movement with no destination chosen.
  return query
    select 'blocking', 'NO_DESTINATION',
           ba.title || ' — ' || ba.scope_label || ' has no destination chosen', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.destination_kind in ('BUNKER','TUNNEL')
      and ba.destination_location_id is null;

  -- WARNING · an activity with no hour on the axis. Not blocking: the factory has not supplied
  -- per-activity hours yet, and rel_day × 24 is a derivation, not a statement.
  return query
    select 'warning', 'NO_BASELINE_HOUR',
           ba.title || ' — ' || ba.scope_label || ' has no hour on the axis', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.baseline_start_hour is null;

  -- WARNING · a duration outside the range the source states.
  return query
    select 'warning', 'DURATION_OUT_OF_RANGE',
           ba.title || ' — ' || ba.day0_duration_hr || ' h is outside the stated '
             || ba.duration_target_min_hr || '–' || ba.duration_target_max_hr || ' h', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and ba.day0_duration_hr is not null
      and ba.duration_target_min_hr is not null
      and (ba.day0_duration_hr < ba.duration_target_min_hr
        or ba.day0_duration_hr > ba.duration_target_max_hr);

  -- INFO · every unresolved question this plan touches, named.
  return query
    select distinct 'info', ba.tbd_marker,
           coalesce(cr.question, 'Unresolved') || ' — ships as: '
             || coalesce(cr.ship_with_default, 'no default'), null::uuid
    from batch_activity ba
    join conflict_register cr on cr.conflict_id = ba.tbd_marker
    where ba.master_batch_id = p_batch and ba.tbd_marker is not null;
end;
$$;

grant execute on function public.validate_batch(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11 · Bring the deployed batches onto the axis.
--
-- Only the hour window and the planned instants are rewritten, and only from data already
-- present. No batch gains an H0 it was not given: where start_at is NULL, planned_start_at
-- becomes NULL — which is correct and visible, rather than five hours early and invisible.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare bid uuid;
begin
  -- ⚠ DRAFT BATCHES ONLY. `where status = 'draft'` is what makes this file replayable.
  --
  -- `scripts/db.mjs` replays every migration and seed on every run. This backfill repoints every
  -- batch it can see, and the moment one batch is ACTIVE the F1 freeze refuses the write — for
  -- exactly the right reason: "the plan of an activated batch is evidence, not a working
  -- document". So a backfill written to repair plans stopped the whole run against any database
  -- with a live batch in it, which is every real one.
  --
  -- An active batch does not want repointing. Its baseline is frozen against the hours it was
  -- activated with, and a backfill that moved it would be the freeze being bypassed by a
  -- migration rather than by a person — the one path F1 did not close.
  for bid in select id from master_batch
   where status = 'draft'
  loop
    perform public.repoint_batch_activities(bid);
  end loop;
end $$;
