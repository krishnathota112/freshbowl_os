-- ─────────────────────────────────────────────────────────────────────────────
-- 0094 · PROCESS-2026I v1 — the DAY PLAN: every activity gets its planned hour from H0.
--
-- Rulings (user, 15 Sep 2026): ranges use the upper number; triggered holds are planned on their stated
-- hours (the Supervisor still confirms the real condition); Lab checkpoints are planned with their field
-- step; where streams meet, the later one governs.
--
-- Computed from PROCESS-2026H's own data (durations, predecessors, rests, lab bindings) — plan_2026i.py:
--   · the main line starts at H0 and runs along the SOP durations (+ rule rests: T0→T1 6 h, T1→T2 8 h)
--   · paddy, CM + minerals and tunnel preparation are planned backward, ready when the step that uses them
--     starts (tunnel preparation 1 h before tunnel loading — the rule's planned_lead_hr)
--   · Turner piles staggered as TURNERPRCOESS (two machines): T0 offsets 0 / 1.5 / 0 / 1.5 / 3 / 4.5 h
--   · no duration in the data: raw-material weighment at 0 h; tunnel discharges 2 h apart (baseline H470/472/474)
--   · Lab: "after" checks (wetting, 2nd hopper, pre-Turner, after T1) at the field step's end; others at its start
-- Result: first grow-room loading at H470 — the baseline document's own figure.
--
-- The existing engine already turns these hours into planned times for a new batch (H0 + hour). Nothing
-- else changes: tasks, readings, photos, gates and lab bindings are copied from PROCESS-2026H. A task still
-- cannot start before its step before it is done; the plan says WHEN it is due.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026I' and version = 1) then
    raise exception 'PROCESS-2026I v1 already exists; 0094 does not overwrite a process definition.';
  end if;
end $$;

-- the hour source for a plan chained from SOP durations
alter table public.process_activity drop constraint process_activity_hour_source_known;
alter table public.process_activity add constraint process_activity_hour_source_known check (
  standard_start_hour is null or standard_hour_source = any (array['factory_stated', 'derived_from_rel_day', 'sop_duration_chain']));

update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved 15 Sep 2026: PROCESS-2026I plans every activity from H0 along the SOP durations (upper numbers, holds on their stated hours).'
 where conflict_id = 'SOP-U13';
update public.conflict_register set status = 'resolved',
  ship_with_default = 'Resolved 15 Sep 2026: Lab checkpoints are planned with their field step (after-checks at its end, others at its start).'
 where conflict_id = 'SOP-U12';

insert into public.process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
  envelope_confidence, envelope_hours, envelope_hour_source)
select 'PROCESS-2026I', 'Current factory process 15-09-2026 with day plan', 1, 'draft',
       e.source_ref || ' · day plan 15 Sep 2026 (upper durations, holds on stated hours, Lab with its step, later stream governs)',
       'H0 = bagasse wetting', 20, e.envelope_confidence, e.envelope_hours, e.envelope_hour_source
from public.process_definition e where e.code = 'PROCESS-2026H' and e.version = 1;

