-- ─────────────────────────────────────────────────────────────────────────────
-- 0092 · PROCESS-2026G v1 — tunnel preparation is a PARALLEL PREREQUISITE of tunnel loading.
--
-- Factory statement (user, 15 Sep 2026), answering SOP-U05:
--   Tunnel preparation is an independently executable prerequisite activity. It is not caused by, and
--   does not wait for, bunker reload / hold work. It is done ahead of tunnel loading (approximately
--   1 hour before). Tunnel loading may start only when tunnel preparation is complete AND all its other
--   prerequisites and Lab gates are satisfied. The ~1 h is a planning relationship, not a timestamp.
--
-- PROCESS-2026F is published (frozen), so this is a new version: a copy of 2026F with ONLY:
--   1 · TN-PREP loses its UNRESOLVED_DEPENDENCY gate and has no entry gate at all — it is available as
--       soon as the batch is live, in parallel with the main process, and a Supervisor performs it
--       (Start → photos → checklist → Finish, as the SOP defines). Nothing starts it automatically.
--   2 · Tunnel loading (bunker 1, 2, 3) keeps TN-PREP in its predecessors (unchanged rule) and now
--       carries the planning relationship as process data in the same rule's config:
--         "prerequisites": {"TN-PREP": {"relation": "parallel_prerequisite", "planned_lead_hr": 1,
--                                        "approximate": true, "source": ...}}
--       The engine reads only activity_codes / min_rest_hr, so this changes no eligibility and writes
--       no timestamp. Every activity stays planning_unresolved (no planned hours are fabricated).
--   3 · TN-PREP instruction says it is done before tunnel loading (about 1 hour before); SOP text kept.
--   4 · Register: SOP-U05 resolved.
-- Everything else — tasks, readings, checklists, photos, Lab bindings, gates — is copied unchanged.
-- Created as DRAFT; publishing and making it current are separate audited steps.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026G' and version = 1) then
    raise exception 'PROCESS-2026G v1 already exists; 0092 does not overwrite a process definition.';
  end if;
  if not exists (select 1 from public.process_definition where code = 'PROCESS-2026F' and version = 1) then
    raise exception '0092 needs PROCESS-2026F v1 as its base.';
  end if;
end $$;

update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved by the factory (15 Sep 2026): tunnel preparation is an independent parallel prerequisite, done about 1 hour before tunnel loading; tunnel loading requires it complete. PROCESS-2026G: TN-PREP has no entry gate; tunnel loading keeps it as a predecessor.'
 where conflict_id = 'SOP-U05';

insert into public.process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
  envelope_confidence, envelope_hours, envelope_hour_source)
select 'PROCESS-2026G', 'Current factory process baseline 15-09-2026 (tunnel preparation as a parallel prerequisite)', 1, 'draft',
       e.source_ref || ' · factory statement 15 Sep 2026: tunnel preparation is a parallel prerequisite (~1 h before tunnel loading)',
       e.anchor_day_label, e.total_days, e.envelope_confidence, e.envelope_hours, e.envelope_hour_source
from public.process_definition e where e.code = 'PROCESS-2026F' and e.version = 1;

-- activities
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq,
  scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0, is_time_gate,
  is_optional, default_enabled, golden_rule, source_ref, tbd_marker, responsible_role, lab_parameters, admin_question,
  day_span_label, standard_start_hour, standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset,
  timing_confidence, is_hold, stage, instructions, skip_policy, parallel_group, notes, planning_unresolved)
select g.id, e.code, e.label_template, e.material_role, e.stream, e.rel_day, e.seq,
  e.scope, e.cardinality_rule, e.duration_target_min_hr, e.duration_target_max_hr, e.duration_required_at_day0, e.is_time_gate,
  e.is_optional, e.default_enabled, e.golden_rule,
  case when e.code = 'TN-PREP' then e.source_ref || ' · factory statement 15 Sep 2026 (parallel prerequisite of tunnel loading)' else e.source_ref end,
  case when e.code = 'TN-PREP' then null else e.tbd_marker end,
  e.responsible_role, e.lab_parameters, e.admin_question,
  e.day_span_label, e.standard_start_hour, e.standard_end_hour, e.standard_hour_source, e.is_pre_h0, e.pre_h0_offset,
  e.timing_confidence, e.is_hold, e.stage,
  case when e.code = 'TN-PREP'
       then 'Prepare the tunnel before tunnel loading — finish it about 1 hour before loading starts. ' || e.instructions
       else e.instructions end,
  e.skip_policy,
  case when e.code = 'TN-PREP' then 'TUNNEL_PREREQUISITE' else e.parallel_group end,
  case when e.code = 'TN-PREP'
       then coalesce(e.notes || ' · ', '') || 'Parallel prerequisite: independent of bunker reload/hold work; tunnel loading requires it complete. Planned about 1 h before tunnel loading (planning relationship, not a timestamp).'
       else e.notes end,
  e.planning_unresolved
