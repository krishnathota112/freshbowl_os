-- s03 · PROCESS-2026B — the 36 activity templates.
--
-- Source: docs/PROCESS_V2_FACTORY_CONFIRMED.md §17, translated to the role-based codes in
-- docs/ADMIN_CONFIGURABILITY_MODEL.md §3. Read §17 as this definition instantiated with
-- bagasse filling PRIMARY_FIBRE and paddy filling STRUCTURAL_STRAW.
--
-- NO material name appears in any code. NO literal count appears in any cardinality rule.
-- Both are enforced by the database, not by review.

insert into public.process_definition
  (code, name, version, status, source_ref, anchor_day_label, total_days)
values
  ('PROCESS-2026B','Current factory operational process',1,'published',
   'factory walkthrough 20 Aug 2026','Day 0 = Fibre Weighment',22)
on conflict (code, version) do update set
  status = excluded.status, name = excluded.name, total_days = excluded.total_days;

with pd as (select id from public.process_definition where code = 'PROCESS-2026B' and version = 1)
insert into public.process_activity (
  process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
  cardinality_rule, duration_target_min_hr, duration_target_max_hr,
  duration_required_at_day0, is_time_gate, golden_rule, source_ref, tbd_marker)
select pd.id, a.code, a.label_template, a.material_role::material_role_code, a.stream::stream_code,
       a.rel_day, a.seq, a.scope::activity_scope, a.cardinality_rule::jsonb,
       a.dmin, a.dmax, a.dreq, a.tgate, a.golden, a.source_ref, a.tbd