create temporary table p94_plan(code text primary key, s numeric, e numeric, d int, note text) on commit drop;
insert into p94_plan values
  ('FIB-WEIGH', 0, 0, 0, 'Planned from H0 along the SOP durations'),
  ('FIB-WET-1', 0, 3, 0, 'Planned from H0 along the SOP durations'),
  ('LAB-RM-01', 0, 0, 0, 'Planned with its field step (FIB-WET-1)'),
  ('FIB-REST-1', 3, 11, 0, 'Planned from H0 along the SOP durations'),
  ('LAB-WET-01', 3, 3, 0, 'Planned after its field step (FIB-WET-1)'),
  ('FIB-HOP-2', 11, 14, 0, 'Planned from H0 along the SOP durations'),
  ('FIB-HEAP', 14, 26, 0, 'Planned from H0 along the SOP durations'),
  ('LAB-WET-02', 14, 14, 0, 'Planned after its field step (FIB-HOP-2)'),
  ('FIB-BUNK-LOAD', 26, 28, 1, 'Planned from H0 along the SOP durations'),
  ('LAB-BNK-PRE', 26, 26, 1, 'Planned with its field step (FIB-BUNK-LOAD)'),
  ('FIB-COND-1', 28, 88, 1, 'Planned from H0 along the SOP durations'),
  ('LAB-PDY-WGH', 70, 70, 2, 'Planned with its field step (STR-WEIGH)'),
  ('STR-WEIGH', 70, 82, 2, 'Planned backward: ready when the step that uses it starts'),
  ('LAB-PDY-S1', 82, 82, 3, 'Planned with its field step (STR-SOAK-1)'),
  ('STR-SOAK-1', 82, 104, 3, 'Planned backward: ready when the step that uses it starts'),
  ('FIB-RELOAD-1', 88, 93, 3, 'Planned from H0 along the SOP durations'),
  ('LAB-HOP-PRE', 88, 88, 3, 'Planned with its field step (FIB-RELOAD-1)'),
  ('LAB-RLD-01', 88, 88, 3, 'Planned with its field step (FIB-RELOAD-1)'),
  ('LAB-UNL-01', 88, 88, 3, 'Planned with its field step (FIB-RELOAD-1)'),
  ('FIB-COND-2', 93, 133, 3, 'Planned from H0 along the SOP durations'),
  ('LAB-PDY-S2', 104, 104, 4, 'Planned with its field step (STR-SOAK-2)'),
  ('STR-SOAK-2', 104, 132, 4, 'Planned backward: ready when the step that uses it starts'),
  ('CM-WEIGH', 130, 132, 5, 'Planned backward: ready when the step that uses it starts'),
  ('LAB-CM-ARR', 130, 130, 5, 'Planned with its field step (CM-WEIGH)'),
  ('CM-DRYMIX', 132, 136, 5, 'Planned backward: ready when the step that uses it starts'),
  ('LAB-PDY-S3', 132, 132, 5, 'Planned with its field step (STR-SOAK-3)'),
  ('STR-SOAK-3', 132, 156, 5, 'Planned backward: ready when the step that uses it starts'),
  ('FIB-MOIST-DEC', 133, 136, 5, 'Planned from H0 along the SOP durations'),
  ('LAB-MOIST-DEC', 133, 133, 5, 'Planned with its field step (FIB-MOIST-DEC)'),
  ('LAB-CM-USE', 136, 136, 5, 'Planned with its field step (MIX-CM-ADD)'),
  ('MIX-CM-ADD', 136, 144, 5, 'Planned from H0 along the SOP durations'),
  ('MIX-HOP-WATER', 144, 147, 6, 'Planned from H0 along the SOP durations'),
  ('MIX-HOP-NEW', 147, 150, 6, 'Planned from H0 along the SOP durations'),
  ('MIX-HOP-REST', 150, 160, 6, 'Planned from H0 along the SOP durations'),
  ('STR-PILES', 156, 160, 6, 'Planned backward: ready when the step that uses it starts'),
  ('YARD-ADD', 160, 162, 6, 'Planned from H0 along the SOP durations'),
  ('YARD-FLIP', 162, 170, 6, 'Planned from H0 along the SOP durations'),
  ('LAB-PRE-T', 170, 170, 7, 'Planned after its field step (YARD-FLIP)'),
  ('TRN-P1-T0', 170, 171.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P3-T0', 170, 171.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P2-T0', 171.5, 173, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P4-T0', 171.5, 173, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P5-T0', 173, 174.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P6-T0', 174.5, 176, 7, 'Planned from H0 along the SOP durations'),
  ('LAB-T1-PRE-P1', 177.5, 177.5, 7, 'Planned with its field step (TRN-P1-T1)'),
  ('LAB-T1-PRE-P3', 177.5, 177.5, 7, 'Planned with its field step (TRN-P3-T1)'),
  ('TRN-P1-T1', 177.5, 179, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P3-T1', 177.5, 179, 7, 'Planned from H0 along the SOP durations'),
  ('LAB-T1-POST-P1', 179, 179, 7, 'Planned after its field step (TRN-P1-T1)'),
  ('LAB-T1-POST-P3', 179, 179, 7, 'Planned after its field step (TRN-P3-T1)'),
  ('LAB-T1-PRE-P2', 179, 179, 7, 'Planned with its field step (TRN-P2-T1)'),
  ('LAB-T1-PRE-P4', 179, 179, 7, 'Planned with its field step (TRN-P4-T1)'),
  ('TRN-P2-T1', 179, 180.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P4-T1', 179, 180.5, 7, 'Planned from H0 along the SOP durations'),
  ('LAB-T1-POST-P2', 180.5, 180.5, 7, 'Planned after its field step (TRN-P2-T1)'),
  ('LAB-T1-POST-P4', 180.5, 180.5, 7, 'Planned after its field step (TRN-P4-T1)'),
  ('LAB-T1-PRE-P5', 180.5, 180.5, 7, 'Planned with its field step (TRN-P5-T1)'),
  ('TRN-P5-T1', 180.5, 182, 7, 'Planned from H0 along the SOP durations'),
  ('LAB-T1-POST-P5', 182, 182, 7, 'Planned after its field step (TRN-P5-T1)'),
  ('LAB-T1-PRE-P6', 182, 182, 7, 'Planned with its field step (TRN-P6-T1)'),
  ('TRN-P6-T1', 182, 183.5, 7, 'Planned from H0 along the SOP durations'),
  ('LAB-T1-POST-P6', 183.5, 183.5, 7, 'Planned after its field step (TRN-P6-T1)'),
  ('TRN-P1-T2', 187, 188.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P3-T2', 187, 188.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P1-T3', 188.5, 190, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P2-T2', 188.5, 190, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P3-T3', 188.5, 190, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P4-T2', 188.5, 190, 7, 'Planned from H0 along the SOP durations'),
  ('BNK-B1-FILL', 190, 192, 7, 'Planned from H0 along the SOP durations'),
  ('BNK-B2-FILL', 190, 192, 7, 'Planned from H0 along the SOP durations'),
  ('LAB-BNK-LOAD-B1', 190, 190, 7, 'Planned with its field step (BNK-B1-FILL)'),
  ('LAB-BNK-LOAD-B2', 190, 190, 7, 'Planned with its field step (BNK-B2-FILL)'),
  ('TRN-P2-T3', 190, 191.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P4-T3', 190, 191.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P5-T2', 190, 191.5, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P5-T3', 191.5, 193, 7, 'Planned from H0 along the SOP durations'),
  ('TRN-P6-T2', 191.5, 193, 7, 'Planned from H0 along the SOP durations'),
  ('BNK-B1-HOLD-1', 192, 255, 8, 'Planned from H0 along the SOP durations'),
  ('BNK-B2-HOLD-1', 192, 255, 8, 'Planned from H0 along the SOP durations'),
  ('BNK-B3-FILL', 193, 195, 8, 'Planned from H0 along the SOP durations'),
  ('LAB-BNK-LOAD-B3', 193, 193, 8, 'Planned with its field step (BNK-B3-FILL)'),
  ('TRN-P6-T3', 193, 194.5, 8, 'Planned from H0 along the SOP durations'),
  ('BNK-B3-HOLD-1', 195, 258, 8, 'Planned from H0 along the SOP durations'),
  ('BNK-B1-RELOAD', 255, 257, 10, 'Planned from H0 along the SOP durations'),
  ('BNK-B2-RELOAD', 255, 257, 10, 'Planned from H0 along the SOP durations'),
  ('LAB-RLD-RE-B1', 255, 255, 10, 'Planned with its field step (BNK-B1-RELOAD)'),
  ('LAB-RLD-RE-B2', 255, 255, 10, 'Planned with its field step (BNK-B2-RELOAD)'),
  ('LAB-RLD-UNL-B1', 255, 255, 10, 'Planned with its field step (BNK-B1-RELOAD)'),
  ('LAB-RLD-UNL-B2', 255, 255, 10, 'Planned with its field step (BNK-B2-RELOAD)'),
  ('BNK-B1-HOLD-2', 257, 317, 10, 'Planned from H0 along the SOP durations'),
  ('BNK-B2-HOLD-2', 257, 317, 10, 'Planned from H0 along the SOP durations'),
  ('BNK-B3-RELOAD', 258, 260, 10, 'Planned from H0 along the SOP durations'),
  ('LAB-RLD-RE-B3', 258, 258, 10, 'Planned with its field step (BNK-B3-RELOAD)'),
  ('LAB-RLD-UNL-B3', 258, 258, 10, 'Planned with its field step (BNK-B3-RELOAD)'),
  ('BNK-B3-HOLD-2', 260, 320, 10, 'Planned from H0 along the SOP durations'),
  ('TN-PREP', 308, 316, 12, 'Planned backward: ready when the step that uses it starts'),
  ('BNK-B1-TUN-LOAD', 317, 319, 13, 'Planned from H0 along the SOP durations'),
  ('LAB-TUN-LOAD-B1', 317, 317, 13, 'Planned with its field step (BNK-B1-TUN-LOAD)'),
  ('LAB-TUN-PRE', 317, 317, 13, 'Planned with its field step (BNK-B1-TUN-LOAD)'),
  ('BNK-B2-TUN-LOAD', 319, 321, 13, 'Planned from H0 along the SOP durations'),
  ('LAB-TUN-LOAD-B2', 319, 319, 13, 'Planned with its field step (BNK-B2-TUN-LOAD)'),
  ('BNK-B3-TUN-LOAD', 321, 323, 13, 'Planned from H0 along the SOP durations'),
  ('LAB-TUN-LOAD-B3', 321, 321, 13, 'Planned with its field step (BNK-B3-TUN-LOAD)'),
  ('TN-LEVEL', 323, 337, 13, 'Planned from H0 along the SOP durations'),
  ('TN-HEAT', 337, 349, 14, 'Planned from H0 along the SOP durations'),
  ('TN-PAST', 349, 357, 14, 'Planned from H0 along the SOP durations'),
  ('TN-COOL-1', 357, 371, 14, 'Planned from H0 along the SOP durations'),
  ('TN-COND-2', 371, 456, 15, 'Planned from H0 along the SOP durations'),
  ('TN-COOL-2', 456, 470, 19, 'Planned from H0 along the SOP durations'),
  ('LAB-QC-FINAL', 470, 470, 19, 'Planned with its field step (TUN-DISCHARGE-1)'),
  ('TUN-DISCHARGE-1', 470, 472, 19, 'Planned from H0 along the SOP durations'),
  ('TUN-DISCHARGE-2', 472, 474, 19, 'Planned from H0 along the SOP durations'),
  ('TUN-DISCHARGE-3', 474, 476, 19, 'Planned from H0 along the SOP durations');

insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq,
  scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0, is_time_gate,
  is_optional, default_enabled, golden_rule, source_ref, tbd_marker, responsible_role, lab_parameters, admin_question,
  day_span_label, standard_start_hour, standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset,
  timing_confidence, is_hold, stage, instructions, skip_policy, parallel_group, notes, planning_unresolved)
select i.id, e.code, e.label_template, e.material_role, e.stream, p.d, e.seq,
  e.scope, e.cardinality_rule, e.duration_target_min_hr, e.duration_target_max_hr, e.duration_required_at_day0, e.is_time_gate,
  e.is_optional, e.default_enabled, e.golden_rule, e.source_ref, e.tbd_marker, e.responsible_role, e.lab_parameters, e.admin_question,
  'Day ' || p.d, p.s, p.e, 'sop_duration_chain', e.is_pre_h0, e.pre_h0_offset,
  e.timing_confidence, e.is_hold, e.stage, e.instructions, e.skip_policy, e.parallel_group,
  concat_ws(' · ', e.notes, p.note), false
from public.process_activity e
join p94_plan p on p.code = e.code
cross join (select id from public.process_definition where code = 'PROCESS-2026I' and version = 1) i
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1);

insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max, sop_source_ref, conflict_id, day0_editable, day0_required, default_variance, operator_input, remarks_default, section, step_no, display_order)
select n.id, x.key, x.label, x.datatype, x.unit, x.sop_value, x.sop_min, x.sop_max, x.sop_source_ref, x.conflict_id, x.day0_editable, x.day0_required, x.default_variance, x.operator_input, x.remarks_default, x.section, x.step_no, x.display_order
from public.activity_field x
join public.process_activity e on e.id = x.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026I' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1);

insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required, gates_submission, capture_hint, ordering, capture_phase)
select n.id, x.key, x.label, x.media_kinds, x.min_count, x.max_count, x.is_required, x.gates_submission, x.capture_hint, x.ordering, x.capture_phase
from public.evidence_requirement x
join public.process_activity e on e.id = x.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026I' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1);

insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence, conflict_id, blocked_reason_template, ordering, is_protected)
select n.id, x.phase, x.kind, x.config, x.predecessor_binding, x.is_enabled, x.mapping_confidence, x.conflict_id, x.blocked_reason_template, x.ordering, x.is_protected
from public.gate_rule x
join public.process_activity e on e.id = x.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026I' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1);

