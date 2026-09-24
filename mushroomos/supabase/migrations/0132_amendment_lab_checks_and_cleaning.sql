-- ─────────────────────────────────────────────────────────────────────────────
-- 0132 · AMENDMENT LAB CHECKS AND CLEANING ARE REAL WORK, NOT NOTES.
--
-- 0130 recorded "Lab before/after" and "cleaning before/after" as text on the amendment. The Admin now
-- DECIDES them (user ruling 24 Sep 2026: tick boxes, Record-or-Gate chosen by the Admin, pre-ticked only as
-- a suggestion from the SOP's own checkpoint; cleaning creates a real job and the step may wait for it):
--
--   Lab check   → one Lab task per chosen side (before / after the new step), in the Lab queue, carrying
--                 exactly the ticked parameters. Its checkpoint lives in map 'AMEND' (kind RECORD or GATE).
--                 GATE uses the existing machinery unchanged: a LAB_APPROVED rule on the gated step plus a
--                 lab_checkpoint_activity binding. Before → gates the new step; after → gates the steps that
--                 now wait for it. Recorded ≠ approved still holds. No specification band is invented: the
--                 readings are recorded without a pass/fail range.
--   Cleaning    → one bunker/tunnel cleaning job per ticked resource (request_vessel_cleaning, unchanged;
--                 an already-open job for that resource is reused). If the Admin asks the work to wait,
--                 the waiting step gets a VESSEL_READY rule naming those jobs.
--   VESSEL_READY → new gate kind in evaluate_gates: open only when every named cleaning job is DONE.
--                 evaluate_gates is re-created from its LIVE definition (24 Sep 2026, including 0119–0124)
--                 with that one branch added; nothing else in it changes.
--
-- Rollback: db-rollback/pre_0132__evaluate_gates.sql (+ drop the functions below; 0130's amend returns).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.batch_amendment
  add column if not exists lab_params         text[]  not null default '{}',
  add column if not exists lab_gate           boolean not null default false,
  add column if not exists clean_location_ids uuid[]  not null default '{}',
  add column if not exists clean_wait         boolean not null default false,
  add column if not exists lab_activity_ids   uuid[]  not null default '{}',
  add column if not exists cleaning_task_ids  uuid[]  not null default '{}';

drop view if exists public.v_batch_amendment;
create view public.v_batch_amendment with (security_invoker = on) as
select am.*, mb.code as batch_code, aft.title as after_title, aft.baseline_end_hour as after_end_hour,
       nw.code as new_code, nw.state::text as new_state, nw.baseline_start_hour as new_start_hour,
       nw.baseline_end_hour as new_end_hour, p.display_name as created_by_name,
       (select coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'state', t.state) order by l.label), '[]'::jsonb)
          from public.vessel_readiness_task t join public.location l on l.id = t.location_id
         where t.id = any (am.cleaning_task_ids)) as cleaning_jobs,
       (select coalesce(jsonb_agg(jsonb_build_object('title', b.title, 'state', b.state) order by b.code), '[]'::jsonb)
          from public.batch_activity b where b.id = any (am.lab_activity_ids)) as lab_tasks
  from public.batch_amendment am
  join public.master_batch mb on mb.id = am.master_batch_id
  left join public.batch_activity aft on aft.id = am.after_activity_id
  left join public.batch_activity nw on nw.id = am.new_activity_id
  left join public.profiles p on p.id = am.created_by;
grant select on public.v_batch_amendment to authenticated;

-- ── evaluate_gates, live definition + VESSEL_READY (needs 0131 for the AMEND map) ───────────────────────────
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
  v_tg      record;
  v_demo    boolean;
