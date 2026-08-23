-- 0021 · Resources as constrained objects.  (A5 · K5)
-- docs/BUILD_SEQUENCE_KIRO.md §A5, docs/RESOURCE_MOVEMENT_MODEL.md §2 · §appendix,
-- docs/DEMO_PLAN_V2.md criteria 16 · 19 · 20.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE POINT: THE DATABASE REFUSES, NOT THE FORM
--
-- `btree_gist` has been installed since `0001` for exactly this and was never used. A vessel or a
-- machine committed twice over the same window is not a validation warning to be rendered — it is a
-- row that CANNOT EXIST. Criterion 16 is explicit: the turner clash is "refused by the
-- `machine_usage` exclusion constraint, not by the form".
--
-- That moves the protection from validate-time guessing to write-time impossibility, which is why
-- §A5 says to REPLACE `validate_batch`'s ±2-day heuristic rather than to keep both.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT DECIDE — TBD-28, TBD-29, TBD-33
--
-- §A5: "Blocked on TBD-28 / TBD-29 / TBD-33. Model both readings as configuration; do not choose."
--
--   TBD-28  How many bunkers does paddy occupy, and for how long? `RESOURCE_MOVEMENT_MODEL` §
--           appendix: "If paddy holds a bunker for Days 5–7, the effective bunker pool for compost
--           shrinks by one per batch — which materially changes conflict detection."
--   TBD-29  Is a source bunker released at the START of the unload or at the END of the reload?
--           "Over ~5 hours with ~11 bunkers and ~10 concurrent batches this is not academic."
--   TBD-33  Real fleet size. Not modelled as a policy at all — the fleet is `machine` rows, and the
--           constraints below work against whatever fleet exists. Inventing turners to make T1‖T2
--           satisfiable is exactly what rule 2 forbids.
--
-- So `resource_policy` carries BOTH readings of TBD-28 and BOTH of TBD-29 as rows, every one
-- `is_enabled = false`, and `occupancy_window()` REFUSES to compute a window while the question it
-- depends on is unanswered. Nothing defaults. A batch does not silently acquire a bunker-release rule
-- because a migration picked one.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Both readings of each open question, as data.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.resource_policy (
  id           uuid primary key default gen_random_uuid(),
  question_id  text not null references public.conflict_register(conflict_id),
  reading_code text not null,
  statement    text not null,
  source_ref   text not null,
  -- Consequence if this reading is adopted. Recorded so the choice is made with its cost visible.
  consequence  text not null,
  is_enabled   boolean not null default false,
  unique (question_id, reading_code)
);
alter table public.resource_policy enable row level security;

drop policy if exists resource_policy_read on public.resource_policy;
create policy resource_policy_read on public.resource_policy
  for select to authenticated using (true);
revoke insert, update, delete on public.resource_policy from authenticated, anon;

-- AT MOST ONE reading of a question may be enabled. Two enabled readings is the state where the
-- system has silently chosen, which is the thing this table exists to prevent.
create unique index if not exists uq_resource_policy_one_enabled
  on public.resource_policy (question_id) where is_enabled;

insert into public.resource_policy (question_id, reading_code, statement, source_ref, consequence)
values
  ('TBD-28', 'PADDY_HOLDS_BUNKER',
   'Paddy occupies a bunker exclusively for the duration of its soak, so a paddy occupancy blocks a '
     || 'compost occupancy of the same bunker.',
   'RESOURCE_MOVEMENT_MODEL §2 — "Bunkers therefore serve two streams and a paddy occupancy blocks a '
     || 'compost occupancy exactly the same way."',
   'The effective bunker pool for compost shrinks by one per concurrent batch. Conflict detection '
     || 'becomes materially stricter.'),
  ('TBD-28', 'PADDY_SHARES_BUNKER',
   'Paddy is stored in a bunker without holding it exclusively, so a paddy occupancy does not block a '
     || 'compost occupancy.',
   'The dictation says paddy is stored in *a* bunker during soaking, without stating exclusivity.',
   'The bunker pool is unchanged, and a real clash between a soak and a compost fill would go '
     || 'undetected.'),
  ('TBD-29', 'RELEASE_AT_UNLOAD_START',
   'The source bunker is released when the unload begins.',
   'RESOURCE_MOVEMENT_MODEL appendix, TBD-29',
   'The bunker is available ~5 hours earlier. If material is in fact still in it, two batches can be '
     || 'recorded in one bunker.'),
  ('TBD-29', 'RELEASE_AT_RELOAD_END',
   'The source bunker is held until the reload completes.',
   'RESOURCE_MOVEMENT_MODEL appendix, TBD-29',
   'Safe, but each batch holds a bunker ~5 hours longer, which tightens the pool across ~10 '
     || 'concurrent batches.')
