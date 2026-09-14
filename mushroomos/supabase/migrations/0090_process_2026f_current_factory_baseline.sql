-- ─────────────────────────────────────────────────────────────────────────────
-- 0090 · PROCESS-2026F v1 — the CURRENT FACTORY PROCESS BASELINE (14 Sep 2026), as process DATA.
--
-- Source: MushroomOS_Current_Process_Baseline_For_Claude.docx (14 Sep 2026), applied to PROCESS-2026E
-- (Compost SOP 31-08-2026 + TURNERPRCOESS + LAB-2026A). PROCESS-2026E is published and is not edited:
-- a factory change is a new process version. Data only — no engine change.
--
-- Copied from PROCESS-2026E unchanged: every activity, reading, checklist, photo requirement, gate and
-- lab binding EXCEPT the changes below.
--
-- CHANGES (each from the baseline document):
--   1 · NEW HOPPER PASS (§11.3, §3): the single 1B task "Hopper pass + another hopper pass + rest 10 h"
--       (MIX-HOP-PASSES) becomes three executable activities:
--         MIX-HOP-WATER  Water hopper pass — readings 73 % moisture / < 45–50 °C and before+after photos
--                        carried from the old task; per-pass duration NOT stated (SOP-U20)
--         MIX-HOP-NEW    New hopper pass — timing, photos, readings and Lab NOT supplied (SOP-U19):
--                        none are invented
--         MIX-HOP-REST   Rest 10 h — passive hold, 10 h confirmed
--       Second convergence YARD-ADD now waits on MIX-HOP-REST (+ STR-PILES).
--   2 · TWO-CYCLE BUNKER MODEL (§2 "two cycles, not the older three-cycle model", §3 timeline
--       fill → reload → tunnel): Reload 2, Holding 3 and their six Lab checkpoints are not in this
--       version. Tunnel filling waits on Holding 2 (+ tunnel preparation + the previous tunnel load).
--   3 · FIRST CONVERGENCE (§3: H133 moisture decision → H136 "first convergence; CM mix begins", no
--       Stage 0D): Add CM mix waits on the dry mix AND the moisture-decision unload. SOP-U03 resolved.
--   4 · TUNNEL PROCESS START (§3: H332 "Tunnel filling complete — tunnel process begins"): levelling
--       waits on the last tunnel filling. SOP-U06 resolved.
--   5 · TURNER MACHINE (§5, §11 "pile + Turner stage + actual machine"; M1 + M2 confirmed §2): each
--       Turner pass records the machine used (choice M1 / M2).
--
-- STILL UNRESOLVED (kept blocked / not invented): tunnel preparation start (SOP-U05) — tunnel filling
-- stays locked behind it; planned hours (every activity planning_unresolved); see register.
--
-- Created as DRAFT. Publishing and making it current are separate, audited steps.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026F' and version = 1) then
    raise exception 'PROCESS-2026F v1 already exists; 0090 does not overwrite a process definition.';
  end if;
  if not exists (select 1 from public.process_definition where code = 'PROCESS-2026E' and version = 1) then
    raise exception '0090 needs PROCESS-2026E v1 as its base.';
  end if;
end $$;

-- 1 · register
insert into public.conflict_register (conflict_id, kind, severity, question, sources, ship_with_default, status) values
  ('SOP-U19', 'tbd', null,
   'New hopper pass (after the water hopper pass): its timing, photo evidence, Lab checkpoint and readings are not supplied by the current process baseline.',
   'MushroomOS_Current_Process_Baseline_For_Claude.docx §3, §6, §11.3',
   'Task exists and is performed; no duration, readings, photos or Lab checkpoint until the factory defines them', 'open'),
  ('SOP-U20', 'tbd', null,
   'Water hopper pass duration: the SOP states 16 h for the whole 1B line (water pass + new pass + 10 h rest); the per-pass durations are not stated.',
   'Compost SOP.xlsx (31-08-2026) C26:D26 · baseline §11.3',
   'No duration on the two passes; the 10 h rest is confirmed', 'open')
on conflict (conflict_id) do nothing;

update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved by the current process baseline (14 Sep 2026) §3: first convergence (CM mix) follows the moisture-decision unload; no Stage 0D step. PROCESS-2026F: Add CM mix waits on the dry mix and the moisture-decision unload.'
 where conflict_id = 'SOP-U03';
update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved by the current process baseline (14 Sep 2026) §2: two-cycle bunker model. PROCESS-2026F has no Reload 2 or Holding 3; tunnel filling follows Holding 2.'
 where conflict_id = 'SOP-U04';
update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved by the current process baseline (14 Sep 2026) §3: "tunnel filling complete — tunnel process begins". PROCESS-2026F: levelling waits on the last tunnel filling.'
 where conflict_id = 'SOP-U06';
