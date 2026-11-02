-- ─────────────────────────────────────────────────────────────────────────────
-- 0107 · MATERIAL-CONDITIONAL ELIGIBILITY — the engine capability "Local Paddy removes
-- Soak 3" needs, and did not have.
--
-- Audited 16 Sep 2026 (independent verification against the live migration chain, not
-- restated from an earlier note — see the correction in docs/CURRENT/KNOWN_CONFLICTS.md §1):
--
--   PADDY_PUNJAB and PADDY_LOCAL are both bound to the SAME material role, STRUCTURAL_STRAW
--   (supabase/seed/s02_reference.sql). generate_activity_plan's only eligibility rule
--   (0081) is "skip the whole activity if its role has NO material bound at all" — it has
--   no path to skip ONE activity for ONE material variant while keeping the rest of that
--   role's stream. So "Local Paddy removes Soak 3" cannot be expressed today, by any batch
--   configuration, in any process version. TBD-40 (conflict_register) already names this
--   as open — this migration is the resolution.
--
-- WHAT THIS MIGRATION DOES, AND DOES NOT DO:
--   · Adds ONE nullable authoring column, process_activity.required_material_code. NULL
--     (the default, and every existing row's value) changes nothing for any activity in
--     any published process version — this is purely additive.
--   · Teaches generate_activity_plan to honour it: an activity naming a required material
--     code is only generated when THAT material — not merely some material — is bound to
--     its role for this batch.
--   · Does NOT touch any existing process_definition's data. PROCESS-2026B and every later
--     published version are unchanged by this file, exactly as 0043's own rule requires
--     ("PROCESS-2026B is not touched. Batches were generated from it and their baselines
--     are frozen.").
--   · Does NOT yet mark STRAW-SOAK-3 (or its current-lineage equivalent, STR-SOAK-3) as
--     Punjab-only. Applying the flag is a process-DATA change, and process data is
--     versioned, copy-on-write, same as every prior SOP change (0043, 0090, 0092, 0093,
--     0094, 0097). Two facts are needed first, that only the live database — not any
--     migration file — can answer:
--       1. Which process_definition process_catalogue.current_definition_id actually
--          names right now (current_process_definition() reads a runtime row this
--          migration cannot see).
--       2. In that version's activity/gate graph, what currently depends on the straw
--          soak stream's last step completing (in PROCESS-2026B this is
--          STRAW-YARD-LOAD -> STRAW-REST-2 -> STRAW-SOAK-3 -> STRAW-SOAK-2; the naming
--          changed to STR-* from PROCESS-2026E onward, and 0083's seed folds a "resting
--          in bunkers" step into each STR-SOAK-*'s own checklist rather than a separate
--          REST activity, so the 2026B chain cannot be assumed to carry over unchanged).
--     Marking the wrong version, or the wrong downstream predecessor, would either do
--     nothing (batches keep using the real current version) or — worse — leave a real
--     batch's downstream activity permanently LOCKED, which is exactly the failure mode
--     this file exists to prevent, not cause. A follow-up migration applies the flag once
--     those two facts are confirmed against the live database.
--
-- gate_predecessor_status (0051) already treats a predecessor whose activity_codes match
-- ZERO rows in this batch as vacuously satisfied (`if v_total = 0 then ok := true`). That
-- is the right behaviour for a step that is genuinely optional and nothing downstream
-- cares which alternative happened (e.g. Reload-2 today). It is the WRONG behaviour here:
-- once Soak-3 is skipped, the real predecessor becomes Soak-2, and a gate that goes
-- vacuously true would let downstream work start immediately, before Soak-2 has even
-- finished — silently wrong, not merely unimplemented. Whichever gate_rule ends up gating
-- the step after Soak-3 in the live current version must therefore be widened to accept
-- EITHER outcome (list both the Punjab-path code and the Local-path code under the SAME
-- ALL_INSTANCES predecessor rule — v_total naturally counts only whichever of the two
-- exists in a given batch's generated plan, so listing both is correct for both variants
-- with no new binding type). That widening is part of the same follow-up migration.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.process_activity
  add column if not exists required_material_code text;

comment on column public.process_activity.required_material_code is
  'Optional. When set, this activity is only generated for a batch whose material bound '
  'to material_role has THIS code — not merely any material. NULL (default) means the '
  'existing rule applies unchanged: generated whenever material_role has any material '
  'bound. Requires material_role to be set; enforced below.';

alter table public.process_activity drop constraint if exists process_activity_required_material_needs_role;
alter table public.process_activity add constraint process_activity_required_material_needs_role
  check (required_material_code is null or material_role is not null);

-- generate_activity_plan, patched against the 0081 body: one added branch, nothing else
-- in the function changes.
CREATE OR REPLACE FUNCTION public.generate_activity_plan(p_batch_id uuid)
 RETURNS TABLE(activities integer, evidence_items integer, field_values integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.assert_role(array['admin', 'gm']::app_role[], 'generate a batch plan');

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

    -- 0107 · Skip an activity whose role IS bound, but not to the specific material this
    -- activity requires (e.g. Soak 3 requiring PADDY_PUNJAB when the batch binds
    -- PADDY_LOCAL to the same STRUCTURAL_STRAW role). NULL (the default) is unaffected.
    if a.required_material_code is not null
       and not exists (
         select 1 from batch_material_role bmr
         join material m on m.id = bmr.material_id
         where bmr.master_batch_id = p_batch_id
           and bmr.role = a.material_role
           and m.code = a.required_material_code
       ) then
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
        is_time_gate, golden_rule, tbd_marker, is_pre_h0, pre_h0_offset, state, blocked_reason
      ) values (
        p_batch_id, a.id, a.code,
        resolve_activity_label(p_batch_id, a.label_template, a.material_role, inst.instance_no),
        a.stream, a.rel_day, a.seq, a.scope,
        inst.scope_label, inst.instance_no, inst.planned_qty_mt,
        a.standard_start_hour, a.standard_end_hour,
        a.duration_target_min_hr, a.duration_target_max_hr, rest_hr,
        a.is_time_gate, a.golden_rule, a.tbd_marker, a.is_pre_h0, a.pre_h0_offset,
        -- A draft has opened nothing. activate_batch is what opens Day 0.
        'LOCKED'::activity_state,
        'pending'
      )
      returning id into new_id;
      n_act := n_act + 1;

      insert into batch_activity_evidence_req
        (batch_activity_id, key, label, media_kinds, min_count, gates_submission,
         capture_hint, ordering, capture_phase)
      select new_id, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission,
             er.capture_hint, er.ordering, er.capture_phase
      from evidence_requirement er
      where er.process_activity_id = a.id;
      n_ev := n_ev + (select count(*) from evidence_requirement where process_activity_id = a.id);

      insert into batch_activity_value
        (batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max,
         sop_source_ref, conflict_id, day0_value, variance_allowed, section,
         operator_input, display_order, datatype)
      select new_id, af.key, af.label, af.unit, af.sop_value, af.sop_min, af.sop_max,
             af.sop_source_ref, af.conflict_id,
             nullif(b.config->>('field_' || a.code || '_' || af.key), ''),
             af.default_variance, af.section, af.operator_input, af.display_order, af.datatype
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
$function$;
