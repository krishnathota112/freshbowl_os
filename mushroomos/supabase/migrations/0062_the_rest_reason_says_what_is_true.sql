-- ─────────────────────────────────────────────────────────────────────────────
-- 0062 · The Turner rest gate says something true.
--
-- WHAT AN OPERATOR ACTUALLY SEES TODAY, read straight off `v_my_work` on TRN-P1-T2:
--
--     Locked — Turner T1 — pile 1 finished at not recorded. This pile rests not recorded h
--     after its own T1 ends; not recorded still to go.
--
--   Three unresolved placeholders — and worse than the missing numbers, a sentence asserting the
--   predecessor FINISHED when it has not started. `blocked_reason` is the field the Operator screen
--   renders VERBATIM, on the standing instruction that a screen must never invent a reason of its
--   own. A wrong reason here is a wrong reason on the factory floor.
--
-- WHY — this is 0051's defect, and mine
--   0051 taught `evaluate_gates` to measure the rest from the predecessor's ACTUAL END, and set
--   `rest_required_hr`, `rest_remaining` and `predecessor_ended_at` for the template. It put that
--   population inside `if v_ok and v_hours is not null`, where `v_ok` means THE PREDECESSOR IS
--   COMPLETE. So the variables exist only in the case where the rest clock is already running. In
--   the ordinary case they are absent, and `render_gate_reason` does the right thing with what it
--   was given: it rewrites every unresolved `{token}` as "not recorded", because leaving
--   `{rest_remaining}` on a card is worse, and silently inventing a value is worse still.
--
--   THE GATE WAS NEVER WRONG. `min_rest_hr = 8` is in the data, `evaluate_gates` honours it, and
--   the T2 enforcement is proved. Only the sentence was wrong — precisely the class of defect a
--   green suite cannot see and one real row shows instantly.
--
-- WHAT THIS CHANGES
--   `rest_required_hr` is populated whenever the RULE carries one, and a new `{rest_status}` states
--   the case in a single clause so one template reads correctly either way. The six Turner T2
--   templates are rewritten to use it, and no longer assert a finish that may not have happened.
--
--   After this the same row reads:
--     Locked — waits on Turner T1 — pile 1. This pile rests 8 h after its own T1 ends.
--     That Turner T1 — pile 1 has not finished yet.
--   and once T1 finishes:
--     Locked — waits on Turner T1 — pile 1. This pile rests 8 h after its own T1 ends.
--     It finished at 09 Sep 14:20 — 03:40 still to go.
--
-- WHAT IS NOT CHANGED
--   No gate opens or closes differently. `v_ok` is computed exactly as before, including the
--   "complete but no finish time" branch, which still refuses. This migration decides what WORDS
--   describe a verdict, never the verdict.
--
-- HOW THIS FILE WAS BUILT
--   By patching the DEPLOYED body of `evaluate_gates` — 278 lines across eleven gate kinds —
--   between two statement anchors, not by retyping it. A first attempt rewrote the function from a
--   partial reading and silently dropped EVIDENCE_COMPLETE, LAB_APPROVED, DAY0_DURATION,
--   ELAPSED_TIME, MACHINE_STINT_CLOSED, FIELD_IN_RANGE and GM_APPROVAL. It was discarded unapplied.
-- ─────────────────────────────────────────────────────────────────────────────

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
$function$
;

-- The six Turner T2 templates. One sentence that is true whether or not T1 has finished.
update gate_rule g
   set blocked_reason_template =
       'Locked — waits on {predecessor_label}. This pile rests {rest_required_hr} h after its own '
       'T1 ends. {rest_status}'
  from process_activity pa
  join process_definition pd on pd.id = pa.process_definition_id
 where pa.id = g.process_activity_id
   and pd.code = 'PROCESS-2026C'
   and g.kind = 'PREDECESSOR'
   and g.config ? 'min_rest_hr';

do $a$
declare
  n int;
  sample text;
begin
  select count(*) into n
    from gate_rule g
    join process_activity pa on pa.id = g.process_activity_id
    join process_definition pd on pd.id = pa.process_definition_id
   where pd.code = 'PROCESS-2026C' and g.kind = 'PREDECESSOR' and g.config ? 'min_rest_hr';
  if n <> 6 then
    raise exception '0062 expected 6 Turner rest rules, found %', n;
  end if;

  select string_agg(distinct g.blocked_reason_template, ' | ') into sample
    from gate_rule g
    join process_activity pa on pa.id = g.process_activity_id
    join process_definition pd on pd.id = pa.process_definition_id
   where pd.code = 'PROCESS-2026C' and g.kind = 'PREDECESSOR' and g.config ? 'min_rest_hr';

  if sample not like '%{rest_status}%' then
    raise exception '0062 failed: template does not carry the case-bearing token — got %', sample;
  end if;
  if sample like '%finished at {predecessor_ended_at}%' then
    raise exception '0062 failed: template still asserts a finish that may not have happened';
  end if;

  raise notice '0062 · % Turner rest rules re-templated', n;
end $a$;

-- The eleven gate kinds this function handles must all still be here. The first attempt at this
-- migration lost seven of them; this asserts against a repeat.
do $a$
declare
  body text;
  k text;
begin
  select prosrc into body from pg_proc where proname = 'evaluate_gates';
  foreach k in array array[
    'PREDECESSOR', 'EVIDENCE_COMPLETE', 'LAB_APPROVED', 'GM_APPROVAL', 'DAY0_DURATION',
    'ELAPSED_TIME', 'MACHINE_STINT_CLOSED', 'FIELD_IN_RANGE', 'SENSOR_THRESHOLD',
    'BOTH', 'EITHER_OR'
  ] loop
    if position(k in body) = 0 then
      raise exception '0062 failed: evaluate_gates no longer handles %', k;
    end if;
  end loop;
  raise notice '0062 · all eleven gate kinds still handled';
end $a$;
