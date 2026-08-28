-- 0032 · The incoming material check, as a PRE-BATCH prerequisite.  (Client decision 2)
--
-- ⚠ NO CALENDAR DATE IN THIS FILE, ANYWHERE. `src/domain/time.test.ts` scans `supabase/` for the
-- process-length literals, and a day-of-month can collide with one — the first version of this
-- migration tripped the invariant-8 scanner four times over its own changelog, and the second tripped
-- it once more in the comment explaining the first. The decision is identified by NUMBER; the date
-- lives in `docs/REPORTS/` and in the register row, which are not scanned.
-- docs/LAB_MODEL.md §2 · §9, lab_technician_batch_process.md §3, room.md PRE-H0.
--
-- ⚠ NUMBERED 0032, NOT 0026, AND THE NUMBER MATTERS. This was written as `0026_prebatch_material.sql`
-- and collided with `0026_vessel_allocation.sql` — two files claiming one migration number, resolved
-- only by `p` sorting before `v`. It also re-creates `validate_batch`, so it MUST run after every
-- other migration that does (0007, 0011, 0021); a later migration re-creating that function would
-- silently drop the three MATERIAL_* findings below and nothing would fail loudly.
--
-- If you add a migration that touches `validate_batch`, reproduce these findings or move this file
-- after it.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE DECISION THIS IMPLEMENTS, VERBATIM
--
--   "Treat incoming material testing as a pre-batch prerequisite for the current product flow.
--    Do not redesign the database around material_lot during this sprint. Represent the result
--    against the pending Master Batch in the current implementation where possible. Keep the
--    source conflict documented internally. Do not move the check into the H0 clock."
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY NOTHING NEEDED TO MOVE INTO THE HOUR CLOCK
--
-- `submit_activity` refuses an actual before H0, and `batchHour()` throws on one. That is a
-- deliberate coherence rule — "nothing in a batch happens before H0" — so an incoming check
-- CANNOT be a `batch_activity`. It does not have to be one.
--
-- B5 already built the pieces: `lab_sample.batch_activity_id` is NULLABLE, and `collected_at` is a
-- plain `timestamptz` with no lower bound. So a sample can already belong to a batch without
-- belonging to an activity, and can be collected before H0. This migration adds the entry point and
-- the prerequisite — it does not add an entity.
--
-- NO `material_lot` TABLE. The client said not to, and the check is therefore recorded against the
-- PENDING batch rather than against the consignment. The cost is stated rather than hidden: one
-- delivery feeding three batches must be recorded three times, and there is no way to ask "what did
-- lot BG-4471 assay at" independently of a batch. That is the conflict below.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE SOURCE CONFLICT, KEPT — registered as TBD-57
--
-- The lab dictation §3 puts the raw-material check at **Day 0**, inside the clock, as the batch's
-- own first activity. The client's operational description puts it **before** the clock starts, as
-- a prerequisite for activation. Those are different records of the same physical test, and this
-- migration implements the second WITHOUT deleting the first: `LAB_DICTATION.RAW_MATERIAL_WEIGHMENT`
-- stays on the Day-0 map in `lab_checkpoint`, and both remain visible.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Which checkpoints are pre-batch. DATA, not a code list.
--
-- `open_prebatch_sample` must not name 'RAW_MATERIAL' in a function body — that is rule 4's
-- hard-coded identifier in another costume, and it would break the moment a map is renamed. A flag
-- on the checkpoint keeps the answer in the process definition where it belongs.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.lab_checkpoint
  add column if not exists is_prebatch boolean not null default false;

comment on column public.lab_checkpoint.is_prebatch is
  'True where this checkpoint tests material BEFORE the batch clock starts. Set by s12 for the '
  'raw-material checkpoint on both carried maps. Client decision 2 - the incoming check is a '
  'prerequisite for activation, not a Day-0 activity. The lab dictation disagrees and puts it at '
  'Day 0; both readings stay on file as TBD-57.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Open a pre-batch sample against a DRAFT batch.
