-- ─────────────────────────────────────────────────────────────────────────────
-- 0079 · PROCESS-2026D — PROCESS-2026C with the official Compost SOP applied.
--
-- Source: Compost SOP.xlsx, "Button Mushroom Compost Standard Process (31-08-2026)", declared the
-- official SOP by the user on 13 Sep 2026. PROCESS-2026C is published and frozen, so the SOP's
-- process changes land as a new version beside it (SOP_VERSION_MODEL). 2026C is not touched.
--
-- What changes, and only this (everything else is copied from 2026C row for row):
--
--   Stage 1B   SOP C24:D26 — mixing 8 h, then "hopper pass + another hopper pass + rest of 10 hours"
--              16 h, stage 24 h. Hopper pass 2 has the same duration as pass 1 (the stated
--              amendment), so the 6 h left after the 10 h rest is two 3 h passes:
--                MIX-HOP-WATER  4 h → 3 h   H144–H147   hopper pass 1
--                MIX-HOP-2      new, 3 h    H147–H150   hopper pass 2
--                MIX-REST      12 h → 10 h  H150–H160   range 8–10 h
--              Stage total stays 24 h, so H160 and everything downstream of Stage 1B keep their hours.
--              Stage 0A's hopper pass 2 (FIB-HOP-2, H11–H14) is a different activity and unchanged.
--
--   Tunnel     SOP C61:D67 — levelling & conditioning 14 · heating 12 · pasteurisation 8 ·
--              cooling 1 12–14 · conditioning 2 80–85 · cooling 2 8–14 (134–147 h). Ranges are planned
--              on MAX (DEC-023), which lands on the SOP heading's own upper bound, 147 h:
--                TN-LEVEL 326–340 · TN-HEAT 340–352 · TN-PAST 352–360 · TN-COOL-1 360–374 ·
--                TN-COND-2 374–459 · TN-COOL-2 459–473. The first phase keeps 2026C's start (H326).
--              Discharge follows: stream 1 H473 (the standard end), stream 2 H475, stream 3 H477.
--              LAB-QC-FINAL moves with discharge 1.
--
--   Tunnel prep  SOP C55:D58 — Phase 2A, 8 h, absent from 2026C. TN-PREP H316–H324, ending when tunnel
--              loading begins. Before/after photographs like every performed activity.
--
-- Not changed here — recorded, not decided (decision register D04/D05/D06/D07):
--   bunker filling 8 h vs the confirmed 2 h; a second post-Turner reload (Phase 1D-B); 1D-A hold 60 h;
--   Stage 0B AND vs OR trigger; Stage 0C 8 h heading; Stage 0D with no steps; paddy 74/86/90 h and
--   pile preparation grouping; Turner phase totals vs the pile-level model; tunnel unload duration.
--
-- Idempotent: if PROCESS-2026D v1 exists, nothing happens.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  src       uuid;
  dst       uuid;
  sop       constant text := 'Compost SOP.xlsx · Button Mushroom Compost Standard Process (31-08-2026), official SOP per user 13 Sep 2026';
  s         record;
