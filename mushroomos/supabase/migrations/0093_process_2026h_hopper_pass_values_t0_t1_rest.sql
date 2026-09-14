-- ─────────────────────────────────────────────────────────────────────────────
-- 0093 · PROCESS-2026H v1 — factory answers of 15 Sep 2026 (user), applied to PROCESS-2026G (frozen).
--
--   1 · NEW HOPPER PASS (SOP-U19): 3 hours; the same two photos as the other passes (before + after);
--       bunker preparation and bunker cleaning are part of it (two checklist items). No Lab test and no
--       reading were given, so none are added.
--   2 · WATER HOPPER PASS (SOP-U20): 3 hours. The SOP's 16 h line = water pass + new pass (3 h) + rest (10 h),
--       so the water pass is 16 − 3 − 10 = 3 h — the same as every other hopper pass.
--   3 · TURNER T0 → T1: each pile rests 6 hours after its own T0 ends before T1 (same rule shape as the
--       existing 8 h T1 → T2 rest). Replaces the SOP's "no gap" wording (SOP-C04). Both rest messages drop the
--       predecessor name, which rendered as "—" once that pass had finished.
--   4 · PHOTO COUNTS (process owner asked for a working rule): production work 2 (before + after, bunker
--       and tunnel included), passive holds none, Lab checkpoints 1, or 2 where a second record is taken
--       (raw material lot + slip, bunker loading sample + height, final QC sample + after). This is the
--       rule the current data already follows; recorded, nothing else changes.
-- Everything else is copied unchanged. Created as DRAFT; publishing / making current are separate steps.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026H' and version = 1) then
    raise exception 'PROCESS-2026H v1 already exists; 0093 does not overwrite a process definition.';
  end if;
  if not exists (select 1 from public.process_definition where code = 'PROCESS-2026G' and version = 1) then
    raise exception '0093 needs PROCESS-2026G v1 as its base.';
  end if;
end $$;

-- register
update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved by the factory (15 Sep 2026): the new hopper pass takes 3 h, the same two photos (before + after), and includes bunker preparation and bunker cleaning. No Lab test or reading.'
 where conflict_id = 'SOP-U19';
update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved (15 Sep 2026): new pass 3 h and rest 10 h confirmed, so the water pass is 16 − 3 − 10 = 3 h.'
 where conflict_id = 'SOP-U20';
update public.conflict_register set status = 'decided',
  ship_with_default = 'Decided by the factory (15 Sep 2026): T1 starts after a 6 h rest from that pile''s own T0 end.'
 where conflict_id = 'SOP-C04';
insert into public.conflict_register (conflict_id, kind, severity, question, sources, ship_with_default, status) values
  ('SOP-C15', 'conflict', null,
   'Photo counts for Lab checkpoints and bunker/tunnel handling are "process owner to confirm" in the baseline.',
   'MushroomOS_Current_Process_Baseline_For_Claude.docx §7 · user 15 Sep 2026 ("make a theoretical count")',
   'Working rule: production work 2 photos (before + after), passive holds none, Lab checkpoints 1 — 2 where a second record is taken (raw material lot + slip, bunker loading sample + height, final QC sample + after).',
   'decided')
on conflict (conflict_id) do nothing;

insert into public.process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
  envelope_confidence, envelope_hours, envelope_hour_source)
select 'PROCESS-2026H', 'Current factory process 15-09-2026 (hopper passes 3 h, T0→T1 rest 6 h)', 1, 'draft',
       e.source_ref || ' · factory answers 15 Sep 2026: new hopper pass 3 h + 2 photos + bunker prep/cleaning; water pass 3 h; T0→T1 rest 6 h; photo-count rule',
       e.anchor_day_label, e.total_days, e.envelope_confidence, e.envelope_hours, e.envelope_hour_source
from public.process_definition e where e.code = 'PROCESS-2026G' and e.version = 1;

-- activities
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq,
  scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0, is_time_gate,
  is_optional, default_enabled, golden_rule, source_ref, tbd_marker, responsible_role, lab_parameters, admin_question,
  day_span_label, standard_start_hour, standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset,
  timing_confidence, is_hold, stage, instructions, skip_policy, parallel_group, notes, planning_unresolved)
