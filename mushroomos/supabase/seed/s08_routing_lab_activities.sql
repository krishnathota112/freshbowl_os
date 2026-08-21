-- s08 · Task routing, and the lab check activities.
--
-- "things related to pH checks — all these things are done by Lab, so they are assigned to
-- lab." responsible_role is seeded from the activity's nature: anything measuring pH,
-- moisture, EC, ash, nitrogen or C:N routes to lab; anything moving, mixing, loading or
-- turning material routes to operator.
--
-- Adding these nine rows is a SEED change. No application code changes, and the schedule
-- screen grows nine rows. That is acceptance condition 10.

-- Everything that moves material is the operator's.
update public.process_activity set responsible_role = 'operator'
 where responsible_role is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lab checks. Nine of them, at the points the lab workbook actually measures.
-- ─────────────────────────────────────────────────────────────────────────────
with pd as (select id from public.process_definition where code = 'PROCESS-2026B' and version = 1)
insert into public.process_activity (
  process_definition_id, code, label_template, material_role, stream, rel_day, seq, scope,
  cardinality_rule, duration_target_min_hr, duration_target_max_hr,
  responsible_role, lab_parameters, golden_rule, source_ref, tbd_marker)
select pd.id, a.code, a.label, a.mrole::material_role_code, a.stream::stream_code,
       a.rel_day, a.seq, a.scope::activity_scope, a.rule::jsonb, a.dmin, a.dmax,
       'lab_tech'::app_role, a.params, a.golden, a.src, a.tbd
from pd, (values

-- Day 1 · this is the check that decides water or dry on the next pass.
('LAB-FIB-MOISTURE-1','{role_lead} Moisture Check','PRIMARY_FIBRE','PRIMARY_FIBRE',1,15,'MASTER',
 '{"kind":"SINGLETON"}',0.5,1,array['moisture_pct'],
 'This result decides whether the next hopper pass runs with water or dry.','S4b BO-BQ','C-29'),

-- Day 4 · same decision, before the reload.
('LAB-FIB-MOISTURE-2','{role_lead} Moisture Check','PRIMARY_FIBRE','PRIMARY_FIBRE',4,65,'MASTER',
 '{"kind":"SINGLETON"}',0.5,1,array['moisture_pct'],
 'This result decides whether the Day-4 hopper pass runs with water or dry.','S4b BR-BT','C-29'),

-- Days 5-7 · lagoon water, before and after each soak.
('LAB-LAGOON-1','Lagoon Check — Soak 1',null,'STRUCTURAL_STRAW',5,115,'MASTER',
 '{"kind":"SINGLETON"}',0.5,1,array['ph','ec','tds'],
 'Dilution water outside pH 6.5-7.5 or EC 1.5 carries into every soak.','S4b BU-BZ',null),
('LAB-LAGOON-2','Lagoon Check — Soak 2',null,'STRUCTURAL_STRAW',6,145,'MASTER',
 '{"kind":"SINGLETON"}',0.5,1,array['ph','ec','tds'],null,'S4b CA-CF',null),
('LAB-LAGOON-3','Lagoon Check — Soak 3',null,'STRUCTURAL_STRAW',7,155,'MASTER',
 '{"kind":"SINGLETON"}',0.5,1,array['ph','ec','tds'],null,'S4b CG-CL',null),

-- Day 8-9 · the full panel, per bunker line.
('LAB-BUNK-FILL','Bunker Fill Check',null,'BUNKER',8,305,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',1,2,
 array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],
 'C:N is computed from ash and nitrogen. It is never typed.','S4b CP-CU',null),

-- Day 12 · after the reload.
('LAB-BUNK-RELOAD','Reload Check',null,'BUNKER',12,325,'BUNKER_LINE',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',1,2,
 array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],null,'S4b CZ-DE',null),

-- Day 15 · at tunnel loading, per tunnel.
('LAB-TUNNEL-LOAD','Tunnel Load Check',null,'TUNNEL',15,345,'TUNNEL',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"TUNNEL"}',1,2,
 array['ph','ec','moisture_pct','ash_pct','n_pct','cn_ratio'],null,'S4b DT-DY',null),