insert into public.lab_checkpoint_activity (process_activity_id, checkpoint_map, checkpoint_code, gates_activity_code)
select n.id, x.checkpoint_map, x.checkpoint_code, x.gates_activity_code
from public.lab_checkpoint_activity x
join public.process_activity e on e.id = x.process_activity_id
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026I' and version = 1)
 and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1);

-- self-check
do $$
declare i uuid := (select id from public.process_definition where code = 'PROCESS-2026I' and version = 1);
        h uuid := (select id from public.process_definition where code = 'PROCESS-2026H' and version = 1); n int; m int;
begin
  select count(*) into n from public.process_activity where process_definition_id = i;
  if n <> 113 then raise exception '0094: expected 113 activities, found %', n; end if;
  select count(*) into n from public.process_activity where process_definition_id = i and (standard_start_hour is null or planning_unresolved);
  if n <> 0 then raise exception '0094: % activities have no planned hour', n; end if;
  for n, m in select (select count(*) from public.gate_rule x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = i),
                     (select count(*) from public.gate_rule x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = h) loop
    if n <> m then raise exception '0094: gates differ from 2026H (% vs %)', n, m; end if;
  end loop;
  select count(*) into n from public.evidence_requirement x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = i;
  select count(*) into m from public.evidence_requirement x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = h;
  if n <> m then raise exception '0094: photo requirements differ from 2026H (% vs %)', n, m; end if;
  select count(*) into n from public.activity_field x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = i;
  select count(*) into m from public.activity_field x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = h;
  if n <> m then raise exception '0094: readings differ from 2026H (% vs %)', n, m; end if;
  select count(*) into n from public.lab_checkpoint_activity x join public.process_activity pa on pa.id = x.process_activity_id where pa.process_definition_id = i;
  if n <> 41 then raise exception '0094: expected 41 lab bindings, found %', n; end if;
  -- every predecessor ends (with its rest) no later than its successor starts
  select count(*) into n
    from public.gate_rule g join public.process_activity cur on cur.id = g.process_activity_id
    cross join lateral jsonb_array_elements_text(g.config->'activity_codes') x(code)
    join public.process_activity pre on pre.process_definition_id = i and pre.code = x.code
   where cur.process_definition_id = i and g.kind = 'PREDECESSOR'
     and pre.standard_end_hour + coalesce((g.config->>'min_rest_hr')::numeric, 0) > cur.standard_start_hour;
  if n <> 0 then raise exception '0094: % predecessor relations are violated by the plan', n; end if;
  if (select standard_start_hour from public.process_activity where process_definition_id = i and code = 'TUN-DISCHARGE-1') <> 470 then
    raise exception '0094: first grow-room loading should plan at H470';
  end if;
end $$;

notify pgrst, 'reload schema';