from pd, (values

-- ── PRIMARY FIBRE stream · Days 0–7 ──────────────────────────────────────────
-- Load count is DERIVED: ceil(21.0 / 2.0) = 11. Never 10, never 11, never a constant.
('FIB1-WEIGH','{role_lead} Weighment','PRIMARY_FIBRE','PRIMARY_FIBRE',0,10,'LOAD',
 '{"kind":"DERIVED_FROM_QUANTITY","quantity_field":"primary_fibre_required_mt","capacity_field":"expected_load_capacity_mt","formula":"ceil","tail_instance_takes_remainder":true}',
 null,null,false,false,null,'W §2','TBD-20'),

('FIB1-HOP-1','{role_lead} Hopper Pass 1','PRIMARY_FIBRE','PRIMARY_FIBRE',1,20,'MASTER',
 '{"kind":"SINGLETON"}',null,null,false,false,null,'W §3.1',null),

-- Pass 2 always runs; only the water flag is conditional. See activity_variant + C-29.
('FIB1-HOP-2','{role_lead} Hopper Pass 2','PRIMARY_FIBRE','PRIMARY_FIBRE',1,30,'MASTER',
 '{"kind":"SINGLETON"}',null,null,false,false,null,'W §3.2',null),

('FIB1-BUNK-LOAD','{role_lead} Bunker Loading','PRIMARY_FIBRE','PRIMARY_FIBRE',1,40,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',2,2,false,false,
 'Stage-0 decides whether nitrogen will bind or escape.','W §3.3',null),

-- Rest: no default duration. The factory never stated the hours (TBD-21).
('FIB1-REST-1','{role_lead} Rest','PRIMARY_FIBRE','PRIMARY_FIBRE',2,50,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',null,null,true,true,
 'Do not assume the calendar means the batch can progress. Process state controls progression.',
 'W §4','TBD-21'),

('FIB1-UNLOAD','{role_lead} Unload','PRIMARY_FIBRE','PRIMARY_FIBRE',4,60,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',3,3,false,false,null,'W §5.1','TBD-22'),

('FIB1-HOP-3','{role_lead} Hopper Pass','PRIMARY_FIBRE','PRIMARY_FIBRE',4,70,'MASTER',
 '{"kind":"SINGLETON"}',3,3,false,false,null,'W §5.2','TBD-35'),

('FIB1-BUNK-RELOAD','{role_lead} Reload','PRIMARY_FIBRE','PRIMARY_FIBRE',4,80,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',2,2,false,false,null,'W §5.3',null),

-- ── STRUCTURAL STRAW stream · Days 4–7, parallel ─────────────────────────────
('STRAW-RECEIPT','{role_lead} Receipt','STRUCTURAL_STRAW','STRUCTURAL_STRAW',4,90,'MASTER',
 '{"kind":"SINGLETON"}',null,null,false,false,null,'W §6.1','TBD-23'),

-- ── CLIENT DECISION 5, 23 Aug 2026 · inspection and weighment as DISTINCT activities ────────
-- "Keep these as distinct activities: Bunker unloading, Paddy inspection, Paddy weighment,
-- Hopper pass, Reload." Three of the five already existed. Inspection and weighment did not:
-- the straw stream went receipt -> bale cutting with nothing in between, so the two operations
-- the client named could not be recorded or timestamped separately.
--
-- SINGLETON, not DERIVED_FROM_QUANTITY. The fibre weighment derives its load count from
-- `primary_fibre_required_mt` / `expected_load_capacity_mt`; NO source gives either figure for
-- the straw stream, so a load count here would be an invented number (rule 2). The client asked
-- for one weighment activity and that is what this is.
--
-- TBD-23 is carried rather than a new marker invented: it already asks which day the straw
-- receipt work falls on, and these sit in that same Day-4 block.
('STRAW-INSPECT','{role_lead} Inspection','STRUCTURAL_STRAW','STRUCTURAL_STRAW',4,92,'MASTER',
 '{"kind":"SINGLETON"}',null,null,false,false,null,
 'client decision 23 Aug 2026 · lab dictation §4','TBD-23'),

('STRAW-WEIGH','{role_lead} Weighment','STRUCTURAL_STRAW','STRUCTURAL_STRAW',4,94,'MASTER',
 '{"kind":"SINGLETON"}',null,null,false,false,null,
 'client decision 23 Aug 2026 · lab dictation §4.4','TBD-23'),

('STRAW-BALE-CUT','{role_lead} Bale Cutting','STRUCTURAL_STRAW','STRUCTURAL_STRAW',4,100,'MASTER',
 '{"kind":"SINGLETON"}',null,null,false,false,null,'W §6.2','TBD-23'),

('STRAW-SOAK-1','{role_lead} Soaking 1','STRUCTURAL_STRAW','STRUCTURAL_STRAW',5,110,'MASTER',
 '{"kind":"SINGLETON"}',8,10,false,false,null,'W §6.3','TBD-23'),

-- Straw occupies a bunker. That makes it a competitor for bunker capacity (C-24).
('STRAW-BUNK-STORE','{role_lead} Bunker Storage','STRUCTURAL_STRAW','STRUCTURAL_STRAW',5,120,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE","count_field":"straw_bunker_count"}',
 null,null,false,false,null,'W §6.4','TBD-28'),

('STRAW-REST-1','{role_lead} Rest','STRUCTURAL_STRAW','STRUCTURAL_STRAW',5,130,'MASTER',
 '{"kind":"SINGLETON"}',null,null,true,true,null,'W §6.4','TBD-24'),

('STRAW-SOAK-2','{role_lead} Soaking 2','STRUCTURAL_STRAW','STRUCTURAL_STRAW',6,140,'MASTER',
 '{"kind":"SINGLETON"}',8,10,false,false,null,'W §6.5',null),

('STRAW-SOAK-3','{role_lead} Soaking 3','STRUCTURAL_STRAW','STRUCTURAL_STRAW',7,150,'MASTER',
 '{"kind":"SINGLETON"}',8,10,false,false,null,'W §6.6',null),

-- A stated band is the SOP; Day-0 still pins the value inside it. Every time gate is
-- duration_required_at_day0, without exception.
('STRAW-REST-2','{role_lead} Rest after Soaking 3','STRUCTURAL_STRAW','STRUCTURAL_STRAW',7,160,'MASTER',
 '{"kind":"SINGLETON"}',14,16,true,true,null,'W §6.7',null),

-- ── NITROGEN + MINERAL stream · Day 7 ────────────────────────────────────────
-- The reference case for multi-evidence: three named requirements, the third being the
-- ammonium sulphate spread by hand.
('NMIX-ROTAVATE','Nitrogen + Mineral Mix','NITROGEN_SOURCE','NITROGEN_MINERAL',7,170,'MASTER',
 '{"kind":"SINGLETON"}',6,6,false,false,null,'W §7.1',null),

-- ── YARD stream · Days 7–8 ───────────────────────────────────────────────────
-- Creates the yard piles. Count from Day-0 config, never hard-coded.
('FIB1-YARD-UNLOAD','{role_lead} to Yard','PRIMARY_FIBRE','PRIMARY_FIBRE',7,180,'PILE',
 '{"kind":"CREATES_SCOPE_INSTANCES","scope":"PILE","count_field":"yard_pile_count","label_prefix":"PILE"}',
 2,2,false,false,null,'W §8.1',null),

('YD-NMIX-ADD','Add Nitrogen Mix to Piles',null,'YARD',7,190,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE"}',null,null,false,false,null,'W §8.2',null),

('YD-FLIP-1','Flip 1',null,'YARD',7,200,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE"}',2,2,false,false,null,'W §8.3','TBD-25'),

('YD-FLIP-2','Flip 2',null,'YARD',7,210,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE"}',2,2,false,false,null,'W §8.4','TBD-25'),

-- Piles converge: 2 piles become 1 MIXED-PILE. Water always on for this pass.
('YD-HOP-COMBINE','Combine Piles — Hopper Pass with Water',null,'YARD',7,220,'PILE',
 '{"kind":"MERGES_SCOPE_INSTANCES","scope":"PILE","from":"all_open","to_count":1,"new_label":"MIXED-PILE"}',
 3,3,false,false,null,'W §8.5',null),

('YD-REST','Yard Rest',null,'YARD',7,230,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE","count_field":"mixed_pile_count"}',
 8,10,true,true,null,'W §8.6',null),

-- Spatial layout is operationally meaningful: mixed pile centre, straw piles beside it.
('STRAW-YARD-LOAD','{role_lead} Piles to Yard','STRUCTURAL_STRAW','STRUCTURAL_STRAW',7,240,'STRAW_PILE',
 '{"kind":"CREATES_SCOPE_INSTANCES","scope":"STRAW_PILE","count_field":"straw_pile_count","label_prefix":"STRAW-PILE"}',
 3,3,false,false,null,'W §8.7','TBD-19'),

('YD-FLIP-3','Flip 3 — Straw and Fibre Mix',null,'YARD',8,250,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE","count_field":"turner_pile_count"}',
 4,4,false,false,null,'W §9.1','TBD-25'),

('YD-FLIP-4','Flip 4',null,'YARD',8,260,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE","count_field":"turner_pile_count"}',
 4,4,false,false,null,'W §9.2','TBD-25'),

('TR-T0','Turner Pass T0',null,'YARD',8,270,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE","count_field":"turner_pile_count"}',
 6,8,false,false,null,'W §9.3',null),

-- T1 and T2 run PER PILE with two turners. T2 on a pile starts as soon as THAT pile's T1
-- finishes — see the SAME_SCOPE_INSTANCE gate in s04. A global barrier here is a failed build.
('TR-T1','Turner Pass T1',null,'YARD',8,280,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE","count_field":"turner_pile_count"}',
 6,8,false,false,null,'W §9.4',null),

('TR-T2','Turner Pass T2',null,'YARD',8,290,'PILE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"PILE","count_field":"turner_pile_count"}',
 6,8,false,false,null,'W §9.4',null),

-- ── BUNKER stream · Days 8–14 ────────────────────────────────────────────────
('P1-BUNK-LOAD','Bunker Loading',null,'BUNKER',8,300,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',3,3,false,false,null,'W §9.5',null),

('P1-REST-1','Bunker Rest 1',null,'BUNKER',10,310,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',null,null,true,true,null,'W §11','TBD-21'),

-- ONE Phase-1 reload (frozen decision 3, C-25). History shows two; the walkthrough says one.
('P1-BUNK-RELOAD','Bunker Reload',null,'BUNKER',12,320,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',9,9,false,false,null,'W §12','TBD-26'),

('P1-REST-2','Bunker Rest 2',null,'BUNKER',13,330,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',null,null,true,true,null,'W §13','TBD-21'),

-- ── TUNNEL stream · Days 15–22 ───────────────────────────────────────────────
('TN-LOAD','Tunnel Loading',null,'TUNNEL',15,340,'TUNNEL',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"TUNNEL"}',6,8,false,false,
 'Tunnel assignment may differ from bunker assignment. Do not assume a permanent one-to-one relationship.',
 'W §14',null),

-- Not blank days. The named thermal stages live in phase2_control_band (C-27).
('TN-HOLD','Tunnel Process',null,'TUNNEL',16,350,'TUNNEL',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"TUNNEL"}',null,null,true,true,null,'W §15','TBD-08'),

('TN-UNLOAD','Tunnel Unloading',null,'TUNNEL',22,360,'TUNNEL',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"TUNNEL"}',8,8,false,false,null,'W §16',null)

) as a(code, label_template, material_role, stream, rel_day, seq, scope, cardinality_rule,
       dmin, dmax, dreq, tgate, golden, source_ref, tbd)
on conflict (process_definition_id, code) do update set
  label_template            = excluded.label_template,
  material_role             = excluded.material_role,
  stream                    = excluded.stream,
  rel_day                   = excluded.rel_day,
  seq                       = excluded.seq,
  scope                     = excluded.scope,
  cardinality_rule          = excluded.cardinality_rule,
  duration_target_min_hr    = excluded.duration_target_min_hr,
  duration_target_max_hr    = excluded.duration_target_max_hr,
  duration_required_at_day0 = excluded.duration_required_at_day0,
  is_time_gate              = excluded.is_time_gate,
  golden_rule               = excluded.golden_rule,
  source_ref                = excluded.source_ref,
  tbd_marker                = excluded.tbd_marker;