-- Day 22 · compost out, including the sensory panel.
('LAB-COMPOST-OUT','Compost-Out QC',null,'TUNNEL',22,365,'TUNNEL',
 '{"kind":"PER_SCOPE_INSTANCE","scope":"TUNNEL"}',1,2,
 array['moisture_pct','n_pct','ph','ec','spring','colour','actinomycetes','smell'],
 'Colour and actinomycetes need a photo. They are enumerated values, not notes.','S3f §4',null)

) as a(code,label,mrole,stream,rel_day,seq,scope,rule,dmin,dmax,params,golden,src,tbd)
on conflict (process_definition_id, code) do update set
  label_template   = excluded.label_template,
  rel_day          = excluded.rel_day,
  seq              = excluded.seq,
  scope            = excluded.scope,
  cardinality_rule = excluded.cardinality_rule,
  responsible_role = excluded.responsible_role,
  lab_parameters   = excluded.lab_parameters,
  golden_rule      = excluded.golden_rule,
  source_ref       = excluded.source_ref,
  tbd_marker       = excluded.tbd_marker;

-- The fields each lab check records, with their bands from S4a where a band exists.
-- Where no source gives one, the bound stays null and the source cites the absence.
insert into public.activity_field
  (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
   sop_source_ref, conflict_id, operator_input, section, display_order)
select public._pa(f.code), f.key, f.label, 'numeric', f.unit, f.sop, f.lo, f.hi,
       f.src, f.conflict, 'required', 'Lab', f.ord
from (values
  ('LAB-FIB-MOISTURE-1','moisture_pct','Moisture','%','68–69 (S1a) / 75–78 (S4a)',null,null,
   'S1a 0A and S4a Table 2 disagree','C-01',10),
  ('LAB-FIB-MOISTURE-2','moisture_pct','Moisture','%','68–69 (S1a) / 75–78 (S4a)',null,null,
   'S1a 0A and S4a Table 2 disagree','C-01',10),
  ('LAB-LAGOON-1','ph','pH','pH','6.5–7.5',6.5,7.5,'S4a Table 2',null,10),
  ('LAB-LAGOON-1','ec','EC','mS/cm','< 1.5',null,1.5,'S1a 1C-A',null,20),
  ('LAB-LAGOON-1','tds','TDS','ppm','derived: EC × 0.64',null,null,'S4a — computed',null,30),
  ('LAB-LAGOON-2','ph','pH','pH','6.5–7.5',6.5,7.5,'S4a Table 2',null,10),
  ('LAB-LAGOON-2','ec','EC','mS/cm','< 1.5',null,1.5,'S1a 1C-A',null,20),
  ('LAB-LAGOON-3','ph','pH','pH','6.5–7.5',6.5,7.5,'S4a Table 2',null,10),
  ('LAB-LAGOON-3','ec','EC','mS/cm','< 1.5',null,1.5,'S1a 1C-A',null,20),
  ('LAB-BUNK-FILL','ph','pH','pH','8.1–8.4',8.1,8.4,'S4a Table 2','C-07',10),
  ('LAB-BUNK-FILL','moisture_pct','Moisture','%','74–77',74,77,'S4a Table 2',null,20),
  ('LAB-BUNK-FILL','ash_pct','Ash','%','16–20',16,20,'S4a Table 2',null,30),
  ('LAB-BUNK-FILL','n_pct','Nitrogen','%','1.3–1.6',1.3,1.6,'S4a Table 2','C-06',40),
  ('LAB-BUNK-FILL','ec','EC','mS/cm',null,null,null,
   'No source gives a compost EC band','TBD-13',50),
  ('LAB-BUNK-FILL','cn_ratio','C:N',':1','25–32 · derived',25,32,'S4a Table 2',null,60),
  ('LAB-BUNK-RELOAD','ph','pH','pH','7.8–8.0',7.8,8.0,'S4a Table 2','C-07',10),
  ('LAB-BUNK-RELOAD','moisture_pct','Moisture','%','75–76.5',75,76.5,'S4a Table 2',null,20),
  ('LAB-BUNK-RELOAD','ash_pct','Ash','%','19–23',19,23,'S4a Table 2',null,30),
  ('LAB-BUNK-RELOAD','n_pct','Nitrogen','%','1.4–1.7',1.4,1.7,'S4a Table 2',null,40),
  ('LAB-BUNK-RELOAD','cn_ratio','C:N',':1','22–28 · derived',22,28,'S4a Table 2',null,50),
  ('LAB-TUNNEL-LOAD','ph','pH','pH','7.6–7.8',7.6,7.8,'S4a Table 2',null,10),
  ('LAB-TUNNEL-LOAD','moisture_pct','Moisture','%','72.5–74',72.5,74,'S4a Table 2',null,20),
  ('LAB-TUNNEL-LOAD','ash_pct','Ash','%','23–26',23,26,'S4a Table 2',null,30),
  ('LAB-TUNNEL-LOAD','n_pct','Nitrogen','%','1.6–1.9',1.6,1.9,'S4a Table 2',null,40),
  ('LAB-TUNNEL-LOAD','cn_ratio','C:N',':1','19–24 · derived',19,24,'S4a Table 2',null,50),
  ('LAB-COMPOST-OUT','moisture_pct','Final moisture','%','65–68',65,68,'S4a Table 2','C-16',10),
  ('LAB-COMPOST-OUT','n_pct','Nitrogen','%',null,null,null,'S3f §4 — recorded',null,20),
  ('LAB-COMPOST-OUT','ph','pH','pH',null,null,null,'S3f §4 — recorded',null,30),
  ('LAB-COMPOST-OUT','ec','EC','mS/cm',null,null,null,
   'S1a P2D gives EC > 2.5, contradicted by every record','C-15',40)
) as f(code,key,label,unit,sop,lo,hi,src,conflict,ord)
where public._pa(f.code) is not null
on conflict (process_activity_id, key) do update set
  sop_value = excluded.sop_value, sop_min = excluded.sop_min, sop_max = excluded.sop_max,
  sop_source_ref = excluded.sop_source_ref, conflict_id = excluded.conflict_id;

