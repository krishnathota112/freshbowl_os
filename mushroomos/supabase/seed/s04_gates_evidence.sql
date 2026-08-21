-- s04 · Gates, evidence requirements, variants, movement and resource rules.
-- Resolves activity ids by code, so it must run after s03.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: the PROCESS-2026B activity id for a code.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._pa(p_code text) returns uuid
language sql stable as $$
  select pa.id from public.process_activity pa
  join public.process_definition pd on pd.id = pa.process_definition_id
  where pd.code = 'PROCESS-2026B' and pa.code = p_code;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotency. gate_rule and resource_requirement carry no natural unique key, so
-- ON CONFLICT cannot protect them. This file OWNS every such row for PROCESS-2026B,
-- so it clears them before reinserting. Re-running the seed must be a no-op, not a
-- duplication — CI applies the seeds twice to prove it.
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.gate_rule
 where process_activity_id in (
   select pa.id from public.process_activity pa
   join public.process_definition pd on pd.id = pa.process_definition_id
   where pd.code = 'PROCESS-2026B');

delete from public.resource_requirement
 where process_activity_id in (
   select pa.id from public.process_activity pa
   join public.process_definition pd on pd.id = pa.process_definition_id
   where pd.code = 'PROCESS-2026B');

-- ─────────────────────────────────────────────────────────────────────────────
-- EVIDENCE. Named requirements, individually satisfied — never a photo count.
-- docs/EVIDENCE_CONFIGURATION_MODEL.md §3.
-- ─────────────────────────────────────────────────────────────────────────────

-- The before/after pair, which is 33 of the 36. Ordering matters so the pair reads as a pair.
insert into public.evidence_requirement
  (process_activity_id, key, label, media_kinds, min_count, gates_submission, ordering)
select public._pa(c.code), e.key, e.label, '{photo}', 1, true, e.ordering
from (values
  ('FIB1-HOP-1'),('FIB1-HOP-2'),('FIB1-BUNK-LOAD'),('FIB1-UNLOAD'),('FIB1-BUNK-RELOAD'),
  ('STRAW-BALE-CUT'),('STRAW-SOAK-1'),('STRAW-SOAK-2'),('STRAW-SOAK-3'),('STRAW-BUNK-STORE'),
  ('FIB1-YARD-UNLOAD'),('YD-NMIX-ADD'),('YD-FLIP-1'),('YD-FLIP-2'),('YD-HOP-COMBINE'),
  ('STRAW-YARD-LOAD'),('YD-FLIP-3'),('YD-FLIP-4'),('TR-T0'),('TR-T1'),('TR-T2'),
  ('P1-BUNK-LOAD'),('P1-BUNK-RELOAD'),('TN-LOAD'),('TN-UNLOAD')
) as c(code)
cross join (values ('before','Photo before',10), ('after','Photo after',20)) as e(key,label,ordering)
where public._pa(c.code) is not null
on conflict (process_activity_id, key) do update set label = excluded.label;

-- NMIX-ROTAVATE takes THREE. The third is not "a third photo" but a specific named thing:
-- the ammonium sulphate being spread by hand. This is why evidence is requirement-based.
insert into public.evidence_requirement
  (process_activity_id, key, label, media_kinds, min_count, gates_submission, capture_hint, ordering)
values
  (public._pa('NMIX-ROTAVATE'),'before','Photo before mixing','{photo}',1,true,null,10),
  (public._pa('NMIX-ROTAVATE'),'after','Photo after mixing','{photo}',1,true,null,20),
  (public._pa('NMIX-ROTAVATE'),'as_hand_mixing','Ammonium sulphate hand mixing','{photo}',1,true,
   'Show the ammonium sulphate being spread by hand',30)
on conflict (process_activity_id, key) do update set
  label = excluded.label, capture_hint = excluded.capture_hint;

-- Video permitted on the Day-4 hopper pass only. TBD-35: ~40x the storage of a photo.
update public.evidence_requirement
   set media_kinds = '{photo,video}'
 where process_activity_id = public._pa('FIB1-HOP-3');