begin
  if exists (select 1 from public.process_definition where code = 'PROCESS-2026D' and version = 1) then
    raise notice 'PROCESS-2026D v1 already exists — 0079 skipped.';
    return;
  end if;

  select id into src from public.process_definition
   where code = 'PROCESS-2026C' and version = 1 and status = 'published';
  if src is null then
    raise exception 'PROCESS-2026C v1 is not present and published; 0079 copies it and cannot run.';
  end if;

  -- ── 1 · The definition, as a draft so its activities can be written. ──────
  insert into public.process_definition
    (code, name, version, status, source_ref, anchor_day_label, total_days,
     envelope_confidence, envelope_hours, envelope_hour_source)
  select 'PROCESS-2026D', 'Compost Standard Process 31-08-2026', 1, 'draft',
         sop || ' — built from PROCESS-2026C v1 (0079)', anchor_day_label, total_days,
         'FACTORY_CONFIRMED', 473, 'factory_stated'
    from public.process_definition where id = src
  returning id into dst;

  insert into public.process_day (process_definition_id, rel_day, title, source_ref)
  select dst, rel_day, title, source_ref from public.process_day where process_definition_id = src;

  -- ── 2 · Activities: copy 2026C, applying the SOP where it changes a row. ──
  insert into public.process_activity (
    process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
    cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0,
    is_time_gate, is_optional, default_enabled, golden_rule, source_ref, tbd_marker,
    responsible_role, lab_parameters, admin_question, day_span_label, standard_start_hour,
    standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset, timing_confidence, is_hold)
  select dst, a.code,
         coalesce(c.label, a.label_template),
         a.material_role, a.stream,
         case when coalesce(c.start_hr, a.standard_start_hour) is null then a.rel_day
              else floor(coalesce(c.start_hr, a.standard_start_hour) / 24)::int end,
         a.seq, a.scope, a.cardinality_rule,
         coalesce(c.min_hr, a.duration_target_min_hr),
         coalesce(c.max_hr, a.duration_target_max_hr),
         a.duration_required_at_day0, a.is_time_gate, a.is_optional, a.default_enabled,
         coalesce(c.golden_rule, a.golden_rule),
         case when c.code is null then a.source_ref else sop || ' · ' || c.cell end,
         a.tbd_marker, a.responsible_role, a.lab_parameters, a.admin_question, a.day_span_label,
         coalesce(c.start_hr, a.standard_start_hour),
         case when c.code is not null and c.end_hr is null and a.standard_end_hour is null then null
              else coalesce(c.end_hr, a.standard_end_hour) end,
         a.standard_hour_source, a.is_pre_h0, a.pre_h0_offset,
         coalesce(c.confidence, a.timing_confidence),
         a.is_hold
    from public.process_activity a
    left join (values
      ('MIX-HOP-WATER', 'Hopper pass 1, full water (target 73% moisture, temp <45–50 °C)', 3::numeric, 3::numeric, 144::numeric, 147::numeric, 'FACTORY_CONFIRMED'::process_confidence, null::text, 'C26:D26 (hopper pass 1 of 2; 16 h = pass 1 + pass 2 + 10 h rest)'),
      ('MIX-REST',      'Rest after hopper pass 2',                                         8,  10, 150, 160, 'FACTORY_RANGE',     null, 'C26:D26 (rest of 10 hours)'),
      ('TN-LEVEL',      'Levelling & conditioning 1',                                       14, 14, 326, 340, 'FACTORY_CONFIRMED', null, 'C62:D62'),
      ('TN-HEAT',       'Heating up',                                                       12, 12, 340, 352, 'FACTORY_CONFIRMED', null, 'C63:D63'),
      ('TN-PAST',       'Pasteurisation',                                                   8,  8,  352, 360, 'FACTORY_CONFIRMED', null, 'C64:D64'),
      ('TN-COOL-1',     'Cooling down 1',                                                   12, 14, 360, 374, 'FACTORY_RANGE',     null, 'C65:D65 (planned on MAX)'),
      ('TN-COND-2',     'Conditioning 2',                                                   80, 85, 374, 459, 'FACTORY_RANGE',     null, 'C66:D66 (planned on MAX)'),
      ('TN-COOL-2',     'Cooling down 2',                                                   8,  14, 459, 473, 'FACTORY_RANGE',     null, 'C67:D67 (planned on MAX)'),
      ('TUN-DISCHARGE-1', null, null, null, 473, null, null, 'H473 is the standard end, and it is measured on stream 1.', 'C68:C69 (unloading at 24 °C) after the 147 h tunnel process'),
      ('TUN-DISCHARGE-2', null, null, null, 475, null, null, null, 'C68:C69, stream 2 two hours after stream 1'),
      ('TUN-DISCHARGE-3', null, null, null, 477, null, null, null, 'C68:C69, stream 3 two hours after stream 2'),
      ('LAB-QC-FINAL',  null, null, null, 473, null, null, null, 'C68:C69 — final QC at unloading, with discharge 1')
    ) as c(code, label, min_hr, max_hr, start_hr, end_hr, confidence, golden_rule, cell)
      on c.code = a.code
   where a.process_definition_id = src;

  -- New: Stage 1B hopper pass 2, and Phase 2A tunnel preparation.
  insert into public.process_activity (
    process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
    cardinality_rule, duration_target_min_hr, duration_target_max_hr, duration_required_at_day0,
    is_time_gate, is_optional, default_enabled, golden_rule, source_ref, tbd_marker,
    responsible_role, lab_parameters, admin_question, day_span_label, standard_start_hour,
    standard_end_hour, standard_hour_source, is_pre_h0, pre_h0_offset, timing_confidence, is_hold)
  select dst, n.code, n.label, null, t.stream, floor(n.start_hr / 24)::int, n.seq, t.scope,
         t.cardinality_rule, n.hr, n.hr, false, false, false, true, n.golden_rule,
         sop || ' · ' || n.cell, null, 'operator', null, null, null, n.start_hr, n.start_hr + n.hr,
         'factory_stated', false, null, 'FACTORY_CONFIRMED', false
    from (values
      ('MIX-HOP-2', 'MIX-HOP-WATER', 115, 147::numeric, 3::numeric,
       'Hopper pass 2 (same duration as hopper pass 1)',
       'Stage 1B hopper pass 2. Not Stage 0A''s hopper pass 2 (FIB-HOP-2).',
       'C26:D26 ("Another Hopper Pass")'),
      ('TN-PREP', 'TN-LEVEL', 605, 316, 8,
       'Tunnel preparation — tunnel washed, gliding net tight over the grid, nets washed (no folds, dirt or stitch damage), probes cleaned, dried and hung, 6.0 m pulling net left at the winch side',
       'Ends when tunnel loading begins.',
       'C55:D58 (Phase 2A, 8 h)')
    ) as n(code, template_code, seq, start_hr, hr, label, golden_rule, cell)
    join public.process_activity t on t.process_definition_id = src and t.code = n.template_code;

  -- ── 3 · Evidence, gates and lab bindings, remapped by activity code. ─────
  insert into public.evidence_requirement
    (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
     gates_submission, capture_hint, ordering)
  select na.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
         er.gates_submission, er.capture_hint, er.ordering
    from public.evidence_requirement er
    join public.process_activity oa on oa.id = er.process_activity_id and oa.process_definition_id = src
    join public.process_activity na on na.process_definition_id = dst and na.code = oa.code;

  insert into public.evidence_requirement
    (process_activity_id, key, label, media_kinds, min_count, max_count, is_required,
     gates_submission, capture_hint, ordering)
  select na.id, er.key, er.label, er.media_kinds, er.min_count, er.max_count, er.is_required,
         er.gates_submission, er.capture_hint, er.ordering
    from public.process_activity na
    join public.process_activity tmpl on tmpl.process_definition_id = src and tmpl.code = 'MIX-HOP-WATER'
    join public.evidence_requirement er on er.process_activity_id = tmpl.id
   where na.process_definition_id = dst and na.code in ('MIX-HOP-2', 'TN-PREP');

  insert into public.gate_rule
    (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence,
     conflict_id, blocked_reason_template, ordering)
  select na.id, g.phase, g.kind, g.config, g.predecessor_binding, g.is_enabled, g.mapping_confidence,
         g.conflict_id, g.blocked_reason_template, g.ordering
    from public.gate_rule g
    join public.process_activity oa on oa.id = g.process_activity_id and oa.process_definition_id = src
    join public.process_activity na on na.process_definition_id = dst and na.code = oa.code;

  insert into public.gate_rule
    (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence,
     conflict_id, blocked_reason_template, ordering)
  select na.id, g.phase, g.kind, g.config, g.predecessor_binding, g.is_enabled, 'sop_direct',
         g.conflict_id, g.blocked_reason_template, g.ordering
    from public.process_activity na
    join public.process_activity tmpl on tmpl.process_definition_id = src and tmpl.code = 'MIX-HOP-WATER'
    join public.gate_rule g on g.process_activity_id = tmpl.id and g.kind = 'EVIDENCE_COMPLETE'
   where na.process_definition_id = dst and na.code in ('MIX-HOP-2', 'TN-PREP');

  insert into public.lab_checkpoint_activity
    (checkpoint_map, checkpoint_code, process_activity_id, gates_activity_code)
  select x.checkpoint_map, x.checkpoint_code, na.id, x.gates_activity_code
    from public.lab_checkpoint_activity x
    join public.process_activity oa on oa.id = x.process_activity_id and oa.process_definition_id = src
    join public.process_activity na on na.process_definition_id = dst and na.code = oa.code;

  -- ── 4 · Publish only if the version agrees with itself (same checks as s12). ──
  select * into s from public.v_process_envelope where process_definition_id = dst;
  if s.activity_count <> 112 then
    raise exception 'PROCESS-2026D has % activities; expected 112 (2026C''s 110 + MIX-HOP-2 + TN-PREP).', s.activity_count;
  end if;
  if s.unplaced_activity_count > 0 then
    raise exception 'PROCESS-2026D has % unplaced activities; refusing to publish.', s.unplaced_activity_count;
  end if;
  if s.envelope_disagrees then
    raise exception 'PROCESS-2026D computes %h against a stated %h; refusing to publish.',
      s.calculated_standard_hr, s.stated_envelope_hr;
  end if;

  update public.process_definition
     set status = 'published', published_at = now()
   where id = dst;

  update public.process_catalogue
     set current_definition_id = dst, set_at = now(),
         reason = 'PROCESS-2026D: official Compost SOP (31-08-2026) applied to PROCESS-2026C — 0079'
   where id = 1;
end $$;