on conflict (question_id, reading_code) do update set
  statement = excluded.statement,
  source_ref = excluded.source_ref,
  consequence = excluded.consequence;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · `machine_usage` — a stint. One machine, one activity, one window.
--
-- THE SHAPE IS ALREADY FIXED. `evaluate_gates`' `MACHINE_STINT_CLOSED` branch has read
-- `mu.batch_activity_id` and `mu.ended_at is null` since 0012, behind a check for this table's
-- existence. Those two columns are a contract with the gate engine, not a choice made here — and
-- 38 enabled `dictated` exit rules start biting the moment this table appears.
--
-- `during` is GENERATED, so the window cannot disagree with the timestamps it is built from, and an
-- OPEN stint (`ended_at` null) becomes an unbounded upper range — the machine is still busy, and it
-- blocks everything after it. That is the correct reading, not a gap.
--
-- CRITERION 20 · "Machine utilisation for the batch is derived entirely from `machine_usage` — no
-- editable hours field exists anywhere in the schema." There is no `hours` column here. Duration is
-- generated from the window, and `v_machine_utilisation` sums it. Nothing writes an hour.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.machine_usage (
  id                uuid primary key default gen_random_uuid(),
  machine_id        uuid not null references public.machine(id),
  master_batch_id   uuid not null references public.master_batch(id) on delete cascade,
  batch_activity_id uuid not null references public.batch_activity(id) on delete cascade,
  started_at        timestamptz not null,
  -- NULL means the stint is still open. `MACHINE_STINT_CLOSED` fails while it is.
  ended_at          timestamptz,
  opened_by         uuid references public.profiles(id),
  closed_by         uuid references public.profiles(id),
  constraint machine_usage_ends_after_start check (ended_at is null or ended_at >= started_at),
  during            tstzrange generated always as (tstzrange(started_at, ended_at)) stored,
  -- DERIVED, never written. Criterion 20.
  minutes           int generated always as (
    case when ended_at is null then null
         else (extract(epoch from (ended_at - started_at)) / 60)::int end) stored
);
alter table public.machine_usage enable row level security;

-- ⚠ CRITERION 16 LIVES HERE. One machine cannot be in two places over the same window, so
-- assigning one turner to T1 and T2 on the same pile is not a validation finding — the second stint
-- is UNWRITABLE.
alter table public.machine_usage drop constraint if exists machine_usage_no_overlap;
alter table public.machine_usage
  add constraint machine_usage_no_overlap
  exclude using gist (machine_id with =, during with &&);

create index if not exists idx_machine_usage_activity on public.machine_usage (batch_activity_id);
create index if not exists idx_machine_usage_open
  on public.machine_usage (machine_id) where ended_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · `location_occupancy` — a vessel held, by one batch, over one window.