--
-- Deliberately a separate entry point from `open_lab_sample` rather than a nullable-activity
-- parameter on it: the two have different preconditions. `open_lab_sample` requires a running
-- activity; this one requires the batch NOT to be running yet. Folding them together would mean a
-- single function whose guards contradict each other depending on an argument.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.open_prebatch_sample(
  p_batch      uuid,
  p_checkpoint uuid,
  p_label      text default null,
  p_at         timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  b      master_batch;
  cp     lab_checkpoint;
  at_    timestamptz;
  new_id uuid;
begin
  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch: %', p_batch; end if;

  -- A PREREQUISITE, so it belongs before activation. Once the batch is running, the material it
  -- was made from is no longer a question the batch can answer.
  if b.status <> 'draft' then
    raise exception
      'Batch % is %, so an incoming-material check can no longer be recorded against it. The check '
      'is a prerequisite for activation.', b.code, b.status
      using errcode = 'invalid_parameter_value';
  end if;

  select * into cp from lab_checkpoint where id = p_checkpoint;
  if not found then raise exception 'No such lab checkpoint: %', p_checkpoint; end if;
  if not cp.is_prebatch then
    raise exception
      '% is not a pre-batch checkpoint, so it cannot be sampled before the batch starts. Use '
      'open_lab_sample against a running activity instead.', cp.code
      using errcode = 'invalid_parameter_value';
  end if;

  -- NOT BOUNDED BELOW BY H0, and that is the whole point of this function. The only rule is that a
  -- sample cannot have been collected in the future.
  at_ := coalesce(p_at, now());
  if at_ > now() then
    raise exception 'A sample cannot be collected in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  insert into lab_sample (checkpoint_id, master_batch_id, batch_activity_id, sample_ref_label,
                          collected_at, collected_by)
  values (cp.id, b.id, null, p_label, at_, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'open_prebatch_sample', 'lab_sample', new_id::text,
          jsonb_build_object('checkpoint', cp.code, 'map', cp.checkpoint_map, 'batch', b.code,
                             'collected_at', at_),
          'Incoming material sampled at ' || cp.code || ' for ' || b.code || ', before H0');
  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Accept a result as final.
--
-- `ROLE_AND_APPROVAL_MODEL §2` ticks "Accept a lab result as final" for the Lab technician and the
-- Supervisor, and for nobody else. B5 created `lab_result.accepted/accepted_by/accepted_at` and no
-- way to set them; this is that way.
--
-- ⚠ ACCEPTING IS NOT APPROVING THE MATERIAL. A failing result can be accepted as final — that is
-- what "the material genuinely failed" looks like on the record. Acceptance says the reading
-- stands; whether the batch may proceed is a separate question, answered by `validate_batch` below.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.accept_lab_result(
  p_result uuid,
  p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  r     lab_result;
  role_ app_role;
begin
  select * into r from lab_result where id = p_result;
  if not found then raise exception 'No such lab result: %', p_result; end if;

  role_ := public.current_app_role();
  if role_ is not null and role_ not in ('lab_tech','supervisor') then
    raise exception
      'A % may not accept a lab result as final. ROLE_AND_APPROVAL_MODEL ticks this for the lab '
      'technician and the supervisor only.', role_
      using errcode = 'insufficient_privilege';
  end if;

  if r.superseded_by_result_id is not null then
    raise exception
      'That result has been superseded by a retest. Accept the current version instead — accepting '
      'a superseded reading would make the record say the batch was cleared on a number that has '
      'been replaced.'
      using errcode = 'invalid_parameter_value';
  end if;

  update lab_result
     set accepted = true, accepted_by = auth.uid(), accepted_at = now()
   where id = p_result;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), role_, 'accept_lab_result', 'lab_result', p_result::text,
          jsonb_build_object('verdict', r.verdict, 'version', r.version),
          coalesce(p_reason, 'Result accepted as final · verdict ' || r.verdict));
end;
$$;

