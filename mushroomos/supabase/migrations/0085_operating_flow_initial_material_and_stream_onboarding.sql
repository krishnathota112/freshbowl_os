-- ─────────────────────────────────────────────────────────────────────────────
-- 0085 · The operating flow (user decisions, 14 Sep 2026).
--
--   1 · PRE-H0 MATERIAL IS THE BATCH'S STARTING INFORMATION, NOT A LAB APPROVAL.
--       Admin records it; nobody "accepts" it. Activation needs it recorded; an out-of-spec value is a
--       warning (recorded and flagged), never a block. 0084 is reverted: accept_lab_result is back to
--       lab technician / supervisor only. Pre-H0 lab checkpoint activities leave the Lab queue.
--
--   2 · ONBOARDING A RUNNING BATCH = ITS CURRENT POSITION PER STREAM.
--       onboard_batch(batch, actual H0, current activities, streams completed before tracking).
--       Everything before those positions becomes "before MushroomOS tracking": SKIPPED with
--       before_tracking = true, and NO actual times, performers, photos or readings. The factory's
--       stated position wins: a position opens even if its own entry gates are unresolved or
--       lab-gated (onboarded_position = true). Every gate after it still applies.
--
--       Engine consequence (the one capability gap): a lab checkpoint that happened before tracking
--       must not hold a gate open for ever, so LAB_APPROVED ignores before_tracking checkpoints, and
--       advance_batch does not re-lock an onboarded position.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── columns ────────────────────────────────────────────────────────────────────
alter table public.batch_activity
  add column if not exists before_tracking boolean not null default false,
  add column if not exists onboarded_position boolean not null default false;

comment on column public.batch_activity.before_tracking is
  'true = this work happened before MushroomOS tracking began (onboarded batch). No execution record is claimed. 0085.';
comment on column public.batch_activity.onboarded_position is
  'true = the factory stated the batch is at this activity when it was onboarded; its entry gates are waived. 0085.';

-- ── 1 · revert 0084: accept_lab_result is lab technician / supervisor only ────
CREATE OR REPLACE FUNCTION public.accept_lab_result(p_result uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ── 1 · validate_batch: initial material recorded; out of spec is a warning; no acceptance ─
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
             then 'No initial material data is recorded. Enter the pre-H0 material values before '
                  || 'activating the batch.'
             else 'This batch was activated with no incoming-material check on record. It cannot be '
                  || 'added retrospectively, so the gap stands on the record (client decision 2).'
           end,
           null::uuid
    from master_batch mb
    where mb.id = p_batch
      and not exists (select 1 from v_prebatch_material_check c
                       where c.master_batch_id = mb.id);

  return query
    -- 0085 · recorded and flagged, never a block: it is the batch's starting information.
    select 'warning',
           'MATERIAL_FAILED',
           'The initial material data on ' || c.checkpoint_code || ' has ' || c.failed
             || ' value(s) outside spec. Recorded as the starting material information and flagged.',
           null::uuid
    from v_prebatch_material_check c
    where c.master_batch_id = p_batch and c.failed > 0;

  -- 0085 · MATERIAL_NOT_ACCEPTED removed. Initial material data is recorded by Admin as the batch's
  -- starting information; nobody accepts it (operating flow, 14 Sep 2026).

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

  -- 0080 · NO_ASSIGNEE removed. Work is open to the authorised role (the Supervisor squad for
  -- production, the Lab for lab work); the server records who actually did each step. Assignment
  -- remains possible but is no longer a precondition for activation (product decision, 13 Sep 2026).

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
$function$;

-- ── 1 · Lab queue: post-H0 only ────────────────────────────────────────────────
create or replace view public.v_lab_queue with (security_invoker = on) as
 SELECT ba.master_batch_id,
    mb.code AS batch_code,
    mb.label AS batch_label,
    ba.rel_day AS current_day,
    ba.id AS activity_id,
    ba.title AS activity_title,
    ba.scope_label,
    ba.lab_parameters AS parameters,
    ba.state::text AS state,
    ba.state = ANY (ARRAY['READY'::activity_state, 'IN_PROGRESS'::activity_state, 'RETURNED'::activity_state]) AS action_required,
    ( SELECT d.verdict
           FROM lab_decision d
          WHERE d.batch_activity_id = ba.id
          ORDER BY d.seq DESC
         LIMIT 1) AS last_submission,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM lab_result r
                 JOIN lab_test t ON t.id = r.test_id
                 JOIN lab_sample s ON s.id = t.sample_id
              WHERE s.batch_activity_id = ba.id AND r.retest_reason IS NOT NULL AND r.superseded_by_result_id IS NULL)) THEN 'retest'::text
            ELSE 'today'::text
        END AS band,
    'No source gives a lab turnaround time, so an overdue band cannot be computed without '::text || 'inventing a duration'::text AS overdue_unknown_reason,
    ( SELECT count(*) AS count
           FROM lab_sample s
          WHERE s.batch_activity_id = ba.id) AS samples,
    ( SELECT count(*) AS count
           FROM lab_result r
             JOIN lab_test t ON t.id = r.test_id
             JOIN lab_sample s ON s.id = t.sample_id
          WHERE s.batch_activity_id = ba.id AND r.superseded_by_result_id IS NULL) AS results
   FROM batch_activity ba
     JOIN master_batch mb ON mb.id = ba.master_batch_id
  WHERE ba.responsible_role = 'lab_tech'::app_role AND mb.status = 'active'::batch_status
    -- 0085 · the Lab handles POST-H0 checkpoints; pre-H0 material is Admin's data, and work before tracking is history
    AND NOT ba.is_pre_h0 AND NOT ba.before_tracking;