select h.id, e.code, e.label_template, e.material_role, e.stream, e.rel_day, e.seq,
  e.scope, e.cardinality_rule,
  case when e.code in ('MIX-HOP-WATER', 'MIX-HOP-NEW') then 3 else e.duration_target_min_hr end,
  case when e.code in ('MIX-HOP-WATER', 'MIX-HOP-NEW') then 3 else e.duration_target_max_hr end,
  e.duration_required_at_day0, e.is_time_gate, e.is_optional, e.default_enabled, e.golden_rule,
  case e.code
    when 'MIX-HOP-NEW'   then e.source_ref || ' · factory 15 Sep 2026: 3 h, before + after photos, includes bunker preparation and cleaning'
    when 'MIX-HOP-WATER' then e.source_ref || ' · 3 h = SOP 16 h line − new pass 3 h − rest 10 h'
    when 'TRN-P1-T1' then e.source_ref || ' · factory 15 Sep 2026: 6 h rest after T0'
    when 'TRN-P2-T1' then e.source_ref || ' · factory 15 Sep 2026: 6 h rest after T0'
    when 'TRN-P3-T1' then e.source_ref || ' · factory 15 Sep 2026: 6 h rest after T0'
    when 'TRN-P4-T1' then e.source_ref || ' · factory 15 Sep 2026: 6 h rest after T0'
    when 'TRN-P5-T1' then e.source_ref || ' · factory 15 Sep 2026: 6 h rest after T0'
    when 'TRN-P6-T1' then e.source_ref || ' · factory 15 Sep 2026: 6 h rest after T0'
    else e.source_ref end,
  case when e.code in ('MIX-HOP-WATER', 'MIX-HOP-NEW') then null else e.tbd_marker end,
  e.responsible_role, e.lab_parameters, e.admin_question,
  e.day_span_label, e.standard_start_hour, e.standard_end_hour, e.standard_hour_source, e.is_pre_h0, e.pre_h0_offset,
  case when e.code in ('MIX-HOP-WATER', 'MIX-HOP-NEW') then 'FACTORY_CONFIRMED'::process_confidence else e.timing_confidence end,
  e.is_hold, e.stage,
  case when e.code = 'MIX-HOP-NEW'
       then 'Another hopper pass, straight after the water hopper pass. It includes bunker preparation and bunker cleaning.'
       else e.instructions end,
  e.skip_policy, e.parallel_group,
  case when e.code = 'MIX-HOP-NEW' then null else e.notes end,
  e.planning_unresolved
from public.process_activity e
cross join (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1) h
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1);

-- readings and checklists: copied; the new hopper pass gains bunker preparation and bunker cleaning
insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
  sop_source_ref, conflict_id, day0_editable, day0_required, default_variance, operator_input, remarks_default, section,
  step_no, display_order)
select n.id, af.key, af.label, af.datatype, af.unit, af.sop_value, af.sop_min, af.sop_max,
  af.sop_source_ref, af.conflict_id, af.day0_editable, af.day0_required, af.default_variance, af.operator_input,
  af.remarks_default, af.section, af.step_no, af.display_order
from public.activity_field af
join public.process_activity e on e.id = af.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1);

insert into public.activity_field (process_activity_id, key, label, datatype, sop_source_ref, operator_input, section, display_order)
select n.id, v.key, v.label, 'check', 'Factory 15 Sep 2026: bunker preparation and bunker cleaning are part of the new hopper pass',
       'required', 'Checklist', v.ord
from (values ('chk_1', 'Bunker preparation', 1), ('chk_2', 'Bunker cleaning', 2)) v(key, label, ord)
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = 'MIX-HOP-NEW';

-- photo requirements: copied; the new hopper pass takes the same two photos as the water pass
insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
  gates_submission, capture_hint, ordering, capture_phase)
select n.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
  er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
from public.evidence_requirement er
join public.process_activity e on e.id = er.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1);

insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
  gates_submission, capture_hint, ordering, capture_phase)
select n.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
  er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
from public.evidence_requirement er
join public.process_activity w on w.id = er.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = 'MIX-HOP-NEW'
where w.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1)
  and w.code = 'MIX-HOP-WATER';

-- gates: copied; T1 waits 6 h after its own pile's T0; the new hopper pass gets the photo exit rule
insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled,
  mapping_confidence, conflict_id, blocked_reason_template, ordering, is_protected)