update public.conflict_register set status = 'decided',
  ship_with_default = 'PROCESS-2026F: two-cycle model per the current process baseline §2 — Reload 2 is not a step (PROCESS-2026E kept it optional).'
 where conflict_id = 'SOP-C10';
update public.conflict_register set status = 'resolved',
  ship_with_default = 'Not applicable from PROCESS-2026F: there is no Reload 2 holding in the two-cycle model.'
 where conflict_id = 'SOP-C11';
update public.conflict_register set
  ship_with_default = 'PROCESS-2026F: tunnel filling becomes eligible after Holding 2 (two-cycle model); the SOP "36 h after reloading 2" wording does not apply. Hold hours shown, not enforced.'
 where conflict_id = 'SOP-C12';

-- 2 · definition (draft)
insert into public.process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
  envelope_confidence, envelope_hours, envelope_hour_source)
select 'PROCESS-2026F', 'Current factory process baseline 14-09-2026 (new hopper pass, two-cycle bunker)', 1, 'draft',
       'MushroomOS_Current_Process_Baseline_For_Claude.docx (14 Sep 2026) · Compost SOP.xlsx (31-08-2026) · TURNERPRCOESS.xlsx · LAB-2026A',
       e.anchor_day_label, e.total_days, e.envelope_confidence, e.envelope_hours, e.envelope_hour_source
from public.process_definition e where e.code = 'PROCESS-2026E' and e.version = 1;

create temporary table p90_excluded(code text primary key) on commit drop;
insert into p90_excluded values
  ('MIX-HOP-PASSES'),
  ('BNK-B1-RELOAD-2'), ('BNK-B2-RELOAD-2'), ('BNK-B3-RELOAD-2'),
  ('BNK-B1-HOLD-3'), ('BNK-B2-HOLD-3'), ('BNK-B3-HOLD-3'),
  ('LAB-RLD2-UNL-B1'), ('LAB-RLD2-UNL-B2'), ('LAB-RLD2-UNL-B3'),
  ('LAB-RLD2-RE-B1'), ('LAB-RLD2-RE-B2'), ('LAB-RLD2-RE-B3');

-- 3 · activities copied from PROCESS-2026E
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq,
  scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0, is_time_gate,
  is_optional, default_enabled, golden_rule, source_ref, tbd_marker, responsible_role, lab_parameters, admin_question,
  day_span_label, standard_start_hour, standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset,
  timing_confidence, is_hold, stage, instructions, skip_policy, parallel_group, notes, planning_unresolved)
select f.id, e.code, e.label_template, e.material_role, e.stream, e.rel_day, e.seq,
  e.scope, e.cardinality_rule, e.duration_target_min_hr, e.duration_target_max_hr, e.duration_required_at_day0, e.is_time_gate,
  e.is_optional, e.default_enabled, e.golden_rule, e.source_ref,
  case when e.code in ('MIX-CM-ADD', 'TN-LEVEL') then null else e.tbd_marker end,
  e.responsible_role, e.lab_parameters, e.admin_question,
  e.day_span_label, e.standard_start_hour, e.standard_end_hour, e.standard_hour_source, e.is_pre_h0, e.pre_h0_offset,
  e.timing_confidence, e.is_hold, e.stage,
  case when e.code like 'BNK-B_-TUN-LOAD' then 'Start loading this bunker into the tunnel.' else e.instructions end,
  e.skip_policy, e.parallel_group,
  case when e.code like 'BNK-B_-TUN-LOAD'
       then coalesce(e.notes || ' · ', '') || 'Two-cycle model (baseline §2): follows Holding 2. SOP line "after 36 hrs of Reloading 2" does not apply (SOP-C12).'
       else e.notes end,
  true
from public.process_activity e
cross join (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1) f
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1)
  and e.code not in (select code from p90_excluded);

-- 4 · the new hopper pass sequence (replaces MIX-HOP-PASSES)
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq,
  scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, source_ref, tbd_marker, responsible_role,
  timing_confidence, is_hold, stage, instructions, skip_policy, notes, planning_unresolved)
select f.id, v.code, v.label, null, 'YARD'::stream_code, 0, v.seq, 'MASTER'::activity_scope, '{"kind": "SINGLETON"}'::jsonb,
       v.dmin, v.dmax, v.src, v.tbd, 'operator'::app_role, v.conf::process_confidence, v.hold, old.stage, v.instr,
       'not_allowed', v.notes, true
