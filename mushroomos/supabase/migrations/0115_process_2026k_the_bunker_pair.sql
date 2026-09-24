-- ─────────────────────────────────────────────────────────────────────────────
-- 0115 · PROCESS-2026K v1 — PROCESS-2026J with THE BUNKER PAIR and a STATED H476 ENVELOPE.
--        (user rulings, 16 Sep 2026)
--
-- PROCESS-2026J is not touched. Batches were generated from it and their baselines are frozen;
-- the four active batches stay pinned to it. This is copy-on-write, as every prior SOP change has
-- been (0043, 0090, 0092, 0093, 0094, 0097).
--
-- TWO DELTAS. NOTHING ELSE.
--
-- 1 · THE PAIR. P1+P2 -> B1, P3+P4 -> B2, P5+P6 -> B3 is a physical grouping, and in 2026J it was
--     only a label: TRN-P2-T3, TRN-P4-T3 and TRN-P6-T3 had no dependent anywhere in the graph, so
--     a bunker could be sealed and its 63-hour hold started with one pile of its pair still
--     unturned. Three exit PREDECESSOR rules close that, one per bunker.
--
--     The ENTRY gates are deliberately unchanged: SOP-C05 is 'decided' — a bunker fill OPENS on
--     the first pile of its pair (user decision 14 Sep 2026) — and the fill must keep opening on
--     one pile. The pair belongs at the first pair-dependent continuation point, which is the
--     fill's own finish. 0114 is what makes an exit PREDECESSOR a real refusal.
--
--     Not placed on the following hold's entry gate: time_gate_status measures a hold from
--     max(actual_end) over its ENTRY predecessors, so a pile named there would run the 63-hour
--     bunker clock from a turner pass rather than from the moment the bunker was closed.
--
-- 2 · THE ENVELOPE. 2026J states no envelope at all (envelope_hours null, confidence UNRESOLVED),
--     so v_process_envelope falls back through its COALESCE and process_definition.baseline_hours
--     — a GENERATED day grid, (total_days + 1) * 24 = 504 — sits on the same row as a number that
--     is not the process's length. The activities compute 476. This records 476 as stated and
--     FACTORY_CONFIRMED, which makes publish_process_definition assert, from here on, that the
--     activities and the stated ceiling agree: an activity added past H476 would fail to publish.
--
-- NOT IN THIS FILE, DELIBERATELY:
--   · Local Paddy. Deferred by the user (16 Sep 2026): every active batch and every batch to be
--     entered in this period is Punjab/Standard, so Soak 3 stays present and unconditional, and
--     required_material_code stays null on every row of every version. The 0107 capability is
--     applied and unused, which is exactly where it should sit until Local is implemented as its
--     own versioned process change.
--   · Timings, activities, Lab gates, holds, evidence and readings: all copied unchanged.
--
-- Created as DRAFT. Publishing and making it current are separate, guarded calls.
-- Rollback: delete the PROCESS-2026K rows (no batch may reference it first).
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026K' and version = 1) then
    raise exception '0115: PROCESS-2026K v1 already exists; this file does not overwrite a process definition.';
  end if;
  if not exists (select 1 from public.process_definition where code = 'PROCESS-2026J' and version = 1) then
    raise exception '0115 needs PROCESS-2026J v1 as its base.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'submit_activity'
                   and pg_get_functiondef(p.oid) like '%0114 · AN EXIT PREDECESSOR%') then
    raise exception '0115 needs 0114: without it an exit PREDECESSOR rule is stored and ignored.';
  end if;
end
$mig$;

-- ── the definition ───────────────────────────────────────────────────────────
insert into public.process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
  envelope_confidence, envelope_hours, envelope_hour_source)
select 'PROCESS-2026K', 'Current factory process 16-09-2026 with the bunker pair', 1, 'draft',
       e.source_ref || ' · bunker pair 16 Sep 2026: a fill opens on the first pile of its pair and cannot be finished until both are turned; envelope stated at H476',
       e.anchor_day_label, e.total_days, e.envelope_confidence, e.envelope_hours, e.envelope_hour_source
from public.process_definition e where e.code = 'PROCESS-2026J' and e.version = 1;