select n.id, gr.phase, gr.kind,
  case when gr.kind = 'PREDECESSOR' and e.code like 'TRN-P_-T1' then gr.config || '{"min_rest_hr": 6}'::jsonb else gr.config end,
  gr.predecessor_binding, gr.is_enabled, gr.mapping_confidence, gr.conflict_id,
  case when gr.kind = 'PREDECESSOR' and e.code like 'TRN-P_-T1'
       then 'Locked — this pile rests {rest_required_hr} h after its own T0 ends. {rest_status}'
       -- same wording fix for the existing T1 → T2 rest: the predecessor's name is empty once it has finished
       when gr.kind = 'PREDECESSOR' and e.code like 'TRN-P_-T2'
       then 'Locked — this pile rests {rest_required_hr} h after its own T1 ends. {rest_status}'
       else gr.blocked_reason_template end,
  gr.ordering, gr.is_protected
from public.gate_rule gr
join public.process_activity e on e.id = gr.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1);

insert into public.gate_rule (process_activity_id, phase, kind, config, blocked_reason_template, ordering, mapping_confidence)
select n.id, gr.phase, gr.kind, gr.config, gr.blocked_reason_template, gr.ordering, gr.mapping_confidence
from public.gate_rule gr
join public.process_activity w on w.id = gr.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = 'MIX-HOP-NEW'
where w.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1)
  and w.code = 'MIX-HOP-WATER' and gr.kind = 'EVIDENCE_COMPLETE';

-- lab bindings
insert into public.lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
select lca.checkpoint_map, lca.checkpoint_code, n.id, lca.gates_activity_code
from public.lab_checkpoint_activity lca
join public.process_activity e on e.id = lca.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1);

-- self-check
do $$
declare h uuid := (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1);
        g uuid := (select id from public.process_definition where code = 'PROCESS-2026G' and version = 1); n int; m int;
begin
  select count(*) into n from public.process_activity where process_definition_id = h;
  if n <> 113 then raise exception '0093: expected 113 activities, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = h and code in ('MIX-HOP-WATER', 'MIX-HOP-NEW')
     and duration_target_min_hr = 3 and duration_target_max_hr = 3;
  if n <> 2 then raise exception '0093: both hopper passes must be 3 h'; end if;
  select count(*) into n from public.evidence_requirement er join public.process_activity pa on pa.id = er.process_activity_id
   where pa.process_definition_id = h and pa.code = 'MIX-HOP-NEW';
  if n <> 2 then raise exception '0093: the new hopper pass must take 2 photos, found %', n; end if;
  select count(*) into n from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id
   where pa.process_definition_id = h and pa.code = 'MIX-HOP-NEW' and af.datatype = 'check';
  if n <> 2 then raise exception '0093: the new hopper pass must carry 2 checklist items, found %', n; end if;
  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id
   where pa.process_definition_id = h and pa.code like 'TRN-P_-T1' and gr.kind = 'PREDECESSOR' and (gr.config->>'min_rest_hr')::numeric = 6;
  if n <> 6 then raise exception '0093: all six T1 passes must rest 6 h after T0, found %', n; end if;
  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id where pa.process_definition_id = h;
  select count(*) into m from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id where pa.process_definition_id = g;
  if n <> m + 1 then raise exception '0093: expected one gate more than 2026G (% vs %)', n, m; end if;
  select count(*) into n from public.evidence_requirement er join public.process_activity pa on pa.id = er.process_activity_id where pa.process_definition_id = h;
  select count(*) into m from public.evidence_requirement er join public.process_activity pa on pa.id = er.process_activity_id where pa.process_definition_id = g;
  if n <> m + 2 then raise exception '0093: expected two photo requirements more than 2026G (% vs %)', n, m; end if;
  select count(*) into n from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id where pa.process_definition_id = h;
  select count(*) into m from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id where pa.process_definition_id = g;
  if n <> m + 2 then raise exception '0093: expected two checklist items more than 2026G (% vs %)', n, m; end if;
  select count(*) into n from public.lab_checkpoint_activity lca join public.process_activity pa on pa.id = lca.process_activity_id where pa.process_definition_id = h;
  if n <> 41 then raise exception '0093: expected 41 lab bindings, found %', n; end if;
  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id
   where pa.process_definition_id = h and gr.kind = 'UNRESOLVED_DEPENDENCY';
  if n <> 0 then raise exception '0093: no unresolved dependency expected, found %', n; end if;
end $$;

notify pgrst, 'reload schema';