from (values
  ('MIX-HOP-WATER', 'Water hopper pass', 1500, null::numeric, null::numeric,
   'Compost SOP.xlsx (31-08-2026) C26 · baseline §3 H144 "Water hopper pass", §11.3', 'SOP-U20', 'UNRESOLVED', false,
   'Hopper pass with full water (Target: 73% moisture + Temperature < 45–50 °C).', null),
  ('MIX-HOP-NEW', 'New hopper pass', 1510, null, null,
   'Baseline §11.3 "NEW HOPPER PASS immediately after the Water Hopper Pass" · Compost SOP.xlsx C26 "Another Hopper Pass"', 'SOP-U19', 'UNRESOLVED', false,
   'Another hopper pass, straight after the water hopper pass.',
   'Confirmed process change (14 Sep 2026). Timing, photos, readings and Lab checkpoint not yet defined (SOP-U19).'),
  ('MIX-HOP-REST', 'Rest — 10 hours', 1520, 10::numeric, 10::numeric,
   'Baseline §11.3 "followed by a confirmed 10-hour rest" · Compost SOP.xlsx C26 "rest of 10 hours"', null, 'FACTORY_CONFIRMED', true,
   'Rest for 10 hours after the new hopper pass.', null)
) v(code, label, seq, dmin, dmax, src, tbd, conf, hold, instr, notes)
cross join (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1) f
cross join (select e.stage from public.process_activity e
             where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1)
               and e.code = 'MIX-HOP-PASSES') old;

-- 5 · readings and checklists: copied; the water pass carries the old 1B readings; Turner passes record the machine
insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
  sop_source_ref, conflict_id, day0_editable, day0_required, default_variance, operator_input, remarks_default, section,
  step_no, display_order)
select n.id, af.key, af.label, af.datatype, af.unit, af.sop_value, af.sop_min, af.sop_max,
  af.sop_source_ref, af.conflict_id, af.day0_editable, af.day0_required, af.default_variance, af.operator_input,
  af.remarks_default, af.section, af.step_no, af.display_order
from public.activity_field af
join public.process_activity e on e.id = af.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
 and n.code = case when e.code = 'MIX-HOP-PASSES' then 'MIX-HOP-WATER' else e.code end
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1);

insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_source_ref,
  operator_input, section, display_order)
select n.id, 'turner_machine', 'Turner machine used', 'choice', null, 'M1|M2',
       'Baseline §2 "M1 + M2", §5 "records actual pile, machine, operator"', 'required', 'Readings',
       coalesce((select max(af.display_order) from public.activity_field af where af.process_activity_id = n.id), 0) + 1
from public.process_activity n
where n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
  and n.code like 'TRN-P_-T_';

-- 6 · photo requirements: copied; the water pass carries the old 1B before/after photos
insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
  gates_submission, capture_hint, ordering, capture_phase)
select n.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
  er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
from public.evidence_requirement er
join public.process_activity e on e.id = er.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
 and n.code = case when e.code = 'MIX-HOP-PASSES' then 'MIX-HOP-WATER' else e.code end
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1);

-- 7 · gates: copied, with the dependency changes; unresolved dependencies U03 / U04 / U06 are not carried
insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled,
  mapping_confidence, conflict_id, blocked_reason_template, ordering, is_protected)
select n.id, g.phase, g.kind,
  case
    when g.kind = 'PREDECESSOR' and e.code = 'MIX-CM-ADD'      then '{"activity_codes": ["CM-DRYMIX", "FIB-MOIST-DEC"]}'::jsonb
    when g.kind = 'PREDECESSOR' and e.code = 'YARD-ADD'        then '{"activity_codes": ["MIX-HOP-REST", "STR-PILES"]}'::jsonb
    when g.kind = 'PREDECESSOR' and e.code = 'BNK-B1-TUN-LOAD' then '{"activity_codes": ["BNK-B1-HOLD-2", "TN-PREP"]}'::jsonb
    when g.kind = 'PREDECESSOR' and e.code = 'BNK-B2-TUN-LOAD' then '{"activity_codes": ["BNK-B2-HOLD-2", "TN-PREP", "BNK-B1-TUN-LOAD"]}'::jsonb
    when g.kind = 'PREDECESSOR' and e.code = 'BNK-B3-TUN-LOAD' then '{"activity_codes": ["BNK-B3-HOLD-2", "TN-PREP", "BNK-B2-TUN-LOAD"]}'::jsonb
    else g.config
  end,
  g.predecessor_binding, g.is_enabled, g.mapping_confidence, g.conflict_id, g.blocked_reason_template, g.ordering, g.is_protected
from public.gate_rule g
join public.process_activity e on e.id = g.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
 and n.code = case when e.code = 'MIX-HOP-PASSES' then 'MIX-HOP-WATER' else e.code end
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1)
  and not (g.kind = 'UNRESOLVED_DEPENDENCY' and e.code in ('MIX-CM-ADD', 'TN-LEVEL'))
  and not (g.kind = 'PREDECESSOR' and e.code = 'MIX-HOP-PASSES');

insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, blocked_reason_template,
  ordering, mapping_confidence)
