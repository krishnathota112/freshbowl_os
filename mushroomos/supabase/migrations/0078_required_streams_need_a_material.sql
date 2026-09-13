-- 0078 · A batch cannot be activated with a required stream missing.
--
-- generate_activity_plan skips every activity whose material role has no binding. The New Batch
-- screen sent none, so batches were planned with 94 of PROCESS-2026C's 110 activities: the main
-- fibre, straw and nitrogen streams silently absent. This adds the missing refusal; the rest of the
-- function is the deployed body, unchanged.

CREATE OR REPLACE FUNCTION public.validate_batch(p_batch uuid)
 RETURNS TABLE(severity text, code text, message text, activity_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 0078 · a mandatory stream with no material bound is left out of the plan entirely (G01).
  return query
    select case when mb.status = 'draft' then 'blocking' else 'warning' end,
           'MATERIAL_ROLE_UNBOUND',
           case when mb.status = 'draft'
             then 'No material is chosen for ' || lower(replace(pa.material_role::text, '_', ' '))
                  || ', so its ' || count(*) || ' required activities are missing from the plan. '
                  || 'Choose the material and generate the plan again.'
             else 'This batch was activated with no material for '
                  || lower(replace(pa.material_role::text, '_', ' '))
                  || ', so its ' || count(*) || ' required activities are not in its plan.'
           end,
           null::uuid
    from master_batch mb
    join process_activity pa on pa.process_definition_id = mb.process_definition_id
    where mb.id = p_batch
      and not pa.is_optional
      and pa.material_role is not null
      and not exists (select 1 from batch_material_role bmr
                       where bmr.master_batch_id = mb.id and bmr.role = pa.material_role)
    group by mb.status, pa.material_role;

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
      -- 0047. Material resting in a bunker is not work, and nobody performs it.
      and not ba.is_hold
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
$function$
;