begin
  if p_phase not in ('entry','exit') then
    raise exception 'phase must be entry or exit, got %', p_phase;
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  -- 0098 · a DEMO / TEST batch has no clock: rests, elapsed times and Day-0 durations are met at once.
  -- Order, photos, readings, Lab approvals and roles are unchanged.
  v_demo := public.batch_clock_waived(ba.master_batch_id);

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
      -- 0096 · "WITH X": a Lab check opens when its field step has STARTED, not when it has finished.
      if coalesce(g.config->>'when', '') = 'started' then
        select coalesce(bool_and(x.actual_start is not null
                                 or x.state in ('IN_PROGRESS','COMPLETED','SKIPPED','DEVIATION')), true)
          into v_ok
          from batch_activity x
         where x.master_batch_id = ba.master_batch_id
           and x.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
           and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE'
                or x.instance_no = ba.instance_no);
      end if;
      -- 0051 · A rest measured from the PREDECESSOR'S ACTUAL END.
      -- The Turner: 8 h after THAT PILE'S OWN T1 end. Not T0 start + 24 h (F10),
      -- and not ELAPSED_TIME, which measures from this activity's own start.
      v_hours := case when v_demo then null else nullif(g.config->>'min_rest_hr', '')::numeric end;

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

        elsif st.last_actual_end is null and not exists (
                select 1 from batch_activity x
                 where x.master_batch_id = ba.master_batch_id
                   and x.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
                   and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or x.instance_no = ba.instance_no)
                   and not x.before_tracking) then
          -- 0106 · the step before happened before MushroomOS tracking (onboarded batch): its rest is in the past too.
          v_ok := true;

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
          v_sub_ok := v_demo or (ba.actual_start is not null and v_hours is not null
                      and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int));
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
      if v_demo then
        v_ok := true;
      elsif ba.day0_duration_hr is null then
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
      v_ok := v_demo or (ba.actual_start is not null and v_hours is not null
              and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int));
      v_vars := v_vars || jsonb_build_object(
        'elapsed', case when ba.actual_start is null then 'not started'
                        else round(extract(epoch from (now() - ba.actual_start)) / 3600, 1)::text end);

    elsif g.kind = 'MIN_DURATION' then
      -- 0096 · THE TIME GATE. The work cannot be finished before its SOP time has passed since Start
      -- (a hold: since the step before it finished), and a hold with a temperature trigger needs the
      -- trigger exactly as the SOP states it (OR / AND). time_gate_status carries the rule.
      select * into v_tg from public.time_gate_status(ba.id);
      v_ok := v_tg.ok;
      v_vars := v_vars || jsonb_build_object(
        'time_gate', v_tg.summary, 'ready_at', v_tg.ready_label, 'remaining', v_tg.remaining_label);

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

    elsif g.kind = 'VESSEL_READY' then
      -- 0131 · RESOURCE READINESS. This step waits for named bunker/tunnel cleaning jobs (Resources screen) to be
      -- DONE. A pending, running or cancelled job keeps it shut: cancelling a job is not the same as cleaning.
      select count(*)::int,
             count(*) filter (where t.state = 'DONE')::int,
             string_agg(l.label, ', ' order by l.label) filter (where t.state <> 'DONE')
        into v_out_n, v_cp, v_out_lbl
        from vessel_readiness_task t
        join location l on l.id = t.location_id
       where t.id in (select (jsonb_array_elements_text(coalesce(g.config->'task_ids', '[]'::jsonb)))::uuid);
      v_ok := coalesce(v_out_n, 0) = 0 or v_cp = v_out_n;
      v_vars := v_vars || jsonb_build_object('vessels', coalesce(v_out_lbl, 'the resource'));

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