-- ── activities, fields, evidence, gates, lab bindings: copied verbatim ───────
insert into public.process_activity (process_definition_id, code, label_template, material_role, stream, rel_day, seq,
  scope, cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0, is_time_gate,
  is_optional, default_enabled, golden_rule, source_ref, tbd_marker, responsible_role, lab_parameters, admin_question,
  day_span_label, standard_start_hour, standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset,
  timing_confidence, is_hold, stage, instructions, skip_policy, parallel_group, notes, planning_unresolved,
  required_material_code)
select (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1),
  e.code, e.label_template, e.material_role, e.stream, e.rel_day, e.seq,
  e.scope, e.cardinality_rule, e.duration_target_min_hr, e.duration_target_max_hr,
  e.duration_required_at_day0, e.is_time_gate, e.is_optional, e.default_enabled, e.golden_rule,
  e.source_ref, e.tbd_marker, e.responsible_role, e.lab_parameters, e.admin_question,
  e.day_span_label, e.standard_start_hour, e.standard_end_hour, e.standard_hour_source, e.is_pre_h0, e.pre_h0_offset,
  e.timing_confidence, e.is_hold, e.stage, e.instructions, e.skip_policy, e.parallel_group, e.notes, e.planning_unresolved,
  e.required_material_code
from public.process_activity e
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026J' and version = 1);

insert into public.activity_field (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
  sop_source_ref, conflict_id, day0_editable, day0_required, default_variance, operator_input, remarks_default, section,
  step_no, display_order)
select n.id, af.key, af.label, af.datatype, af.unit, af.sop_value, af.sop_min, af.sop_max,
  af.sop_source_ref, af.conflict_id, af.day0_editable, af.day0_required, af.default_variance, af.operator_input,
  af.remarks_default, af.section, af.step_no, af.display_order
from public.activity_field af
join public.process_activity e on e.id = af.process_activity_id
join public.process_activity n on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1) and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026J' and version = 1);

insert into public.evidence_requirement (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
  gates_submission, capture_hint, ordering, capture_phase)
select n.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
  er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
from public.evidence_requirement er
join public.process_activity e on e.id = er.process_activity_id
join public.process_activity n on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1) and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026J' and version = 1);

insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled,
  mapping_confidence, conflict_id, blocked_reason_template, ordering)
select n.id, gr.phase, gr.kind, gr.config, gr.predecessor_binding, gr.is_enabled, gr.mapping_confidence, gr.conflict_id,
  gr.blocked_reason_template, gr.ordering
from public.gate_rule gr
join public.process_activity e on e.id = gr.process_activity_id
join public.process_activity n on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1) and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026J' and version = 1);

insert into public.lab_checkpoint_activity (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
select lca.checkpoint_map, lca.checkpoint_code, n.id, lca.gates_activity_code
from public.lab_checkpoint_activity lca
join public.process_activity e on e.id = lca.process_activity_id
join public.process_activity n on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1) and n.code = e.code
where e.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026J' and version = 1);

-- ── DELTA 1 · the pair, at the fill's exit ───────────────────────────────────
insert into public.gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled,
  mapping_confidence, blocked_reason_template, ordering)
select n.id, 'exit', 'PREDECESSOR',
       jsonb_build_object(
         'activity_codes', p.codes,
         'pair', p.pair,
         'source', 'P1+P2 -> B1, P3+P4 -> B2, P5+P6 -> B3 · TURNERPRCOESS.xlsx row 54 · Geetha 16 · user ruling 16 Sep 2026: the fill opens on the first pile, the pair is required before it can be finished'),
       'ALL_INSTANCES', true, 'dictated',
       'This bunker cannot be closed yet — {predecessor_label} has not finished. Both piles of the pair go into {scope_label} before it is sealed.',
       10
from (values
  ('BNK-B1-FILL', '["TRN-P1-T3","TRN-P2-T3"]'::jsonb, 'P1+P2'),
  ('BNK-B2-FILL', '["TRN-P3-T3","TRN-P4-T3"]'::jsonb, 'P3+P4'),
  ('BNK-B3-FILL', '["TRN-P5-T3","TRN-P6-T3"]'::jsonb, 'P5+P6')
) p(code, codes, pair)
join public.process_activity n
  on n.process_definition_id = (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1)
 and n.code = p.code;