insert into public.evidence_requirement
  (process_activity_id, key, label, media_kinds, min_count, gates_submission, ordering)
values
  (public._pa('FIB1-HOP-3'),'before','Photo or video before pass','{photo,video}',1,true,10),
  (public._pa('FIB1-HOP-3'),'after','Photo or video after pass','{photo,video}',1,true,20),
  -- One photo per load. TBD-34: 11 loads is a lot of capture on a phone; Day-0 configurable.
  (public._pa('FIB1-WEIGH'),'load','Load photo — weighbridge slip or loaded vehicle','{photo}',1,true,10)
on conflict (process_activity_id, key) do update set label = excluded.label;

-- ─────────────────────────────────────────────────────────────────────────────
-- VARIANTS — the conditional hopper pass.
--
-- FROZEN DECISION 1: auto_select_enabled = false on both. The threshold that would drive
-- the choice is itself disputed (C-01), and the decision changes the physical action, so
-- the operator chooses with BOTH candidate bands on screen and a mandatory reason.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.activity_variant
  (process_activity_id, code, label, selection_rule, auto_select_enabled,
   requires_reason_on_override, conflict_id)
values
  (public._pa('FIB1-HOP-2'),'WATER','Water Hopper Pass',
   '{"input_field":"measured_moisture_pct","if_below":"WATER","if_within_or_above":"DRY",
     "candidate_bands":[{"min":68,"max":69,"source":"S1a 0A"},
                        {"min":75,"max":78,"source":"S4a Table 2"}]}'::jsonb,
   false, true, 'C-29'),
  (public._pa('FIB1-HOP-2'),'DRY','Dry Hopper Pass', null, false, true, 'C-29'),
  (public._pa('FIB1-HOP-3'),'WATER','Water Hopper Pass',
   '{"input_field":"measured_moisture_pct","if_below":"WATER","if_within_or_above":"DRY",
     "candidate_bands":[{"min":68,"max":69,"source":"S1a 0A"},
                        {"min":75,"max":78,"source":"S4a Table 2"}]}'::jsonb,
   false, true, 'C-29'),
  (public._pa('FIB1-HOP-3'),'DRY','Dry Hopper Pass', null, false, true, 'C-29')
on conflict (process_activity_id, code) do update set
  auto_select_enabled = excluded.auto_select_enabled,
  selection_rule = excluded.selection_rule,
  conflict_id = excluded.conflict_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- GATES. Every rule carries a reason template — a blocked card always explains itself.
-- ─────────────────────────────────────────────────────────────────────────────

-- Linear predecessor chain within each stream.
insert into public.gate_rule
  (process_activity_id, phase, kind, config, predecessor_binding,
   blocked_reason_template, mapping_confidence, ordering)
select public._pa(g.code), 'entry', 'PREDECESSOR',
       json_build_object('activity_codes', json_build_array(g.pred))::jsonb,
       g.binding, g.reason, 'dictated', 10