-- ── one Lab task for an amendment ────────────────────────────────────────────
create or replace function public.amend_add_lab_check(
  p_batch uuid, p_def uuid, p_new_code text, p_phase text, p_pred_code text, p_params text[], p_gate boolean,
  p_gated_codes text[], p_start_h numeric, p_start_at timestamptz, p_title text, p_seq int, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  b master_batch;
  v_tpl uuid;
  v_tcp lab_checkpoint;
  v_code text := p_new_code || '-LAB-' || case when p_phase = 'before' then 'B' else 'A' end;
  v_label text := 'Lab check ' || p_phase || ': ' || p_title;
  v_pa uuid;
  v_ba uuid;
  v_gated text[] := coalesce(p_gated_codes, '{}');
  v_i int;
  v_cp text;
  v_gpa uuid;
begin
  select * into b from master_batch where id = p_batch;
  if coalesce(array_length(p_params, 1), 0) = 0 then
    raise exception 'Tick at least one Lab parameter for the % check.', p_phase;
  end if;
  if exists (select 1 from unnest(p_params) x where not exists (select 1 from lab_parameter lp where lp.code = x)) then
    raise exception 'Unknown Lab parameter in %.', p_params;
  end if;

  -- The Lab activity of this batch's SOP that the new task copies (sample photo, Lab routing).
  select pa.id into v_tpl from process_activity pa
   where pa.process_definition_id = b.process_definition_id and pa.code = 'LAB-HOP-PRE';
  if v_tpl is null then
    select pa.id into v_tpl from process_activity pa join lab_checkpoint_activity l on l.process_activity_id = pa.id
     where pa.process_definition_id = b.process_definition_id and pa.responsible_role = 'lab_tech' order by pa.code limit 1;
  end if;
  if v_tpl is null then raise exception 'This batch''s SOP has no Lab activity to base a Lab check on.'; end if;
  select cp.* into v_tcp from lab_checkpoint cp join lab_checkpoint_activity l
      on l.checkpoint_map = cp.checkpoint_map and l.checkpoint_code = cp.code
   where l.process_activity_id = v_tpl limit 1;

  v_pa := public.sop_copy_activity(v_tpl, p_def, v_code, false, false);
  update process_activity
     set label_template = v_label, lab_parameters = p_params, standard_start_hour = p_start_h, standard_end_hour = p_start_h,
         rel_day = floor(p_start_h / 24)::int, standard_hour_source = 'sop_duration_chain', seq = p_seq,
         is_hold = false, is_time_gate = false, is_pre_h0 = false, pre_h0_offset = null, planning_unresolved = false,
         source_ref = 'Batch ' || b.code || ' amendment: ' || p_reason
   where id = v_pa;
  insert into gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence, blocked_reason_template, ordering)
  values (v_pa, 'entry', 'PREDECESSOR',
          jsonb_build_object('activity_codes', jsonb_build_array(p_pred_code), 'field_step', p_new_code, 'lab_relation', p_phase),
          'ALL_INSTANCES', true, 'dictated',
          'Locked — this check opens when {predecessor_label} has finished.', 10),
         (v_pa, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb, null, true, 'dictated',
          'Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}', 20);

  -- One checkpoint per gated step (the binding carries a single gated code); a RECORD needs just one.
  if not p_gate or array_length(v_gated, 1) is null then v_gated := array[p_new_code]; end if;
  for v_i in 1 .. array_length(v_gated, 1) loop
    v_cp := v_code || case when v_i = 1 then '' else '-G' || v_i end;
    insert into lab_checkpoint (checkpoint_map, code, name, rel_day, scope, parameters, source_ref, is_prebatch, kind,
                                evidence_kinds, per_pile, stage, guidance, sort_order, confidence)
    values ('AMEND', v_cp, v_label, null, coalesce(v_tcp.scope, 'master'), p_params,
            'Batch ' || b.code || ' amendment, chosen by Admin: ' || p_reason, false,
            case when p_gate then 'GATE' else 'RECORD' end, coalesce(v_tcp.evidence_kinds, array['SAMPLE_PHOTO']), false,
            v_tcp.stage, 'Chosen by the Admin on a batch amendment. No specification band is defined, so readings are recorded without a pass/fail range.',
            coalesce(v_tcp.sort_order, 0), v_tcp.confidence);
    insert into lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
    values ('AMEND', v_cp, v_pa, v_gated[v_i]);
    if p_gate then
      select ba.process_activity_id into v_gpa from batch_activity ba
       join process_activity pa on pa.id = ba.process_activity_id and pa.process_definition_id = p_def
       where ba.master_batch_id = p_batch and ba.code = v_gated[v_i] limit 1;
      if v_gpa is not null and not exists (select 1 from gate_rule g where g.process_activity_id = v_gpa and g.kind = 'LAB_APPROVED') then
        insert into gate_rule (process_activity_id, phase, kind, config, is_enabled, mapping_confidence, blocked_reason_template, ordering)
        values (v_gpa, 'entry', 'LAB_APPROVED', jsonb_build_object('checkpoint_map', 'AMEND'), true, 'dictated',
                'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of {required_count} approved. A recorded result is not an approved result.', 15);
      end if;
    end if;
  end loop;

  insert into batch_activity (master_batch_id, process_activity_id, code, title, stream, rel_day, seq, scope, scope_label, instance_no,
    baseline_start_hour, baseline_end_hour, planned_start_at, planned_end_at, duration_target_min_hr, duration_target_max_hr,
    is_time_gate, is_pre_h0, is_hold, planned_hour_source, state, blocked_reason)
  select p_batch, v_pa, v_code, v_label, pa.stream, floor(p_start_h / 24)::int, p_seq, pa.scope, 'Whole batch', 1,
         p_start_h, p_start_h, p_start_at, p_start_at, pa.duration_target_min_hr, pa.duration_target_max_hr,
         false, false, false, 'standard',
         case when b.status = 'draft' then 'LOCKED' else 'WAITING_CONDITION' end::activity_state,
         'Opens when the step before it has finished'
    from process_activity pa where pa.id = v_pa
  returning id into v_ba;
  insert into batch_activity_evidence_req (batch_activity_id, key, label, media_kinds, min_count, gates_submission, capture_hint, ordering, capture_phase)
  select v_ba, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
    from evidence_requirement er where er.process_activity_id = v_pa;
  return v_ba;