--
-- CRITERION 19 · "Storing paddy in Bunker 4 blocks a compost occupancy of Bunker 4 in the same
-- window." The exclusion constraint does not care which stream is asking: a bunker is a bunker.
-- `RESOURCE_MOVEMENT_MODEL §2` — "a paddy occupancy blocks a compost occupancy exactly the same way."
--
-- `stream` and `material_state` are recorded because §2's occupancy record carries them and because
-- the Gantt renders one column per stream. They do NOT weaken the constraint.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.location_occupancy (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references public.location(id),
  master_batch_id   uuid not null references public.master_batch(id) on delete cascade,
  batch_activity_id uuid references public.batch_activity(id) on delete set null,
  stream            stream_code,
  material_state    text,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  -- The open question this occupancy's window depends on, if any. Never null-and-forgotten: if a
  -- window was computed under an unanswered reading, the row says which one.
  policy_id         uuid references public.resource_policy(id),
  tbd_marker        text,
  constraint location_occupancy_ends_after_start check (ended_at is null or ended_at >= started_at),
  during            tstzrange generated always as (tstzrange(started_at, ended_at)) stored
);
alter table public.location_occupancy enable row level security;

alter table public.location_occupancy drop constraint if exists location_occupancy_no_overlap;
alter table public.location_occupancy
  add constraint location_occupancy_no_overlap
  exclude using gist (location_id with =, during with &&);

create index if not exists idx_location_occupancy_batch
  on public.location_occupancy (master_batch_id, started_at);