select n.id, 'entry', 'PREDECESSOR', v.cfg::jsonb, 'ALL_INSTANCES', 'Locked — {predecessor_label} not complete', 10, 'dictated'
from (values
  ('MIX-HOP-WATER', '{"activity_codes": ["MIX-CM-ADD"]}'),
  ('MIX-HOP-NEW',   '{"activity_codes": ["MIX-HOP-WATER"]}'),
  ('MIX-HOP-REST',  '{"activity_codes": ["MIX-HOP-NEW"]}'),
  ('TN-LEVEL',      '{"activity_codes": ["BNK-B3-TUN-LOAD"]}')
) v(code, cfg)
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
 and n.code = v.code;

-- 8 · lab bindings: copied for the checkpoints this version keeps
insert into public.lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
select lca.checkpoint_map, lca.checkpoint_code, n.id, lca.gates_activity_code
from public.lab_checkpoint_activity lca
join public.process_activity e on e.id = lca.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026E' and version = 1);

-- 9 · self-check: refuse to leave a definition that disagrees with the baseline
do $$
declare d uuid := (select id from public.process_definition where code = 'PROCESS-2026F' and version = 1); n int; bad text;
begin
  select count(*) into n from public.process_activity where process_definition_id = d and code not like 'LAB-%';
  if n <> 72 then raise exception '0090: expected 72 production activities, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = d and code like 'LAB-%';
  if n <> 41 then raise exception '0090: expected 41 lab checkpoint activities, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = d
     and code in ('MIX-HOP-PASSES', 'BNK-B1-RELOAD-2', 'BNK-B1-HOLD-3', 'LAB-RLD2-RE-B1');
  if n <> 0 then raise exception '0090: retired activities are still present'; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind = 'UNRESOLVED_DEPENDENCY';
  if n <> 1 then raise exception '0090: expected 1 unresolved dependency (tunnel preparation), found %', n; end if;
  if not exists (select 1 from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
                  where pa.process_definition_id = d and pa.code = 'TN-PREP' and g.kind = 'UNRESOLVED_DEPENDENCY') then
    raise exception '0090: tunnel preparation must stay unresolved (SOP-U05)';
  end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind = 'LAB_APPROVED';
  if n <> 8 then raise exception '0090: expected 8 GM lab gates, found %', n; end if;
  select count(*) into n from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
   where pa.process_definition_id = d and g.kind = 'GM_APPROVAL';
  if n <> 0 then raise exception '0090: GM_APPROVAL must not be used'; end if;
  select string_agg(distinct x.code, ', ') into bad
    from public.gate_rule g join public.process_activity pa on pa.id = g.process_activity_id
    cross join lateral jsonb_array_elements_text(g.config->'activity_codes') x(code)
   where pa.process_definition_id = d and g.kind = 'PREDECESSOR'
     and not exists (select 1 from public.process_activity o where o.process_definition_id = d and o.code = x.code);
  if bad is not null then raise exception '0090: predecessor codes not in the definition: %', bad; end if;
  select string_agg(distinct lca.gates_activity_code, ', ') into bad
    from public.lab_checkpoint_activity lca join public.process_activity pa on pa.id = lca.process_activity_id
   where pa.process_definition_id = d and lca.gates_activity_code is not null
     and not exists (select 1 from public.process_activity o where o.process_definition_id = d and o.code = lca.gates_activity_code);
  if bad is not null then raise exception '0090: lab bindings name activities not in the definition: %', bad; end if;
  select count(*) into n from public.lab_checkpoint_activity lca join public.process_activity pa on pa.id = lca.process_activity_id
   where pa.process_definition_id = d;
  if n <> 41 then raise exception '0090: expected 41 lab bindings, found %', n; end if;
  select count(*) into n from public.evidence_requirement er join public.process_activity pa on pa.id = er.process_activity_id
   where pa.process_definition_id = d and pa.code in ('MIX-HOP-NEW', 'MIX-HOP-REST');
  if n <> 0 then raise exception '0090: the new hopper pass and its rest must not carry invented photo requirements'; end if;
  select count(*) into n from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id
   where pa.process_definition_id = d and pa.code in ('MIX-HOP-NEW', 'MIX-HOP-REST');
  if n <> 0 then raise exception '0090: the new hopper pass and its rest must not carry invented readings'; end if;
  select count(*) into n from public.activity_field af join public.process_activity pa on pa.id = af.process_activity_id
   where pa.process_definition_id = d and af.key = 'turner_machine';
  if n <> 24 then raise exception '0090: expected the machine reading on 24 Turner passes, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = d and not planning_unresolved;
  if n <> 0 then raise exception '0090: % activities are not flagged planning_unresolved', n; end if;
end $$;

notify pgrst, 'reload schema';