end;
$fn$;
revoke all on function public.amend_add_lab_check(uuid, uuid, text, text, text, text[], boolean, text[], numeric, timestamptz, text, int, text) from public, anon, authenticated;

-- ── the amendment, with real Lab tasks and cleaning jobs ──────────────────────
drop function if exists public.amend_batch_add_activity(uuid, uuid, text, text, numeric, boolean, text, text, text);

create or replace function public.amend_batch_add_activity(
  p_batch uuid, p_after uuid, p_template_code text, p_title text, p_duration_hr numeric,
  p_is_hold boolean default false, p_lab_check text default 'none', p_cleaning text default 'none',
  p_reason text default null, p_lab_params text[] default null, p_lab_gate boolean default false,
  p_clean_locations uuid[] default null, p_clean_wait boolean default false
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  b master_batch;
  a batch_activity;
  t process_activity;
  v_def uuid;
  v_code text;
  v_pa uuid;
  v_new uuid;
  v_start_h numeric;
  v_start_at timestamptz;
  v_n int;
  dep record;
  v_copy uuid;
  v_map jsonb := '{}'::jsonb;
  v_rewired text[] := '{}';
  v_prod_codes text[] := '{}';
  v_prod_pas uuid[] := '{}';
  v_lab_ids uuid[] := '{}';
  v_task_ids uuid[] := '{}';
  v_loc uuid;
  v_task uuid;
  v_wait_pas uuid[] := '{}';
  v_x uuid;
begin
  perform public.assert_role(array['admin']::app_role[], 'amend a running batch');
  select * into b from master_batch where id = p_batch for update;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status not in ('active', 'draft') then
    raise exception 'Batch % is %; only a draft or running batch can be amended.', b.code, b.status using errcode = 'check_violation';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or length(trim(p_reason)) < 5 then
    raise exception 'Say why this batch needs the extra step (at least a few words). It is kept in the batch record.';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Give the new activity a name.'; end if;
  if p_duration_hr is null or p_duration_hr <= 0 or p_duration_hr * 2 <> floor(p_duration_hr * 2) then
    raise exception 'Duration must be a positive number of hours in half-hour steps.';
  end if;
  if coalesce(p_lab_check, 'none') not in ('none','before','after','both') or coalesce(p_cleaning, 'none') not in ('none','before','after','both') then
    raise exception 'Lab check and cleaning must be none, before, after or both.';
  end if;
  if coalesce(p_cleaning, 'none') <> 'none' and coalesce(array_length(p_clean_locations, 1), 0) = 0 then
    raise exception 'Tick which bunker or tunnel needs cleaning.';
  end if;

  select * into a from batch_activity where id = p_after and master_batch_id = p_batch;
  if not found then raise exception 'That step is not part of batch %.', b.code; end if;
  if a.before_tracking then raise exception '% happened before MushroomOS tracked this batch; nothing can be inserted before tracked work.', a.title; end if;
  if a.baseline_start_hour is null then raise exception '% has no planned hour, so nothing can be placed after it.', a.title; end if;

  select * into t from process_activity where process_definition_id = b.process_definition_id and code = p_template_code;
  if not found then raise exception 'No activity % in this batch''s SOP to use as the template.', p_template_code; end if;

  for dep in
    select ba.title from batch_activity ba join gate_rule g on g.process_activity_id = ba.process_activity_id
     where ba.master_batch_id = p_batch and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
       and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started'
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = a.instance_no)
       and ba.actual_start is not null
  loop
    raise exception '"%" has already started, so a step cannot be inserted in front of it. Pick a later point.', dep.title
      using errcode = 'check_violation';
  end loop;

  select id into v_def from process_definition where code = 'AMEND-' || b.id::text;
  if v_def is null then
    insert into process_definition (code, name, version, status, source_ref, anchor_day_label, total_days, envelope_confidence)
    select 'AMEND-' || b.id::text, 'Amendments to batch ' || b.code, 1, 'archived',
           'Batch-specific amendments to ' || b.code || ' — not an SOP', pd.anchor_day_label, pd.total_days, 'UNRESOLVED'
      from process_definition pd where pd.id = b.process_definition_id
    returning id into v_def;
  end if;

  select count(*) + 1 into v_n from batch_amendment where master_batch_id = p_batch;
  v_code := 'AMD' || lpad(v_n::text, 2, '0') || '-' || regexp_replace(a.code, '^AMD[0-9]+-', '');
  v_start_h := coalesce(a.baseline_end_hour, a.baseline_start_hour);
  v_start_at := coalesce(a.planned_end_at, a.planned_start_at);

  v_pa := public.sop_copy_activity(t.id, v_def, v_code, false, false);
  update process_activity
     set label_template = trim(p_title), stream = a.stream, scope = a.scope, stage = (select stage from process_activity where id = a.process_activity_id),
         seq = a.seq, standard_start_hour = v_start_h, standard_end_hour = v_start_h + p_duration_hr,
         rel_day = floor(v_start_h / 24)::int, standard_hour_source = 'sop_duration_chain',
         duration_target_min_hr = p_duration_hr, duration_target_max_hr = p_duration_hr,
         is_hold = coalesce(p_is_hold, false), is_time_gate = coalesce(p_is_hold, false),
         is_pre_h0 = false, pre_h0_offset = null, planning_unresolved = false, material_role = null, required_material_code = null,
         default_enabled = true, source_ref = 'Batch ' || b.code || ' amendment: ' || trim(p_reason)
   where id = v_pa;
  insert into gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence, blocked_reason_template, ordering)
  values (v_pa, 'entry', 'PREDECESSOR', jsonb_build_object('activity_codes', jsonb_build_array(a.code)),
          'ALL_INSTANCES', true, 'dictated', 'Waiting for {predecessor_label}', 10),
         (v_pa, 'exit', 'MIN_DURATION', jsonb_build_object('hours', p_duration_hr, 'source', 'batch amendment'),
          null, true, 'dictated', 'Needs {duration} before it can finish', 20);
  if exists (select 1 from evidence_requirement where process_activity_id = v_pa) then
    insert into gate_rule (process_activity_id, phase, kind, config, is_enabled, mapping_confidence, blocked_reason_template, ordering)
    values (v_pa, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb, true, 'dictated', 'Photos are still missing', 30);
  end if;

  insert into batch_activity (
    master_batch_id, process_activity_id, code, title, stream, rel_day, seq, scope, scope_label, instance_no,
    baseline_start_hour, baseline_end_hour, planned_start_at, planned_end_at,
    duration_target_min_hr, duration_target_max_hr, is_time_gate, is_pre_h0, is_hold, planned_hour_source, state, blocked_reason)
  values (
    p_batch, v_pa, v_code, trim(p_title), a.stream, floor(v_start_h / 24)::int, a.seq, a.scope, a.scope_label, a.instance_no,
    v_start_h, v_start_h + p_duration_hr, v_start_at,
    case when v_start_at is null then null else v_start_at + make_interval(secs => (p_duration_hr * 3600)::int) end,
    p_duration_hr, p_duration_hr, coalesce(p_is_hold, false), false, coalesce(p_is_hold, false), 'standard',
    case when b.status = 'draft' then 'LOCKED' else 'WAITING_CONDITION' end::activity_state,
    'Waiting for ' || a.title)
  returning id into v_new;

  insert into batch_activity_evidence_req (batch_activity_id, key, label, media_kinds, min_count, gates_submission, capture_hint, ordering, capture_phase)
  select v_new, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
    from evidence_requirement er where er.process_activity_id = v_pa;
  insert into batch_activity_value (batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max, sop_source_ref, conflict_id,
                                    variance_allowed, section, operator_input, display_order, datatype)
  select v_new, af.key, af.label, af.unit, af.sop_value, af.sop_min, af.sop_max, af.sop_source_ref, af.conflict_id,
         af.default_variance, af.section, af.operator_input, af.display_order, af.datatype
    from activity_field af where af.process_activity_id = v_pa;

  for dep in
    select distinct on (ba.id) ba.id as ba_id, ba.code, ba.responsible_role::text as role,
           ba.process_activity_id as pa_id, pa.process_definition_id as pa_def
      from batch_activity ba
      join process_activity pa on pa.id = ba.process_activity_id
      join gate_rule g on g.process_activity_id = ba.process_activity_id
     where ba.master_batch_id = p_batch and ba.id <> v_new and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
       and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started'
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = a.instance_no)
  loop
    if dep.pa_def = v_def then
      v_copy := dep.pa_id;
    elsif v_map ? dep.pa_id::text then
      v_copy := (v_map->>dep.pa_id::text)::uuid;
    else
      v_copy := public.sop_copy_activity(dep.pa_id, v_def,
                  dep.code || '~' || v_n::text || '~' || substr(md5(dep.pa_id::text), 1, 4), true, true);
      v_map := v_map || jsonb_build_object(dep.pa_id::text, v_copy);
    end if;
    update gate_rule g
       set config = jsonb_set(g.config, '{activity_codes}',
             (select jsonb_agg(case when x = a.code then v_code else x end) from jsonb_array_elements_text(g.config->'activity_codes') x))
     where g.process_activity_id = v_copy and g.phase = 'entry' and g.kind = 'PREDECESSOR'
       and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started';
    update batch_activity set process_activity_id = v_copy where id = dep.ba_id and process_activity_id <> v_copy;
    v_rewired := v_rewired || dep.code;
    if dep.role <> 'lab_tech' then
      v_prod_codes := v_prod_codes || dep.code;
      v_prod_pas := v_prod_pas || v_copy;
    end if;
  end loop;

  -- Lab checks the Admin chose.
  if coalesce(p_lab_check, 'none') in ('before', 'both') then
    v_lab_ids := v_lab_ids || public.amend_add_lab_check(p_batch, v_def, v_code, 'before', a.code, p_lab_params, coalesce(p_lab_gate, false),
                   array[v_code], v_start_h, v_start_at, trim(p_title), a.seq, trim(p_reason));
  end if;
  if coalesce(p_lab_check, 'none') in ('after', 'both') then
    v_lab_ids := v_lab_ids || public.amend_add_lab_check(p_batch, v_def, v_code, 'after', v_code, p_lab_params, coalesce(p_lab_gate, false),
                   v_prod_codes, v_start_h + p_duration_hr,
                   case when v_start_at is null then null else v_start_at + make_interval(secs => (p_duration_hr * 3600)::int) end,
                   trim(p_title), a.seq, trim(p_reason));
  end if;

  -- Cleaning jobs the Admin chose (an open job for the same resource is reused, never duplicated).
  if coalesce(p_cleaning, 'none') <> 'none' then
    foreach v_loc in array p_clean_locations loop
      select id into v_task from vessel_readiness_task where location_id = v_loc and state in ('PENDING', 'IN_PROGRESS');
      if v_task is null then
        v_task := public.request_vessel_cleaning(v_loc, p_batch, null,
                    'Batch ' || b.code || ': clean ' || p_cleaning || ' "' || trim(p_title) || '" — ' || trim(p_reason));
      end if;
      v_task_ids := v_task_ids || v_task;
    end loop;
    if coalesce(p_clean_wait, false) then
      if p_cleaning in ('before', 'both') then v_wait_pas := v_wait_pas || v_pa; end if;
      if p_cleaning in ('after', 'both') then v_wait_pas := v_wait_pas || v_prod_pas; end if;
      foreach v_x in array v_wait_pas loop
        insert into gate_rule (process_activity_id, phase, kind, config, is_enabled, mapping_confidence, blocked_reason_template, ordering)
        values (v_x, 'entry', 'VESSEL_READY', jsonb_build_object('task_ids', to_jsonb(v_task_ids)), true, 'dictated',
                'Waiting for {vessels} to be cleaned — see Resources.', 12);
      end loop;
    end if;
  end if;

  insert into batch_amendment (master_batch_id, after_activity_id, new_activity_id, template_code, title, duration_hr,
                               is_hold, lab_check, cleaning, reason, rewired_codes, created_by,
                               lab_params, lab_gate, clean_location_ids, clean_wait, lab_activity_ids, cleaning_task_ids)
  values (p_batch, a.id, v_new, p_template_code, trim(p_title), p_duration_hr, coalesce(p_is_hold, false),
          coalesce(p_lab_check, 'none'), coalesce(p_cleaning, 'none'), trim(p_reason), v_rewired, auth.uid(),
          coalesce(p_lab_params, '{}'), coalesce(p_lab_gate, false), coalesce(p_clean_locations, '{}'),
          coalesce(p_clean_wait, false), v_lab_ids, v_task_ids);

  if b.status = 'active' then
    perform public.advance_batch(p_batch);
  end if;
  return v_new;
end;
$fn$;
revoke all on function public.amend_batch_add_activity(uuid, uuid, text, text, numeric, boolean, text, text, text, text[], boolean, uuid[], boolean) from public, anon;
grant execute on function public.amend_batch_add_activity(uuid, uuid, text, text, numeric, boolean, text, text, text, text[], boolean, uuid[], boolean) to authenticated;

-- What the insert form offers: every Lab parameter (not the pre-H0 weights), and, per SOP activity, the
-- parameters of its own Lab check — shown as a SUGGESTION the Admin may change.
create or replace view public.v_lab_parameter_choice with (security_invoker = on) as
select code, label, unit, value_kind from public.lab_parameter where code not like 'wt\_%' escape '\';
grant select on public.v_lab_parameter_choice to authenticated;

notify pgrst, 'reload schema';