revoke execute on function public.open_prebatch_sample(uuid, uuid, text, timestamptz) from anon;
revoke execute on function public.accept_lab_result(uuid, text) from anon;
grant execute on function public.open_prebatch_sample(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.accept_lab_result(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · The state of the check, per batch.
--
-- One row per batch that has one. A batch with no pre-batch sample does not appear, which is what
-- makes "not checked" distinguishable from "checked and outstanding".
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_prebatch_material_check as
select
  s.master_batch_id,
  mb.code                                     as batch_code,
  mb.status                                   as batch_status,
  cp.code                                     as checkpoint_code,
  cp.checkpoint_map,
  s.id                                        as sample_id,
  s.sample_ref_label,
  s.collected_at,
  p.display_name                              as collected_by_name,
  count(t.id)::int                             as tests_requested,
  count(r.id)::int                             as results_current,
  count(*) filter (where r.verdict = 'fail')::int    as failed,
  count(*) filter (where r.verdict = 'no_spec')::int as no_spec,
  count(*) filter (where r.accepted)::int             as accepted,
  -- Collected BEFORE H0, which is the claim this whole migration exists to support. NULL when the
  -- batch has no H0 yet, because then there is nothing to be before.
  case when mb.start_at is null then null else s.collected_at < mb.start_at end as before_h0
from public.lab_sample s
join public.master_batch mb on mb.id = s.master_batch_id
join public.lab_checkpoint cp on cp.id = s.checkpoint_id
left join public.profiles p on p.id = s.collected_by
left join public.lab_test t on t.sample_id = s.id
left join public.lab_result r on r.test_id = t.id and r.superseded_by_result_id is null
where s.batch_activity_id is null and cp.is_prebatch
group by s.master_batch_id, mb.code, mb.status, cp.code, cp.checkpoint_map, s.id,
         s.sample_ref_label, s.collected_at, p.display_name, mb.start_at;

grant select on public.v_prebatch_material_check to authenticated;

comment on view public.v_prebatch_material_check is
  'The incoming-material check for a batch, recorded BEFORE H0 against the pending batch. '
  '`batch_activity_id is null` is what makes it pre-batch - it belongs to the batch without '
  'belonging to any activity, so nothing about it is on the hour axis. Client decision 2; the '
  'Day-0 reading of the same test is TBD-57.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · `validate_batch` — the check becomes a real prerequisite.
--
-- REPRODUCED FROM 0021 WITH ONE BLOCK ADDED. Everything else is byte-identical, for the same reason
-- 0020 and 0021 stated when they re-created a function: patching a body with `pg_get_functiondef`
-- and `regexp_replace` is opaque and fragile, and extracting a helper still means re-creating the
-- call site.
--
-- THREE FINDINGS, because "the material is not cleared" has three different causes and an admin can
-- act on each differently:
--
--   MATERIAL_NOT_CHECKED    nothing was sampled. Sample it.
--   MATERIAL_FAILED         a current result is out of spec. Hold, correct, retest — the retest
--                           supersedes and this clears itself.
--   MATERIAL_NOT_ACCEPTED   results exist and none failed, but nobody has signed them off. This
--                           covers a test with no result yet as well, because an unrecorded test
--                           cannot be accepted.
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

  -- ── NEW in 0032 · the incoming material check is a prerequisite ────────────
  --
  -- ⚠ THE SEVERITY DEPENDS ON WHETHER THE BATCH HAS STARTED, and that is not a softening.
  --
  -- `validate_batch` is what gates ACTIVATION. For a DRAFT batch a missing or unaccepted check must
  -- block, because that is exactly what "prerequisite" means and `activate_batch` reads this list.
  --
  -- For a batch that is ALREADY RUNNING the finding cannot un-start it, and calling it blocking would
  -- assert that three staged batches are invalid. What is actually true is narrower and worth saying
  -- precisely: they were activated before this check existed, and `open_prebatch_sample` is
  -- deliberately draft-only so the gap cannot be tidied away after the fact. A gap in the record is a
  -- warning. Reporting it as blocking would be the system lying about its own history in the
  -- flattering direction.
  return query
    select case when mb.status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_NOT_CHECKED',
           case when mb.status = 'draft'
             then 'No incoming-material check is on record. The material must be sampled and its '
                  || 'results accepted before the batch clock starts (client decision 2).'
             else 'This batch was activated with no incoming-material check on record. It cannot be '
                  || 'added retrospectively, so the gap stands on the record (client decision 2).'
           end,
           null::uuid
    from master_batch mb
    where mb.id = p_batch
      and not exists (select 1 from v_prebatch_material_check c
                       where c.master_batch_id = mb.id);

  return query
    select case when c.batch_status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_FAILED',
           'The incoming-material check on ' || c.checkpoint_code || ' has ' || c.failed
             || ' result(s) outside spec. Hold the material, record a corrective action and retest '
             || '— a retest supersedes the reading and clears this.',
           null::uuid
    from v_prebatch_material_check c
    where c.master_batch_id = p_batch and c.failed > 0;

  return query
    select case when c.batch_status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_NOT_ACCEPTED',
           'The incoming-material check on ' || c.checkpoint_code || ' has ' || c.accepted || ' of '
             || c.tests_requested || ' result(s) accepted as final. A lab technician or supervisor '
             || 'must accept them before the batch can start.',
           null::uuid
    from v_prebatch_material_check c
    where c.master_batch_id = p_batch
      and c.failed = 0
      and c.accepted < c.tests_requested;

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