from (values
  ('FIB1-HOP-1','FIB1-WEIGH','ALL_INSTANCES','Locked — {predecessor_label} not complete on all loads'),
  ('FIB1-HOP-2','FIB1-HOP-1','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('FIB1-BUNK-LOAD','FIB1-HOP-2','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('FIB1-REST-1','FIB1-BUNK-LOAD','SAME_SCOPE_INSTANCE','Locked — {predecessor_label} not complete on {scope_label}'),
  ('FIB1-UNLOAD','FIB1-REST-1','SAME_SCOPE_INSTANCE','Locked — rest not complete on {scope_label}'),
  ('FIB1-HOP-3','FIB1-UNLOAD','ALL_INSTANCES','Locked — {predecessor_label} not complete on all lines'),
  ('FIB1-BUNK-RELOAD','FIB1-HOP-3','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('STRAW-BALE-CUT','STRAW-RECEIPT','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('STRAW-SOAK-1','STRAW-BALE-CUT','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('STRAW-BUNK-STORE','STRAW-SOAK-1','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('STRAW-REST-1','STRAW-BUNK-STORE','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('STRAW-SOAK-2','STRAW-REST-1','ALL_INSTANCES','Locked — rest not complete'),
  ('STRAW-SOAK-3','STRAW-SOAK-2','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('STRAW-REST-2','STRAW-SOAK-3','ALL_INSTANCES','Locked — {predecessor_label} not complete'),
  ('FIB1-YARD-UNLOAD','FIB1-BUNK-RELOAD','ALL_INSTANCES','Locked — {predecessor_label} not complete on all lines'),
  ('YD-FLIP-1','YD-NMIX-ADD','SAME_SCOPE_INSTANCE','Locked — nitrogen mix not added to {scope_label}'),
  ('YD-FLIP-2','YD-FLIP-1','SAME_SCOPE_INSTANCE','Locked — Flip 1 not complete on {scope_label}'),
  ('YD-HOP-COMBINE','YD-FLIP-2','ALL_INSTANCES','Locked — Flip 2 not complete on all piles'),
  ('YD-REST','YD-HOP-COMBINE','ALL_INSTANCES','Locked — combine pass not complete'),
  ('YD-FLIP-4','YD-FLIP-3','SAME_SCOPE_INSTANCE','Locked — Flip 3 not complete on {scope_label}'),
  ('TR-T0','YD-FLIP-4','SAME_SCOPE_INSTANCE','Locked — Flip 4 not complete on {scope_label}'),
  ('TR-T1','TR-T0','SAME_SCOPE_INSTANCE','Locked — T0 not complete on {scope_label}'),
  ('P1-REST-1','P1-BUNK-LOAD','SAME_SCOPE_INSTANCE','Locked — bunker loading not complete on {scope_label}'),
  ('P1-BUNK-RELOAD','P1-REST-1','SAME_SCOPE_INSTANCE','Locked — rest not complete on {scope_label}'),
  ('P1-REST-2','P1-BUNK-RELOAD','SAME_SCOPE_INSTANCE','Locked — reload not complete on {scope_label}'),
  ('TN-HOLD','TN-LOAD','SAME_SCOPE_INSTANCE','Locked — tunnel loading not complete on {scope_label}'),
  ('TN-UNLOAD','TN-HOLD','SAME_SCOPE_INSTANCE','Locked — tunnel process not complete on {scope_label}')
) as g(code, pred, binding, reason)
where public._pa(g.code) is not null and public._pa(g.pred) is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- THE T1 → T2 RULE.
--
-- "once a pile is done by T1, another turner does T2." Pile 2's T2 waits on pile 2's T1
-- ONLY. With three piles this is ~24 h of wall clock; as a global barrier it would be ~42 h
-- and it would be wrong, because it is not what the factory does.
--
-- docs/STEP_1_2_BUILD_SPEC.md §2.6 item 4: "Getting this wrong fails the build."
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.gate_rule
  (process_activity_id, phase, kind, config, predecessor_binding,
   blocked_reason_template, mapping_confidence, ordering)
values
  (public._pa('TR-T2'), 'entry', 'PREDECESSOR',
   '{"activity_codes":["TR-T1"]}'::jsonb,
   'SAME_SCOPE_INSTANCE',
   'Locked — T1 not complete on {scope_label}',
   'dictated', 10);

-- Convergence gates: where streams meet, name WHICH stream is being waited on.
insert into public.gate_rule
  (process_activity_id, phase, kind, config, predecessor_binding,
   blocked_reason_template, mapping_confidence, ordering)
values
  (public._pa('YD-NMIX-ADD'), 'entry', 'BOTH',
   '{"sub":[{"kind":"PREDECESSOR","activity_codes":["FIB1-YARD-UNLOAD"],"binding":"ALL_INSTANCES"},
            {"kind":"PREDECESSOR","activity_codes":["NMIX-ROTAVATE"],"binding":"ANY_INSTANCE"}]}'::jsonb,
   'ALL_INSTANCES',
   'Blocked — waiting for {stream_label}: {predecessor_label} not complete',
   'dictated', 10),
  (public._pa('YD-FLIP-3'), 'entry', 'BOTH',
   '{"sub":[{"kind":"PREDECESSOR","activity_codes":["YD-REST"],"binding":"ALL_INSTANCES"},
            {"kind":"PREDECESSOR","activity_codes":["STRAW-YARD-LOAD"],"binding":"ALL_INSTANCES"}]}'::jsonb,
   'ALL_INSTANCES',
   'Blocked — waiting for {stream_label}: {predecessor_label} not complete',
   'dictated', 10),
  (public._pa('P1-BUNK-LOAD'), 'entry', 'PREDECESSOR',
   '{"activity_codes":["TR-T2"]}'::jsonb, 'ALL_INSTANCES',
   'Locked — T2 not complete on all piles', 'dictated', 10),
  -- Pooling is a decision over the whole batch, which is also why it is a GM checkpoint.
  (public._pa('TN-LOAD'), 'entry', 'PREDECESSOR',
   '{"activity_codes":["P1-REST-2"]}'::jsonb, 'ALL_INSTANCES',
   'Locked — not every bunker line has completed its rest', 'dictated', 10),
  (public._pa('TN-LOAD'), 'entry', 'GM_APPROVAL',
   '{"checkpoint":3}'::jsonb, null,
   'Awaiting GM approval — checkpoint 3, Phase-1 to Phase-2 release', 'dictated', 20),
  (public._pa('STRAW-YARD-LOAD'), 'entry', 'PREDECESSOR',
   '{"activity_codes":["STRAW-REST-2"]}'::jsonb, 'ALL_INSTANCES',
   'Locked — straw rest not complete', 'dictated', 10);

-- Time gates. Duration comes from a REQUIRED Day-0 field with NO default (TBD-21).
insert into public.gate_rule
  (process_activity_id, phase, kind, config, blocked_reason_template,
   mapping_confidence, conflict_id, ordering)
select public._pa(t.code), 'exit', 'DAY0_DURATION',
       json_build_object('config_field', t.field)::jsonb,
       'Resting — {remaining} of {required} remaining', 'dictated', t.conflict, 10
from (values
  ('FIB1-REST-1','rest_duration_d2_d3_hr','TBD-21'),
  ('STRAW-REST-1','rest_duration_straw_store_hr','TBD-24'),
  ('STRAW-REST-2','rest_duration_straw_soak3_hr',null),
  ('YD-REST','rest_duration_yard_hr',null),
  ('P1-REST-1','rest_duration_d10_d11_hr','TBD-21'),
  ('P1-REST-2','rest_duration_d13_d14_hr','TBD-21'),
  ('TN-HOLD','tunnel_hold_duration_hr','C-27')
) as t(code, field, conflict)
where public._pa(t.code) is not null;

-- Evidence completeness gates submission, server-side, per named requirement.
insert into public.gate_rule
  (process_activity_id, phase, kind, config, blocked_reason_template, mapping_confidence, ordering)
select pa.id, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb,
       'Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}',
       'dictated', 20
from public.process_activity pa
join public.process_definition pd on pd.id = pa.process_definition_id
where pd.code = 'PROCESS-2026B'
  and exists (select 1 from public.evidence_requirement er
              where er.process_activity_id = pa.id and er.gates_submission);

-- An activity cannot be submitted with an open machine stint — an unclosed stint silently
-- inflates utilisation.
insert into public.gate_rule
  (process_activity_id, phase, kind, config, blocked_reason_template, mapping_confidence, ordering)
select pa.id, 'exit', 'MACHINE_STINT_CLOSED', '{}'::jsonb,
       'Cannot submit — machine stint on {machine_code} is still running', 'dictated', 30
from public.process_activity pa
join public.process_definition pd on pd.id = pa.process_definition_id
where pd.code = 'PROCESS-2026B' and not pa.is_time_gate;

-- ─────────────────────────────────────────────────────────────────────────────
-- MOVEMENT RULES. A reload's destination must differ from its source.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.movement_rule
  (process_activity_id, source_kind, destination_kind, requires_distinct_vessel,
   allow_same_vessel_override, creates_locations, consumes_locations)
values
  (public._pa('FIB1-BUNK-LOAD'),'YARD','BUNKER',false,false,null,null),
  (public._pa('FIB1-UNLOAD'),'BUNKER',null,false,false,null,null),
  (public._pa('FIB1-BUNK-RELOAD'),'BUNKER','BUNKER',true,false,null,null),
  (public._pa('STRAW-BUNK-STORE'),'SOAK_PIT','BUNKER',false,false,null,null),
  (public._pa('FIB1-YARD-UNLOAD'),'BUNKER','YARD',false,false,
   '{"kind":"PILE","count_field":"yard_pile_count"}'::jsonb,null),
  (public._pa('YD-HOP-COMBINE'),'YARD','YARD',false,false,
   '{"kind":"PILE","count_field":"mixed_pile_count"}'::jsonb,
   '{"kind":"PILE","from":"all_open"}'::jsonb),
  (public._pa('STRAW-YARD-LOAD'),'BUNKER','YARD',false,false,
   '{"kind":"STRAW_PILE","count_field":"straw_pile_count"}'::jsonb,null),
  (public._pa('P1-BUNK-LOAD'),'YARD','BUNKER',false,false,null,
   '{"kind":"PILE","from":"all_open"}'::jsonb),
  (public._pa('P1-BUNK-RELOAD'),'BUNKER','BUNKER',true,false,null,null),
  (public._pa('TN-LOAD'),'BUNKER','TUNNEL',false,false,null,null),
  (public._pa('TN-UNLOAD'),'TUNNEL',null,false,false,null,null)
on conflict (process_activity_id) do update set
  requires_distinct_vessel = excluded.requires_distinct_vessel,
  creates_locations = excluded.creates_locations,
  consumes_locations = excluded.consumes_locations;

-- ─────────────────────────────────────────────────────────────────────────────
-- RESOURCE REQUIREMENTS.
-- T1 and T2 carry DISTINCT turner role hints, so one turner cannot satisfy both.
-- That is what makes the parallelism provable rather than hoped-for.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.resource_requirement
  (process_activity_id, machine_kind, quantity, is_required, role_hint)
select public._pa(r.code), r.kind::machine_kind, 1, true, r.hint
from (values
  ('FIB1-WEIGH','VEHICLE_TRUCK','delivery'),
  ('FIB1-WEIGH','LOADER_JCB','loader'),
  ('FIB1-HOP-1','HOPPER',null),
  ('FIB1-HOP-2','HOPPER',null),
  ('FIB1-HOP-3','HOPPER',null),
  ('FIB1-BUNK-LOAD','LOADER_JCB',null),
  ('FIB1-UNLOAD','LOADER_JCB',null),
  ('FIB1-BUNK-RELOAD','LOADER_JCB',null),
  ('STRAW-RECEIPT','VEHICLE_TRUCK','delivery'),
  ('STRAW-BUNK-STORE','LOADER_JCB',null),
  ('NMIX-ROTAVATE','ROTAVATOR',null),
  ('FIB1-YARD-UNLOAD','LOADER_JCB',null),
  ('YD-NMIX-ADD','LOADER_JCB',null),
  ('YD-FLIP-1','TURNER',null),
  ('YD-FLIP-2','TURNER',null),
  ('YD-HOP-COMBINE','HOPPER',null),
  ('STRAW-YARD-LOAD','LOADER_JCB',null),
  ('YD-FLIP-3','TURNER',null),
  ('YD-FLIP-4','TURNER',null),
  ('TR-T0','TURNER','primary_turner'),
  ('TR-T1','TURNER','primary_turner'),
  ('TR-T2','TURNER','secondary_turner'),
  ('P1-BUNK-LOAD','LOADER_JCB',null),
  ('P1-BUNK-RELOAD','LOADER_JCB',null),
  ('TN-LOAD','CONVEYOR',null),
  ('TN-UNLOAD','CONVEYOR',null)
) as r(code, kind, hint)
where public._pa(r.code) is not null;