from public.process_activity e
cross join (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1) g
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1);

-- readings and checklists
insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
  sop_source_ref, conflict_id, day0_editable, day0_required, default_variance, operator_input, remarks_default, section,
  step_no, display_order)
select n.id, af.key, af.label, af.datatype, af.unit, af.sop_value, af.sop_min, af.sop_max,
  af.sop_source_ref, af.conflict_id, af.day0_editable, af.day0_required, af.default_variance, af.operator_input,
  af.remarks_default, af.section, af.step_no, af.display_order
from public.activity_field af
join public.process_activity e on e.id = af.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1);

-- photo requirements
insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
  gates_submission, capture_hint, ordering, capture_phase)
select n.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
  er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
from public.evidence_requirement er
join public.process_activity e on e.id = er.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1);

-- gates: copied; TN-PREP's unresolved dependency is not carried; tunnel loading records the prerequisite relationship
insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled,
  mapping_confidence, conflict_id, blocked_reason_template, ordering, is_protected)
select n.id, gr.phase, gr.kind,
  case when gr.kind = 'PREDECESSOR' and e.code like 'BNK-B_-TUN-LOAD'
       then gr.config || jsonb_build_object('prerequisites', jsonb_build_object('TN-PREP', jsonb_build_object(
              'relation', 'parallel_prerequisite',
              'planned_lead_hr', 1,
              'approximate', true,
              'source', 'Factory statement 15 Sep 2026: tunnel preparation is completed about 1 hour before tunnel loading')))
       else gr.config end,
  gr.predecessor_binding, gr.is_enabled, gr.mapping_confidence, gr.conflict_id, gr.blocked_reason_template, gr.ordering, gr.is_protected
from public.gate_rule gr
join public.process_activity e on e.id = gr.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
  and not (gr.kind = 'UNRESOLVED_DEPENDENCY' and e.code = 'TN-PREP');

-- lab bindings
insert into public.lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
select lca.checkpoint_map, lca.checkpoint_code, n.id, lca.gates_activity_code
from public.lab_checkpoint_activity lca
join public.process_activity e on e.id = lca.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1);

-- self-check
do $$
declare d uuid := (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1);
        f uuid := (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1); n int; m int; bad text;
begin
  select count(*) into n from public.process_activity where process_definition_id = d;
  if n <> 113 then raise exception '0092: expected 113 activities, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind = 'UNRESOLVED_DEPENDENCY';
  if n <> 0 then raise exception '0092: expected no unresolved dependency, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and pa.code = 'TN-PREP' and g.phase = 'entry';
  if n <> 0 then raise exception '0092: tunnel preparation must have no entry gate (parallel prerequisite)'; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and pa.code like 'BNK-B_-TUN-LOAD' and g.kind = 'PREDECESSOR'
     and g.config->'activity_codes' ? 'TN-PREP' and (g.config->'prerequisites'->'TN-PREP'->>'planned_lead_hr')::numeric = 1;
  if n <> 3 then raise exception '0092: all three tunnel loadings must require TN-PREP and carry the planning relationship, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id where pa.process_definition_id = d;
  select count(*) into m from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id where pa.process_definition_id = f;
  if n <> m - 1 then raise exception '0092: expected exactly one gate fewer than 2026F (% vs %)', n, m; end if;
  select count(*) into n from public.evidence_requirement er join public.process_activity pa on pa.id = er.process_activity_id where pa.process_definition_id = d;
  select count(*) into m from public.evidence_requirement er join public.process_activity pa on pa.id = er.process_activity_id where pa.process_definition_id = f;
  if n <> m then raise exception '0092: photo requirements differ from 2026F (% vs %)', n, m; end if;
  select count(*) into n from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id where pa.process_definition_id = d;
  select count(*) into m from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id where pa.process_definition_id = f;
  if n <> m then raise exception '0092: readings differ from 2026F (% vs %)', n, m; end if;
  select count(*) into n from public.lab_checkpoint_activity lca join public.process_activity pa on pa.id = lca.process_activity_id where pa.process_definition_id = d;
  if n <> 41 then raise exception '0092: expected 41 lab bindings, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = d and not planning_unresolved;
  if n <> 0 then raise exception '0092: % activities are not flagged planning_unresolved', n; end if;
end $$;

notify pgrst, 'reload schema';