do $$
declare t text;
begin
  foreach t in array array['machine_usage','location_occupancy'] loop
    execute format('drop policy if exists resource_read on public.%I', t);
    execute format(
      'create policy resource_read on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Opening and closing a machine stint.
--
-- SECURITY DEFINER, so the exclusion violation comes back as a stated refusal rather than a raw
-- constraint name. The constraint is still what refuses — this only translates it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.open_machine_stint(
  p_activity uuid,
  p_at       timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ba   batch_activity;
  m    machine;
  at_  timestamptz;
  new_id uuid;
  clash  record;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  if ba.assigned_machine_id is null then
    raise exception '% has no machine assigned, so there is no stint to open', ba.title;
  end if;
  select * into m from machine where id = ba.assigned_machine_id;

  -- Same rule as a recorded actual: not in the future, not before H0. Consistent with 0016/0017
  -- rather than a second opinion about time.
  at_ := coalesce(p_at, ba.actual_start, now());
  if at_ > now() then
    raise exception 'A stint cannot start in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  begin
    insert into machine_usage (machine_id, master_batch_id, batch_activity_id, started_at, opened_by)
    values (m.id, ba.master_batch_id, ba.id, at_, auth.uid())
    returning id into new_id;
  exception when exclusion_violation then
    -- The constraint refused. Name the other commitment so the message is actionable.
    select mu.id, other.title, other.scope_label, mu.started_at, mu.ended_at
      into clash
      from machine_usage mu
      join batch_activity other on other.id = mu.batch_activity_id
     where mu.machine_id = m.id and mu.during && tstzrange(at_, null)
     order by mu.started_at limit 1;
    raise exception
      '% is already committed to % (%) %. One machine cannot be in two places at once.',
      m.code, clash.title, clash.scope_label,
      case when clash.ended_at is null
           then 'from ' || clash.started_at || ' onwards, still open'
           else 'from ' || clash.started_at || ' to ' || clash.ended_at end
      using errcode = 'exclusion_violation';
  end;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'open_machine_stint', 'machine_usage', new_id::text,
          jsonb_build_object('machine', m.code, 'activity', ba.title, 'started_at', at_),
          m.code || ' started on ' || ba.title);
  return new_id;
end;
$$;

create or replace function public.close_machine_stint(
  p_activity uuid,
  p_at       timestamptz default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  ba  batch_activity;
  at_ timestamptz;
  n   int;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  at_ := coalesce(p_at, ba.actual_end, now());
  if at_ > now() then
    raise exception 'A stint cannot end in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  update machine_usage mu
     set ended_at = at_, closed_by = auth.uid()
   where mu.batch_activity_id = p_activity and mu.ended_at is null
     and at_ >= mu.started_at;
  get diagnostics n = row_count;

  if n > 0 then
    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
    values (auth.uid(), public.current_app_role(), 'close_machine_stint', 'batch_activity',
            p_activity::text, 'Machine stint closed on ' || ba.title);
  end if;
  return n;
end;
$$;

revoke execute on function public.open_machine_stint(uuid, timestamptz) from anon;
revoke execute on function public.close_machine_stint(uuid, timestamptz) from anon;
grant execute on function public.open_machine_stint(uuid, timestamptz) to authenticated;
grant execute on function public.close_machine_stint(uuid, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Recording a vessel occupancy — and refusing to when the rule is unanswered.
--
-- This is where TBD-28 and TBD-29 bite. A window needs a release rule, and no release rule has been
-- stated. So: if the caller supplies an explicit window, it is recorded with the constraint enforcing
-- it. If the caller asks the system to DERIVE one, it refuses and names the question.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.enabled_policy(p_question text)
returns public.resource_policy language sql stable as $$
  select * from public.resource_policy where question_id = p_question and is_enabled limit 1;
$$;

create or replace function public.record_occupancy(
  p_activity uuid,
  p_from     timestamptz,
  p_to       timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ba     batch_activity;
  l      location;
  new_id uuid;
  clash  record;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  if ba.destination_location_id is null then
    raise exception '% has no destination, so there is no vessel to occupy', ba.title;
  end if;
  select * into l from location where id = ba.destination_location_id;

  if p_from is null then
    raise exception
      'A window is required. Deriving one needs the bunker release rule, and that is unanswered — '
      'TBD-29 asks whether the source bunker is released at the start of the unload or at the end of '
      'the reload. Both readings are in resource_policy; neither is enabled.'
      using errcode = 'feature_not_supported';
  end if;

  begin
    insert into location_occupancy (
      location_id, master_batch_id, batch_activity_id, stream, started_at, ended_at, tbd_marker)
    values (l.id, ba.master_batch_id, ba.id, ba.stream, p_from, p_to,
            -- The row carries the question its window depends on, so a later reader knows the
            -- boundary was chosen by a caller and not derived from a stated rule.
            case when p_to is null then 'TBD-29' else null end)
    returning id into new_id;
  exception when exclusion_violation then
    select other.code as batch_code, oc.started_at, oc.ended_at
      into clash
      from location_occupancy oc
      join master_batch other on other.id = oc.master_batch_id
     where oc.location_id = l.id and oc.during && tstzrange(p_from, p_to)
     order by oc.started_at limit 1;
    raise exception
      '% is already held by % %. A bunker serves both streams, so a paddy occupancy blocks a '
      'compost occupancy exactly the same way (RESOURCE_MOVEMENT_MODEL §2).',
      l.label, clash.batch_code,
      case when clash.ended_at is null
           then 'from ' || clash.started_at || ' onwards, still held'
           else 'from ' || clash.started_at || ' to ' || clash.ended_at end
      using errcode = 'exclusion_violation';
  end;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'record_occupancy', 'location_occupancy',
          new_id::text,
          jsonb_build_object('location', l.code, 'from', p_from, 'to', p_to),
          l.label || ' held by ' || ba.title);
  return new_id;
end;
$$;

revoke execute on function public.record_occupancy(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.record_occupancy(uuid, timestamptz, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · Machine utilisation, derived. Criterion 20.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_machine_utilisation as
select
  mu.master_batch_id,
  mb.code            as batch_code,
  m.id               as machine_id,
  m.code             as machine_code,
  m.kind             as machine_kind,
  count(*)::int      as stints,
  count(*) filter (where mu.ended_at is null)::int as open_stints,
  sum(mu.minutes)::int as minutes,
  min(mu.started_at) as first_started_at,
  max(mu.ended_at)   as last_ended_at
from public.machine_usage mu
join public.machine m on m.id = mu.machine_id
join public.master_batch mb on mb.id = mu.master_batch_id
group by mu.master_batch_id, mb.code, m.id, m.code, m.kind;

grant select on public.v_machine_utilisation to authenticated;

comment on view public.v_machine_utilisation is
  'Machine hours DERIVED from machine_usage windows. There is no editable hours column anywhere in '
  'the schema - DEMO_PLAN_V2 criterion 20 - and `minutes` on machine_usage is generated from the '
  'window, so nothing writes an hour. `minutes` is NULL while a stint is open.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · `validate_batch` — the ±2-day heuristic is replaced.
--
-- REPRODUCED FROM 0011 WITH ONE BLOCK CHANGED. Everything else is byte-identical, for the same reason
-- 0020 stated when it re-created `evaluate_gates`.
--
-- WHAT CHANGED, AND WHY IT IS NOT A DOWNGRADE. The old check blocked a batch whenever another active
-- batch's activity had a `planned_start_at` within ±2 days of this one's, on the same destination.
-- That is a guess in both directions: it blocks batches that do not clash, and it misses clashes
-- outside the window. It also fired on the demo batches during staging, refusing a batch that was
-- fine.
--
-- The real protection is now the exclusion constraint, which makes an overlapping occupancy
-- unwritable — "refused by the constraint, not by the form". What `validate_batch` reports instead is
-- what it can honestly know:
--
--   BLOCKING  an occupancy that is RECORDED and overlaps — this is a real, evidenced clash.
--   WARNING   a vessel-bound activity with NO occupancy recorded, naming TBD-28 and TBD-29, so the
--             absence of a check is visible rather than silent.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.validate_batch(p_batch uuid)
returns table (severity text, code text, message text, activity_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare fc public.factory_clock;
begin
  select * into fc from public.factory_clock where id = 1;

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

  return query
    select 'blocking', 'REST_NO_DURATION',
           ba.title || ' on Day ' || ba.rel_day || ' has no duration set', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.is_time_gate and ba.day0_duration_hr is null;

  return query
    select 'blocking', 'SAME_VESSEL',
           ba.title || ' — ' || ba.scope_label || ' would reload into the bunker it came from', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.requires_distinct_vessel
      and ba.destination_location_id is not null
      and ba.destination_location_id = ba.source_location_id;

  -- Kept as a PLAN-TIME check as well as a write-time one. The constraint refuses the second stint;
  -- this catches the intent before anybody tries, which is what an admin filling a form needs.
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

  -- BLOCKING · a RECORDED occupancy that overlaps another batch's. Evidence, not a window guess.
  return query
    select distinct 'blocking', 'VESSEL_DOUBLE_BOOKED',
           l.label || ' is held by ' || other.code || ' over an overlapping window', mine.batch_activity_id
    from location_occupancy mine
    join location l on l.id = mine.location_id
    join location_occupancy theirs on theirs.location_id = mine.location_id
                                 and theirs.master_batch_id <> mine.master_batch_id
                                 and theirs.during && mine.during
    join master_batch other on other.id = theirs.master_batch_id
    where mine.master_batch_id = p_batch and other.status = 'active';

  -- WARNING · a vessel-bound activity with no occupancy on record. The ±2-day heuristic used to guess
  -- here; it now says plainly that it cannot know, and names why.
  return query
    select 'warning', 'OCCUPANCY_NOT_RECORDED',
           ba.title || ' — ' || ba.scope_label || ' commits ' || l.label
             || ', but no occupancy window is recorded. The release rule is unanswered '
             || '(TBD-29), and whether paddy holds a bunker exclusively is unanswered (TBD-28), '
             || 'so no window can be derived.', ba.id
    from batch_activity ba
    join location l on l.id = ba.destination_location_id
    where ba.master_batch_id = p_batch
      and not exists (select 1 from location_occupancy oc where oc.batch_activity_id = ba.id);

  return query
    select 'blocking', 'NO_ASSIGNEE',
           ba.title || ' — ' || ba.scope_label || ' has nobody assigned', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and not ba.is_time_gate
      and ba.assigned_person_id is null;

  return query
    select 'blocking', 'NO_DESTINATION',
           ba.title || ' — ' || ba.scope_label || ' has no destination chosen', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.destination_kind in ('BUNKER','TUNNEL')
      and ba.destination_location_id is null;

  return query
    select 'warning', 'NO_BASELINE_HOUR',
           ba.title || ' — ' || ba.scope_label || ' has no hour on the axis', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.baseline_start_hour is null;

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

  -- INFO · every unresolved question this plan touches, named. TBD-28 and TBD-29 now reach this list
  -- through the occupancy warning above as well as through activity markers.
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