grant select on public.v_lab_queue to authenticated;

-- ── 2 · engine: before-tracking checkpoints hold no gate; positions are not re-locked ─
CREATE OR REPLACE FUNCTION public.evaluate_gates(p_activity uuid, p_phase text DEFAULT 'entry'::text)
 RETURNS TABLE(rule_id uuid, kind text, binding text, verdict text, reason text, is_enabled boolean, mapping_confidence text, conflict_id text, ordering integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba        batch_activity;
  g         record;
  sub       jsonb;
  st        record;
  v_ok      boolean;
  v_vars    jsonb;
  v_verdict text;
  v_sub_ok  boolean;
  v_any_ok  boolean;
  v_fld     batch_activity_value;
  v_out_n   int;
  v_out_lbl text;
  v_actual  numeric;
  v_hours   numeric;
  v_remain  interval;
  v_machine text;
  v_stints_exist boolean;
  v_cp      int;
begin
  if p_phase not in ('entry','exit') then
    raise exception 'phase must be entry or exit, got %', p_phase;
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'machine_usage'
  ) into v_stints_exist;

  for g in
    select gr.* from gate_rule gr
    where gr.process_activity_id = ba.process_activity_id
      and gr.phase = p_phase
    order by gr.ordering, gr.id
  loop
    v_vars := jsonb_build_object('scope_label', ba.scope_label);
    v_verdict := null;
    v_ok := null;

    if not g.is_enabled then
      v_verdict := 'skipped';

    elsif g.kind in ('FIELD_IN_RANGE','SENSOR_THRESHOLD')
          and g.mapping_confidence not in ('dictated','sop_direct') then
      v_verdict := 'skipped';

    elsif g.kind = 'PREDECESSOR' then
      select * into st from gate_predecessor_status(
        ba.master_batch_id, ba.instance_no, g.config->'activity_codes', g.predecessor_binding);
      v_ok := st.ok;
      -- 0051 · A rest measured from the PREDECESSOR'S ACTUAL END.
      -- The Turner: 8 h after THAT PILE'S OWN T1 end. Not T0 start + 24 h (F10),
      -- and not ELAPSED_TIME, which measures from this activity's own start.
      v_hours := nullif(g.config->>'min_rest_hr', '')::numeric;

      -- 0062 · The required rest is a property of the RULE, knowable long before anything
      -- finishes. 0051 populated it only inside `if v_ok` — i.e. only once the predecessor was
      -- already complete — so in the ordinary case the card read "rests not recorded h".
      if v_hours is not null then
        v_vars := v_vars || jsonb_build_object(
          -- `FM` strips trailing ZEROS but leaves the decimal POINT, so 8 renders as "8." and the
          -- card reads "rests 8. h". Trim the point too; 7.5 still renders as "7.5".
          'rest_required_hr', trim(trailing '.' from trim(to_char(v_hours, 'FM999990.99'))));

        if not v_ok then
          -- The predecessor has not finished. Say so, instead of a sentence that claims it did.
          v_vars := v_vars || jsonb_build_object(
            'rest_status',
            'That ' || coalesce(st.blocker_title, 'earlier activity') || ' has not finished yet.');

        elsif st.last_actual_end is null then
          -- Complete, but with no recorded end there is nothing to measure from. Refuse:
          -- treating an unknown end as "long enough ago" is how a rest gets skipped.
          v_ok := false;
          v_vars := v_vars || jsonb_build_object(
            'rest_remaining', 'unknown — no finish time recorded',
            'rest_status',
            'It is marked complete but carries no finish time, so the rest cannot be measured. '
            || 'Ask a supervisor to record the finish.');

        else
          v_remain := greatest(
            st.last_actual_end + make_interval(secs => (v_hours * 3600)::int) - now(),
            interval '0');
          v_ok := (v_remain = interval '0');
          v_vars := v_vars || jsonb_build_object(
            'predecessor_ended_at', to_char(st.last_actual_end, 'DD Mon HH24:MI'),
            'rest_remaining',       to_char(v_remain, 'HH24:MI'),
            'rest_status',
              'It finished at ' || to_char(st.last_actual_end, 'DD Mon HH24:MI')
              || ' — ' || to_char(v_remain, 'HH24:MI') || ' still to go.');
        end if;
      end if;

      v_vars := v_vars
        || jsonb_build_object('predecessor_label', st.blocker_title)
        || jsonb_build_object('stream_label',
             case when st.blocker_stream is null then null
                  else initcap(replace(st.blocker_stream, '_', ' ')) end);

    elsif g.kind in ('BOTH','EITHER_OR') then
      v_any_ok := false;
      v_ok := (g.kind = 'BOTH');
      for sub in select * from jsonb_array_elements(coalesce(g.config->'sub', '[]'::jsonb)) loop
        v_sub_ok := null;
        if sub->>'kind' = 'PREDECESSOR' then
          select * into st from gate_predecessor_status(
            ba.master_batch_id, ba.instance_no, sub->'activity_codes', sub->>'binding');
          v_sub_ok := st.ok;
          if not st.ok then
            v_vars := v_vars
              || jsonb_build_object('predecessor_label', st.blocker_title)
              || jsonb_build_object('stream_label',
                   case when st.blocker_stream is null then null
                        else initcap(replace(st.blocker_stream, '_', ' ')) end);
          end if;
        elsif sub->>'kind' = 'ELAPSED_TIME' then
          v_hours := nullif(sub->>'hours','')::numeric;
          v_sub_ok := ba.actual_start is not null and v_hours is not null
                      and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int);
        else
          v_sub_ok := null;
        end if;

        if g.kind = 'BOTH' then
          if v_sub_ok is false then v_ok := false; end if;
        elsif v_sub_ok is true then
          v_any_ok := true;
        end if;
      end loop;

      if g.kind = 'EITHER_OR' then v_ok := v_any_ok; end if;

    elsif g.kind = 'DAY0_DURATION' then
      if ba.day0_duration_hr is null then
        v_ok := false;
        v_vars := v_vars || jsonb_build_object(
          'required', 'not set' || coalesce(' (' || ba.tbd_marker || ')', ''),
          'remaining', 'unknown');
      elsif ba.unblocks_at is null then
        v_ok := false;
        v_remain := make_interval(secs => (ba.day0_duration_hr * 3600)::int);
        v_vars := v_vars || jsonb_build_object(
          'required', to_char(v_remain, 'HH24:MI'), 'remaining', 'not started');
      else
        v_ok := now() >= ba.unblocks_at;
        v_remain := greatest(ba.unblocks_at - now(), interval '0');
        v_vars := v_vars || jsonb_build_object(
          'required', to_char(make_interval(secs => (ba.day0_duration_hr * 3600)::int), 'HH24:MI'),
          'remaining', to_char(v_remain, 'HH24:MI'));
      end if;

    elsif g.kind = 'ELAPSED_TIME' then
      v_hours := nullif(g.config->>'hours','')::numeric;
      v_ok := ba.actual_start is not null and v_hours is not null
              and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int);
      v_vars := v_vars || jsonb_build_object(
        'elapsed', case when ba.actual_start is null then 'not started'
                        else round(extract(epoch from (now() - ba.actual_start)) / 3600, 1)::text end);

    elsif g.kind = 'EVIDENCE_COMPLETE' then
      select count(*)::int, string_agg(r.label, ', ' order by r.ordering)
        into v_out_n, v_out_lbl
      from batch_activity_evidence_req r
      where r.batch_activity_id = ba.id
        and r.gates_submission and r.satisfied_count < r.min_count;
      v_ok := coalesce(v_out_n, 0) = 0;
      v_vars := v_vars || jsonb_build_object(
        'outstanding_count', coalesce(v_out_n, 0)::text, 'outstanding_labels', v_out_lbl);

    elsif g.kind = 'FIELD_IN_RANGE' then
      select * into v_fld from batch_activity_value
       where batch_activity_id = ba.id and field_key = g.config->>'field_key';

      if not found or v_fld.actual_value is null
         or v_fld.actual_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object('actual', 'not recorded');
      else
        v_actual := v_fld.actual_value::numeric;
        v_ok := (v_fld.sop_min is null or v_actual >= v_fld.sop_min)
            and (v_fld.sop_max is null or v_actual <= v_fld.sop_max);
        v_vars := v_vars || jsonb_build_object(
          'actual', v_fld.actual_value,
          'min', coalesce(v_fld.sop_min::text, '—'),
          'max', coalesce(v_fld.sop_max::text, '—'));
      end if;

    elsif g.kind = 'MACHINE_STINT_CLOSED' then
      select m.code into v_machine from machine m where m.id = ba.assigned_machine_id;
      v_vars := v_vars || jsonb_build_object('machine_code', v_machine);

      if v_stints_exist then
        execute 'select not exists (select 1 from public.machine_usage mu'
                || ' where mu.batch_activity_id = $1 and mu.ended_at is null)'
          into v_ok using ba.id;
      else
        v_ok := true;
      end if;

    elsif g.kind = 'LAB_APPROVED' then
      -- 0054 · ENTERED IS NOT APPROVED.
      --
      -- Which laboratory activities are bound to hold THIS one, and has the latest decision
      -- on each of them approved it? `lab_checkpoint_activity` carries the pairing, so a
      -- per-bunker gate waits on its own bunker's assay and not on all three.
      --
      -- A REJECTED or ABSENT decision does not open the gate. Neither does a recorded
      -- result: a reading that nobody has approved is a reading, not an approval.
      select count(*)::int,
             count(*) filter (where lab.verdict = 'approved')::int,
             string_agg(distinct lab.checkpoint_code, ', ')
        into v_out_n, v_cp, v_out_lbl
      from (
        select lca.checkpoint_code,
               (select d.verdict from lab_decision d
                 where d.batch_activity_id = lba.id
                 order by d.seq desc limit 1) as verdict
          from batch_activity lba
          join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
          join lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                                and cp.code = lca.checkpoint_code
         where lba.master_batch_id = ba.master_batch_id
           and lca.gates_activity_code = ba.code
           -- 0085 · a checkpoint that happened before MushroomOS tracking cannot be approved now
           and not lba.before_tracking
           and cp.kind = 'GATE'
      ) lab;

      if coalesce(v_out_n, 0) = 0 then
        -- A gate rule with nothing bound to it cannot be evaluated. Passing would silently
        -- open production; failing would lock it for ever with no way to clear it. Say so.
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object(
          'checkpoint', 'no laboratory checkpoint is bound to this activity');
      else
        v_ok := (v_cp = v_out_n);
        v_vars := v_vars || jsonb_build_object(
          'checkpoint', coalesce(v_out_lbl, '?'),
          'approved_count', v_cp::text,
          'required_count', v_out_n::text);
      end if;

    elsif g.kind = 'UNRESOLVED_DEPENDENCY' then
      -- 0082 · E-5 · THE SOURCE DOES NOT DEFINE WHEN THIS MAY START. It stays shut, and says which
      -- registered question it is waiting on. Opening it would invent the rule; so would a GM approval.
      v_ok := false;
      select cr.question into v_out_lbl from conflict_register cr where cr.conflict_id = g.conflict_id;
      v_vars := v_vars || jsonb_build_object(
        'conflict_id', g.conflict_id,
        'question', coalesce(v_out_lbl, 'the dependency is not defined'));

    elsif g.kind = 'GM_APPROVAL' then
      -- ── B6 · CHANGED FROM 0012's `v_ok := false`. ─────────────────────────
      -- The checkpoint number is the RULE's, not this function's: `s04` seeds `'{"checkpoint":3}'`
      -- on TN-LOAD, so which checkpoint gates which activity stays data.
      --
      -- `returned` does NOT open the gate. Only an approval does, and `approved_with_conditions` is
      -- an approval — §5 puts it beside APPROVE on the screen, and the conditions live in the
      -- mandatory reason, which the snapshot preserves.
      --
      -- The LATEST decision governs. A batch approved, returned, then approved again is at its third
      -- decision, and the first two stay on the record.
      v_cp := nullif(g.config->>'checkpoint','')::int;

      if v_cp is null then
        -- An approval rule that does not say WHICH checkpoint cannot be evaluated, and guessing at
        -- one would be inventing the process's own structure.
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object('checkpoint', 'not stated on the rule');
      else
        v_ok := exists (
          select 1 from public.v_checkpoint_status s
           where s.master_batch_id = ba.master_batch_id
             and s.checkpoint_no = v_cp
             and s.latest_verdict in ('approved','approved_with_conditions'));
        v_vars := v_vars || jsonb_build_object('checkpoint', v_cp::text);
      end if;

    else
      v_verdict := 'unevaluable';
    end if;

    if v_verdict is null then
      v_verdict := case when v_ok then 'pass' when v_ok is null then 'unevaluable' else 'fail' end;
    end if;

    return query select
      g.id,
      g.kind,
      g.predecessor_binding,
      v_verdict,
      case when v_verdict = 'fail' then render_gate_reason(g.blocked_reason_template, v_vars) end,
      g.is_enabled,
      g.mapping_confidence,
      g.conflict_id,
      g.ordering;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.advance_batch(p_batch uuid)
 RETURNS TABLE(opened integer, resting integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n_opened  int := 0;
  n_resting int := 0;
  cand      record;
  fail      record;
  touched   boolean;
begin
  -- 1 · A rest window that has elapsed opens.
  for cand in
    select ba.id, ba.title, ba.scope_label, ba.unblocks_at
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.state = 'WAITING_TIME'
      and ba.unblocks_at is not null
  loop
    if not exists (
      select 1 from evaluate_gates(cand.id, 'exit') v
      where v.kind = 'DAY0_DURATION' and v.verdict = 'fail'
    ) then
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      values (null, null, 'rest_released', 'batch_activity', cand.id::text,
              jsonb_build_object('unblocks_at', cand.unblocks_at, 'released_at', now()),
              cand.title || ' — ' || cand.scope_label
              || ': rest window elapsed on the server clock');
    end if;
  end loop;

  -- 2 · Anything still shut is re-evaluated against its OWN entry rules.
  for cand in
    select ba.id, ba.is_time_gate, ba.day0_duration_hr, ba.actual_start, ba.unblocks_at,
           ba.title, ba.scope_label, (ba.state = 'READY') as was_ready
    from batch_activity ba
    where ba.master_batch_id = p_batch
      -- 0085 · the factory stated the batch is at an onboarded position: its entry gates are waived
      and not ba.onboarded_position
      and (ba.state = 'LOCKED'
           or (ba.state = 'WAITING_TIME' and ba.unblocks_at is null)
           -- 0072 · READY IS NOT A ONE-WAY DOOR.
           --
           -- This scan used to consider only activities that were already shut, so a gate could
           -- open and never close again. The laboratory case makes the consequence plain:
           --
           --     supervisor approves  -> BNK-B3-FILL becomes READY
           --     GM rejects           -> lab_decision seq 369 = 'rejected'
           --                             v_lab_approval_queue.latest_verdict = 'rejected'
           --                             BNK-B3-FILL is still READY
           --
           -- evaluate_gates was right the whole time: its LAB_APPROVED rule already reads the
           -- LATEST decision. Nothing ever asked it again. So the queue said rejected while
           -- production stood open, which is the one shape that is genuinely hard to explain
           -- afterwards.
           --
           -- READY only. An activity that is IN_PROGRESS or beyond represents work that has
           -- actually begun, and shutting that would rewrite what happened; the answer there is a
           -- deviation, not a demotion. Time gates are excluded because their path is
           -- LOCKED -> WAITING_TIME and re-entering it would restamp actual_start.
           or (ba.state = 'READY' and not ba.is_time_gate))
    order by ba.seq, ba.instance_no
  loop
    select v.reason, v.kind into fail
    from evaluate_gates(cand.id, 'entry') v
    where v.verdict = 'fail'
    order by v.ordering
    limit 1;

    if fail.reason is not null then
      -- Still shut, and it says why in the rule's own words. No event when it was already shut:
      -- nothing happened. But a READY activity closing again IS something happening, and the
      -- people who saw it open need to find out why it went away.
      update batch_activity
         set state = 'LOCKED', blocked_reason = fail.reason
       where id = cand.id and (state <> 'LOCKED' or coalesce(blocked_reason,'') <> fail.reason);

      if cand.was_ready then
        insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                                 before_state, after_state, reason)
        values (auth.uid(), public.current_app_role(), 'gate_closed', 'batch_activity',
                cand.id::text,
                jsonb_build_object('state', 'READY'),
                jsonb_build_object('state', 'LOCKED', 'kind', fail.kind),
                cand.title || ' — ' || coalesce(cand.scope_label, 'whole batch')
                  || ' was open and is shut again: ' || fail.reason);
      end if;
      continue;
    end if;

    if cand.is_time_gate then
      update batch_activity ba
         set state = 'WAITING_TIME',
             actual_start = coalesce(ba.actual_start, now()),
             unblocks_at = case
               when ba.day0_duration_hr is not null
                 then coalesce(ba.actual_start, now())
                      + make_interval(secs => (ba.day0_duration_hr * 3600)::int)
               else ba.unblocks_at end,
             blocked_reason = case
               when ba.day0_duration_hr is null then
                 'Rest duration has not been set for this batch'
                 || coalesce(' — ' || ba.tbd_marker || ' is unresolved', '')
               when ba.day0_duration_hr >= 1 then
                 'Resting — ' || round(ba.day0_duration_hr, 2)::text || ' h required'
               else
                 'Resting — ' || round(ba.day0_duration_hr * 60)::text || ' min required'
             end
       where ba.id = cand.id;
      n_resting := n_resting + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      select null, null, 'rest_started', 'batch_activity', cand.id::text,
             jsonb_build_object('unblocks_at', cur.unblocks_at,
                                'day0_duration_hr', cur.day0_duration_hr),
             cur.title || ' — ' || cur.scope_label || ': ' || coalesce(cur.blocked_reason, 'resting')
        from batch_activity cur where cur.id = cand.id;
    else
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
      values (null, null, 'gate_opened', 'batch_activity', cand.id::text,
              cand.title || ' — ' || cand.scope_label || ': every entry gate is satisfied');
    end if;
  end loop;

  return query select n_opened, n_resting;