-- Colour and actinomycetes are enumerated values with mandatory photos, not free text.
insert into public.evidence_requirement
  (process_activity_id, key, label, media_kinds, min_count, gates_submission, capture_hint, ordering)
values
  (public._pa('LAB-COMPOST-OUT'),'colour','Photo of compost colour','{photo}',1,true,
   'Grey brown or dark chocolate — show it in daylight',10),
  (public._pa('LAB-COMPOST-OUT'),'actinomycetes','Photo of actinomycetes','{photo}',1,true,
   'Show the white patches',20)
on conflict (process_activity_id, key) do update set label = excluded.label;

-- A lab check gates the activity that depends on its result.
insert into public.gate_rule
  (process_activity_id, phase, kind, config, predecessor_binding,
   blocked_reason_template, mapping_confidence, conflict_id, ordering)
select public._pa(g.code), 'entry', 'PREDECESSOR',
       json_build_object('activity_codes', json_build_array(g.pred))::jsonb,
       g.binding, g.reason, 'dictated', g.conflict, 5
from (values
  ('FIB1-HOP-2','LAB-FIB-MOISTURE-1','ALL_INSTANCES',
   'Waiting on the lab — the moisture result decides water or dry','C-29'),
  ('FIB1-HOP-3','LAB-FIB-MOISTURE-2','ALL_INSTANCES',
   'Waiting on the lab — the moisture result decides water or dry','C-29'),
  ('P1-BUNK-RELOAD','LAB-BUNK-FILL','SAME_SCOPE_INSTANCE',
   'Waiting on the lab — bunker fill panel not reported for {scope_label}',null),
  ('TN-LOAD','LAB-BUNK-RELOAD','ALL_INSTANCES',
   'Waiting on the lab — reload panel not reported for every line',null)
) as g(code,pred,binding,reason,conflict)
where public._pa(g.code) is not null and public._pa(g.pred) is not null;