-- ── DELTA 2 · the stated envelope ────────────────────────────────────────────
-- The same assertion set_process_envelope makes, made here because a migration has no JWT and
-- that function — correctly — grants no exemption to the owner. The number is not typed twice:
-- it is read from the activities and then required to equal 476.
do $mig$
declare k uuid := (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1); c numeric;
begin
  select calculated_standard_hr into c from public.v_process_standard where process_definition_id = k;
  if c is null or c <> 476 then
    raise exception '0115: PROCESS-2026K computes a standard of %h, not 476h. The ceiling is H476; do not state a number the activities do not produce.', c;
  end if;
  update public.process_definition
     set envelope_hours = 476,
         envelope_hour_source = 'factory_stated',
         envelope_confidence = 'FACTORY_CONFIRMED'
   where id = k;
end
$mig$;

-- ── self-check ───────────────────────────────────────────────────────────────
do $mig$
declare
  k uuid := (select id from public.process_definition where code = 'PROCESS-2026K' and version = 1);
  j uuid := (select id from public.process_definition where code = 'PROCESS-2026J' and version = 1);
  n int; m int;
begin
  select count(*) into n from public.process_activity where process_definition_id = k;
  select count(*) into m from public.process_activity where process_definition_id = j;
  if n <> m or n <> 113 then raise exception '0115: expected 113 activities, found % (2026J has %)', n, m; end if;

  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id where pa.process_definition_id = k;
  select count(*) into m from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id where pa.process_definition_id = j;
  if n <> m + 3 then raise exception '0115: expected 2026J gate rules + 3, found % against %', n, m; end if;

  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id
   where pa.process_definition_id = k and gr.phase = 'exit' and gr.kind = 'PREDECESSOR';
  if n <> 3 then raise exception '0115: expected 3 bunker pair rules, found %', n; end if;

  -- the ENTRY gates the factory ruled on are untouched: each fill still opens on ONE pile
  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id
   where pa.process_definition_id = k and gr.phase = 'entry' and gr.kind = 'PREDECESSOR'
     and pa.code in ('BNK-B1-FILL','BNK-B2-FILL','BNK-B3-FILL')
     and jsonb_array_length(gr.config->'activity_codes') = 1;
  if n <> 3 then raise exception '0115: a bunker fill must still OPEN on one pile (SOP-C05); found % single-pile entry gates', n; end if;

  -- NO dead-end production activity. FIB-WEIGH is a pre-work weighment and TUN-DISCHARGE-3 is the
  -- last step of the process; both are dead ends in 2026J too and neither is in this file's scope.
  select count(*) into n from public.process_activity pa
   where pa.process_definition_id = k
     and pa.code not like 'LAB-%'
     and pa.code not in ('FIB-WEIGH','TUN-DISCHARGE-3')
     and not exists (
       select 1 from public.gate_rule gr join public.process_activity pb on pb.id = gr.process_activity_id
        where pb.process_definition_id = k and gr.kind = 'PREDECESSOR'
          and gr.config->'activity_codes' ? pa.code);
  if n <> 0 then raise exception '0115: % production activities are dead ends', n; end if;

  select count(*) into n from public.lab_checkpoint_activity lca join public.process_activity pa on pa.id = lca.process_activity_id where pa.process_definition_id = k;
  if n <> 41 then raise exception '0115: expected 41 lab bindings, found %', n; end if;

  -- Local stays deferred: nothing in ANY version is material-conditional yet
  select count(*) into n from public.process_activity where required_material_code is not null;
  if n <> 0 then raise exception '0115: Local Paddy is deferred; % activities carry required_material_code', n; end if;

  -- PROCESS-2026J is untouched
  select count(*) into n from public.gate_rule gr join public.process_activity pa on pa.id = gr.process_activity_id
   where pa.process_definition_id = j and gr.phase = 'exit' and gr.kind = 'PREDECESSOR';
  if n <> 0 then raise exception '0115: PROCESS-2026J was modified'; end if;
end
$mig$;

notify pgrst, 'reload schema';