end;
$function$;

-- ── 2 · onboard_batch ──────────────────────────────────────────────────────────
create or replace function public.onboard_batch(
  p_batch uuid,
  p_h0 timestamptz,
  p_positions uuid[] default '{}',
  p_completed_streams text[] default '{}',
  p_note text default null)
 returns table(before_tracking_count integer, position_count integer, open_count integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  b          master_batch;
  v_pos      uuid[] := coalesce(p_positions, '{}');
  v_done     text[] := coalesce(p_completed_streams, '{}');
  v_seed     uuid[];
  v_before   uuid[] := '{}';
  v_frontier uuid[];
  v_next     uuid[];
  bad        text;
begin
  perform public.assert_role(array['admin', 'gm']::app_role[], 'onboard a running batch');

  select * into b from master_batch where id = p_batch for update;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status <> 'draft' then
    raise exception 'Batch % is %; only a batch still being set up can be onboarded.', b.code, b.status
      using errcode = 'check_violation';
  end if;
  if p_h0 is null then
    raise exception 'Give the actual date and time the batch started (actual H0).' using errcode = 'check_violation';
  end if;
  if p_h0 > now() then
    raise exception 'The actual H0 of a running batch cannot be in the future (% is ahead of now).', p_h0
      using errcode = 'check_violation';
  end if;
  if cardinality(v_pos) = 0 and cardinality(v_done) = 0 then
    raise exception 'Give the current position of at least one stream.' using errcode = 'check_violation';
  end if;

  select string_agg(p::text, ', ') into bad
    from unnest(v_pos) p
   where not exists (select 1 from batch_activity ba
                      where ba.id = p and ba.master_batch_id = p_batch
                        and coalesce(ba.responsible_role::text, '') <> 'lab_tech');
  if bad is not null then
    raise exception 'These positions are not production activities of batch %: %', b.code, bad
      using errcode = 'check_violation';
  end if;

  select string_agg(distinct ba.stream::text, ', ') into bad
    from batch_activity ba
   where ba.id = any(v_pos) and ba.stream::text = any(v_done);
  if bad is not null then
    raise exception 'Stream % is given both a current activity and "completed". Choose one.', bad
      using errcode = 'check_violation';
  end if;

  -- H0 first, so every planned instant is repointed from the actual start.
  perform public.set_batch_start_at(p_batch, p_h0);

  -- Streams completed before tracking: all of their production work.
  select coalesce(array_agg(ba.id), '{}') into v_seed
    from batch_activity ba
   where ba.master_batch_id = p_batch and ba.stream::text = any(v_done)
     and coalesce(ba.responsible_role::text, '') <> 'lab_tech';
  v_before := v_seed;

  -- Everything each position and each completed step depends on, transitively, from the process's own
  -- PREDECESSOR rules. Nothing is inferred beyond the dependencies the process states.
  v_frontier := v_pos || v_seed;
  loop
    select coalesce(array_agg(distinct pred.id), '{}') into v_next
      from batch_activity cur
      join gate_rule g
        on g.process_activity_id = cur.process_activity_id
       and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
      join batch_activity pred
        on pred.master_batch_id = cur.master_batch_id
       and pred.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE'
            or pred.instance_no = cur.instance_no)
     where cur.id = any(v_frontier)
       and not pred.id = any(v_before);
    exit when cardinality(v_next) = 0;
    v_before := v_before || v_next;
    v_frontier := v_next;
  end loop;

  select string_agg(ba.title, ', ') into bad from batch_activity ba where ba.id = any(v_pos) and ba.id = any(v_before);
  if bad is not null then
    raise exception 'These positions come before another position you gave in the same stream: %. Give only the current step of each stream.', bad
      using errcode = 'check_violation';
  end if;

  -- Lab checkpoints of work that happened before tracking are before tracking. A GATE checkpoint that
  -- guards a position is too: the factory is already past it. A RECORD / DECISION checkpoint of a
  -- position stays live, because that reading may still be due.
  v_before := v_before || coalesce((
    select array_agg(distinct lba.id)
      from batch_activity lba
      join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id
      join lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
     where lba.master_batch_id = p_batch
       and (lca.gates_activity_code in (select ba.code from batch_activity ba where ba.id = any(v_before))
            or (lc.kind = 'GATE'
                and lca.gates_activity_code in (select ba.code from batch_activity ba where ba.id = any(v_pos))))
       and not lba.id = any(v_before)), '{}');

  update batch_activity
     set state = 'SKIPPED',
         before_tracking = true,
         skip_reason = 'Before MushroomOS tracking — batch onboarded with actual H0 '
                       || to_char(p_h0 at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
         skipped_at = now(),
         blocked_reason = null
   where id = any(v_before);

  update batch_activity
     set state = 'READY',
         onboarded_position = true,
         blocked_reason = null
   where id = any(v_pos);

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'onboard_batch', 'master_batch', p_batch::text,
          jsonb_build_object('actual_h0', p_h0,
                             'positions', (select jsonb_agg(jsonb_build_object('code', ba.code, 'stream', ba.stream, 'title', ba.title))
                                             from batch_activity ba where ba.id = any(v_pos)),
                             'completed_streams', to_jsonb(v_done),
                             'before_tracking_count', cardinality(v_before)),
          coalesce(nullif(trim(p_note), ''), 'Running batch onboarded at its current position'));

  perform public.activate_batch(p_batch);

  return query
    select cardinality(v_before), cardinality(v_pos),
           (select count(*)::int from batch_activity where master_batch_id = p_batch and state = 'READY');
end;
$function$;

revoke all on function public.onboard_batch(uuid, timestamptz, uuid[], text[], text) from public, anon;
grant execute on function public.onboard_batch(uuid, timestamptz, uuid[], text[], text) to authenticated, service_role;

notify pgrst, 'reload schema';
