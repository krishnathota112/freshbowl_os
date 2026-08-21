-- s05 · Six-column field definitions for PROCESS-2026B, plus ROUTE-2026A as archived
-- SOP reference and the C-28 mapping classification.

-- ─────────────────────────────────────────────────────────────────────────────
-- PROCESS-2026B activity fields — the six columns.
-- Where no source gives a bound, sop_min/sop_max stay NULL and sop_source_ref cites the
-- ABSENCE. docs/KIRO_BUILD_INSTRUCTIONS.md §1 item 6 — never invent a threshold.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.activity_field
  (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
   sop_source_ref, conflict_id, day0_required, default_variance, operator_input,
   section, display_order)
select public._pa(f.code), f.key, f.label, f.datatype, f.unit, f.sop_value,
       f.sop_min, f.sop_max, f.source_ref, f.conflict, f.required, f.variance,
       f.op_input, f.section, f.display_order
from (values
  -- Weighment: per-load quantity. No SOP bound — the walkthrough gives a target, not a limit.
  ('FIB1-WEIGH','target_qty_mt','Target quantity','numeric','MT',null,null,null,
   'W §2 — no SOP bound for a single load',null,true,null,'required','Weighment',10),
  ('FIB1-WEIGH','actual_qty_mt','Actual quantity','numeric','MT',null,null,null,
   'W §2 — recorded, no bound',null,false,null,'required','Weighment',20),

  -- The disputed one. BOTH bands are carried; neither is chosen. C-01 escalated to C-29
  -- because it now selects which physical operation the operator performs.
  ('FIB1-HOP-1','moisture_pct','Moisture after pass','numeric','%','68–69 (S1a) / 75–78 (S4a)',
   null,null,'S1a 0A and S4a Table 2 disagree — see C-01','C-01',false,'± 1 %','required','Wetting',10),
  ('FIB1-HOP-1','water_qty_l','Water added','numeric','L',null,null,null,
   'W §3.1 — recorded, no bound',null,false,null,'required','Wetting',20),
  ('FIB1-HOP-2','moisture_pct','Measured moisture','numeric','%','68–69 (S1a) / 75–78 (S4a)',
   null,null,'S1a 0A and S4a Table 2 disagree — see C-01','C-01',false,'± 1 %','required','Wetting',10),
  ('FIB1-HOP-2','variant_reason','Reason for variant choice','text',null,null,null,null,
   'W §3.2 — mandatory while C-29 is open','C-29',false,null,'required','Wetting',20),
  ('FIB1-HOP-3','moisture_pct','Measured moisture','numeric','%','68–69 (S1a) / 75–78 (S4a)',
   null,null,'S1a 0A and S4a Table 2 disagree — see C-01','C-01',false,'± 1 %','required','Reloading',10),

  -- Bunker fill height: an unambiguous SOP mapping (sop_direct). S3f's 2.9 m against a
  -- 2.7 m max is exactly the kind of thing this gate exists to catch.
  ('FIB1-BUNK-LOAD','fill_height_m','Fill height','numeric','m','2.6–2.7 (max 2.8)',2.6,2.7,
   'S1a 0B',null,true,'± 0.1 m','required','Bunker',10),
  ('FIB1-BUNK-LOAD','bunker_id','Bunker','text',null,null,null,null,
   'W §3.3',null,true,null,'required','Bunker',20),
  ('FIB1-BUNK-RELOAD','bunker_id','Destination bunker','text',null,null,null,null,
   'W §5.3 — must differ from source',null,true,null,'required','Bunker',10),
  ('STRAW-BUNK-STORE','bunker_id','Bunker','text',null,null,null,null,
   'W §6.4 — mandatory field','C-24',true,null,'required','Straw',10),

  -- Rest durations: NO default. The factory never stated the hours.
  ('FIB1-REST-1','rest_duration_hr','Required rest','duration','h',null,null,null,
   'W §4 — duration not specified by the factory','TBD-21',true,null,'not_collected','Rest',10),
  ('P1-REST-1','rest_duration_hr','Required rest','duration','h',null,null,null,
   'W §11 — duration not specified by the factory','TBD-21',true,null,'not_collected','Rest',10),
  ('P1-REST-2','rest_duration_hr','Required rest','duration','h',null,null,null,
   'W §13 — duration not specified by the factory','TBD-21',true,null,'not_collected','Rest',10),
  ('STRAW-REST-1','rest_duration_hr','Required rest','duration','h',null,null,null,
   'W §6.4 — dictation ambiguous between 2 h and 12 h','TBD-24',true,null,'not_collected','Rest',10),

  ('NMIX-ROTAVATE','required_qty_mt','Required quantity','numeric','MT',null,null,null,
   'W §7.1',null,true,null,'required','Mixing',10),
  ('NMIX-ROTAVATE','actual_qty_mt','Actual quantity','numeric','MT',null,null,null,
   'W §7.1',null,false,null,'required','Mixing',20),
  ('NMIX-ROTAVATE','temp_c','Mix temperature','numeric','°C','< 45',null,45,
   'S1a 1A',null,false,null,'optional','Mixing',30),

  -- T2 moisture: another unambiguous SOP mapping.
  ('TR-T2','moisture_pct','Moisture after T2','numeric','%','73–75',73,75,
   'S1a P1B',null,false,'± 1 %','required','Turner',10),

  ('P1-BUNK-LOAD','fill_height_m','Fill height','numeric','m','2.6–2.7',2.6,2.7,
   'S1a P1C',null,true,'± 0.1 m','required','Bunker',10),

  -- Tunnel fill height. S3f names 2.25 m against a 2.2 m maximum as a root cause of a
  -- failed batch. This is a protected gate.
  ('TN-LOAD','fill_height_m','Fill height','numeric','m','1.8–2.2',1.8,2.2,
   'S1a P2B',null,true,null,'required','Tunnel',10),
  ('TN-LOAD','moisture_pct','Moisture at loading','numeric','%','73–74',73,74,
   'S1a P2B',null,false,'± 0.5 %','required','Tunnel',20),
  ('TN-LOAD','compost_qty_mt','Compost quantity','numeric','MT',null,null,null,
   'W §14',null,true,null,'required','Tunnel',30),

  ('TN-UNLOAD','moisture_pct','Final moisture','numeric','%','65–68',65,68,
   'S4a Table 2; S1a P2D says 65–66','C-16',false,null,'required','Tunnel',10),
  ('TN-UNLOAD','temp_c','Unload temperature','numeric','°C','24 (22–26 acceptable)',22,26,
   'S1a P2D lists both 22 and 24','C-17',false,null,'required','Tunnel',20),
  -- Recording-only: not one tunnel in any record reaches the SOP's 2.5 trigger.
  ('TN-UNLOAD','ec','EC','numeric','mS/cm',null,null,null,
   'S1a P2D gives EC > 2.5, contradicted by every record','C-15',false,null,'required','Tunnel',30)
) as f(code, key, label, datatype, unit, sop_value, sop_min, sop_max, source_ref, conflict,
       required, variance, op_input, section, display_order)
where public._pa(f.code) is not null
on conflict (process_activity_id, key) do update set
  label = excluded.label, sop_value = excluded.sop_value,
  sop_min = excluded.sop_min, sop_max = excluded.sop_max,
  sop_source_ref = excluded.sop_source_ref, conflict_id = excluded.conflict_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROUTE-2026A — the 17 SOP stages, ARCHIVED. Never executable.
-- It exists so the ~110 process-control limits stay queryable and citable, and so the
-- C-28 mapping report has a left-hand side.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.process_definition
  (code, name, version, status, source_ref, anchor_day_label, total_days)
values ('ROUTE-2026A','SOP 17-stage reference',1,'archived',
        'S1a flow diagrams + S1c + S4a','Day 0 = Mixing',19)
on conflict (code, version) do update set status = 'archived';

with pd as (select id from public.process_definition where code='ROUTE-2026A' and version=1)
insert into public.process_activity
  (process_definition_id, code, label_template, stream, rel_day, seq, scope,
   cardinality_rule, golden_rule, source_ref)
select pd.id, s.code, s.label, s.stream::stream_code, s.rel_day, s.seq, s.scope::activity_scope,
       '{"kind":"SINGLETON"}'::jsonb, s.golden, 'S1a'
from pd, (values
  ('SOP-0A','Pre-wet and rest','PRIMARY_FIBRE',-7,10,'MASTER','Stage-0A mixing is hydration, not aeration.'),
  ('SOP-0B','1st bunker filling and conditioning','PRIMARY_FIBRE',-6,20,'BUNKER_LINE','Stage-0B decides compost breathability for the next 20 days.'),
  ('SOP-0C','Unloading and re-loading','PRIMARY_FIBRE',-3,30,'BUNKER_LINE',null),
  ('SOP-0D','2nd bunker re-filling and conditioning','PRIMARY_FIBRE',-3,40,'BUNKER_LINE',null),
  ('SOP-1A','Manure and minerals dry mix','NITROGEN_MINERAL',0,50,'MASTER',null),
  ('SOP-1B','Conditioned fibre and dry nitrogen mixing','YARD',0,60,'MASTER',null),
  ('SOP-1CA','Straw preparation','STRUCTURAL_STRAW',-1,70,'MASTER',null),
  ('SOP-1CB','Straw, fibre and mineral mixing','YARD',1,80,'MASTER',null),
  ('SOP-P1A','T0 and T1 continuous, no gap','YARD',2,90,'MASTER',null),
  ('SOP-P1B','T2 composting','YARD',4,100,'MASTER',null),
  ('SOP-P1C','Bunker filling 1','BUNKER',4,110,'BUNKER_LINE',null),
  ('SOP-P1DA','Unload and reload 1','BUNKER',5,120,'BUNKER_LINE',null),
  ('SOP-P1DB','Unload and reload 2','BUNKER',6,130,'BUNKER_LINE',null),
  ('SOP-P2A','Tunnel preparation','TUNNEL',8,140,'TUNNEL',null),
  ('SOP-P2B','Tunnel filling','TUNNEL',8,150,'INDIVIDUAL_BATCH',null),
  ('SOP-P2C','Tunnel process','TUNNEL',8,160,'INDIVIDUAL_BATCH',null),
  ('SOP-P2D','Tunnel unloading','TUNNEL',14,170,'INDIVIDUAL_BATCH',null)
) as s(code,label,stream,rel_day,seq,scope,golden)
on conflict (process_definition_id, code) do update set label_template = excluded.label_template;

-- The SOP limits themselves.
insert into public.activity_field
  (process_activity_id, key, label, datatype, unit, sop_value, sop_min, sop_max,
   sop_source_ref, conflict_id, operator_input, display_order)
select pa.id, f.key, f.label, f.datatype, f.unit, f.sop_value, f.sop_min, f.sop_max,
       f.source_ref, f.conflict, 'not_collected', f.display_order
from (values
  ('SOP-0A','moisture_pct','Target moisture','numeric','%','68–69',68,69,'S1a 0A','C-01',10),
  ('SOP-0A','heap_height_m','Heap height','numeric','m','<= 1.5',null,1.5,'S1a 0A',null,20),
  ('SOP-0A','rest_hr','Rest','duration','h','8–12',8,12,'S1a 0A',null,30),
  ('SOP-0B','fill_height_m','Fill height','numeric','m','2.6–2.7 (max 2.8)',2.6,2.7,'S1a 0B',null,10),
  ('SOP-0B','conditioning_hr','Conditioning','duration','h','48–60',48,60,'S1a 0B',null,20),
  ('SOP-0B','temp_c','Temperature rise','numeric','°C','45–55 (max 58)',45,55,'S1a 0B',null,30),
  ('SOP-0C','reload_fill_height_m','Reload fill height','numeric','m','2.2–2.4 (max 2.5)',2.2,2.4,'S1a 0C',null,10),
  ('SOP-0D','conditioning_hr','Conditioning','duration','h','36–40',36,40,'S1a 0D',null,10),
  ('SOP-0D','temp_c','Temperature','numeric','°C','50–55 declining (max 58)',50,55,'S1a 0D',null,20),
  ('SOP-1A','temp_c','Mix temperature','numeric','°C','< 45',null,45,'S1a 1A',null,10),
  ('SOP-1B','moisture_pct','Target moisture','numeric','%','73',null,73,'S1a 1B',null,10),
  ('SOP-1CA','lagoon_ec','Lagoon EC','numeric','mS/cm','< 1.5',null,1.5,'S1a 1C-A',null,10),
  ('SOP-1CA','lagoon_ph','Lagoon pH','numeric','pH','7.0',6.5,7.5,'S1a 1C-A',null,20),
  ('SOP-1CA','soak_hr','Soak and tilt 1','duration','h','2–3',2,3,'S1a 1C-A','C-23',30),
  ('SOP-P1A','moisture_pct','Input moisture','numeric','%','73–74',73,74,'S1a P1A',null,10),
  ('SOP-P1A','t0_t2_gap_hr','T0 to T2 gap','duration','h','>= 24',24,null,'S1a P1A',null,20),
  ('SOP-P1B','moisture_pct','Moisture after T2','numeric','%','73–75',73,75,'S1a P1B',null,10),
  ('SOP-P1C','fill_height_m','Fill height','numeric','m','2.6–2.7',2.6,2.7,'S1a P1C',null,10),
  ('SOP-P1C','temp_c','Thermophilic phase','numeric','°C','68–72',68,72,'S1a P1C',null,20),
  ('SOP-P1C','hold_hr','Hold','duration','h','26–28',26,28,'S1a P1C',null,30),
  ('SOP-P1DA','fill_height_m','Reload fill height','numeric','m','2.5–2.6',2.5,2.6,'S1a P1D-A',null,10),
  ('SOP-P1DA','hold_hr','Hold','duration','h','28–30',28,30,'S1a P1D-A',null,20),
  ('SOP-P1DB','fill_height_m','Reload fill height','numeric','m','2.4–2.5',2.4,2.5,'S1a P1D-B','C-25',10),
  ('SOP-P1DB','hold_hr','Hold','duration','h','40–44',40,44,'S1a P1D-B','C-25',20),
  ('SOP-P2B','fill_height_m','Fill height','numeric','m','1.8–2.2',1.8,2.2,'S1a P2B',null,10),
  ('SOP-P2B','moisture_pct','Entry moisture','numeric','%','73–74',73,74,'S1a P2B',null,20),
  ('SOP-P2C','pasteurisation_temp_c','Pasteurisation','numeric','°C','58–60',58,60,'S1a P2C',null,10),
  ('SOP-P2C','pasteurisation_hr','Pasteurisation hold','duration','h','8–10',8,10,'S1a P2C',null,20),
  ('SOP-P2C','conditioning2_hr','Conditioning-2','duration','h','75–90',75,90,'S1a P2C / S2a','C-05',30),
  ('SOP-P2D','moisture_pct','Unload moisture','numeric','%','65–66',65,66,'S1a P2D','C-16',10),
  ('SOP-P2D','temp_c','Unload temperature','numeric','°C','22',null,22,'S1a P2D','C-17',20),
  ('SOP-P2D','ec','Unload EC','numeric','mS/cm','> 2.5',2.5,null,'S1a P2D','C-15',30)
) as f(pcode,key,label,datatype,unit,sop_value,sop_min,sop_max,source_ref,conflict,display_order)
join public.process_activity pa on pa.code = f.pcode
join public.process_definition pd on pd.id = pa.process_definition_id and pd.code='ROUTE-2026A'
on conflict (process_activity_id, key) do update set
  sop_min = excluded.sop_min, sop_max = excluded.sop_max, conflict_id = excluded.conflict_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-28 · map the SOP limits onto PROCESS-2026B activities.
--
-- Only three mappings are unambiguous enough to ENABLE. Everything else loads DISABLED
-- and appears in the review report. This is the largest reconciliation surface in the
-- build and it must be reviewed rather than assumed.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.gate_rule
  (process_activity_id, phase, kind, config, blocked_reason_template,
   mapping_confidence, is_enabled, conflict_id, ordering)
values
  -- sop_direct · ENABLED
  (public._pa('TN-LOAD'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"fill_height_m","sop_field_ref":"SOP-P2B.fill_height_m"}'::jsonb,
   'Blocked — fill height {actual} m outside {min}–{max} m on {scope_label}',
   'sop_direct', true, null, 40),
  (public._pa('P1-BUNK-LOAD'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"fill_height_m","sop_field_ref":"SOP-P1C.fill_height_m"}'::jsonb,
   'Blocked — fill height {actual} m outside {min}–{max} m on {scope_label}',
   'sop_direct', true, null, 40),
  (public._pa('TR-T2'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"moisture_pct","sop_field_ref":"SOP-P1B.moisture_pct"}'::jsonb,
   'Blocked — moisture {actual} % outside {min}–{max} % on {scope_label}',
   'sop_direct', true, null, 40),

  -- sop_inferred · DISABLED pending review
  (public._pa('FIB1-BUNK-LOAD'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"fill_height_m","sop_field_ref":"SOP-0B.fill_height_m"}'::jsonb,
   'Blocked — fill height {actual} m outside {min}–{max} m on {scope_label}',
   'sop_inferred', false, 'C-28', 40),
  (public._pa('FIB1-HOP-1'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"moisture_pct","sop_field_ref":"SOP-0A.moisture_pct"}'::jsonb,
   'Blocked — moisture {actual} % outside {min}–{max} %',
   'sop_inferred', false, 'C-28', 40),
  (public._pa('FIB1-BUNK-RELOAD'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"fill_height_m","sop_field_ref":"SOP-0C.reload_fill_height_m"}'::jsonb,
   'Blocked — reload fill height {actual} m outside {min}–{max} m',
   'sop_inferred', false, 'C-28', 40),
  (public._pa('FIB1-REST-1'), 'exit', 'EITHER_OR',
   '{"sub":[{"kind":"SENSOR_THRESHOLD","parameter":"compost_temp_c","operator":">=","value":58},
            {"kind":"ELAPSED_TIME","hours":60}],"sop_field_ref":"SOP-0B.conditioning_hr"}'::jsonb,
   'Waiting — bunker at {actual} °C, unload needs >= 58 °C or 60 h ({elapsed} h elapsed)',
   'sop_inferred', false, 'C-22', 50),
  (public._pa('TN-UNLOAD'), 'exit', 'FIELD_IN_RANGE',
   '{"field_key":"moisture_pct","sop_field_ref":"SOP-P2D.moisture_pct"}'::jsonb,
   'Blocked — final moisture {actual} % outside {min}–{max} %',
   'sop_inferred', false, 'C-16', 40),
  (public._pa('STRAW-SOAK-1'), 'exit', 'ELAPSED_TIME',
   '{"hours":2,"sop_field_ref":"SOP-1CA.soak_hr"}'::jsonb,
   'Waiting — soak duration; SOP says 2–3 h, the walkthrough says 8–10 h',
   'sop_inferred', false, 'C-23', 50),
  (public._pa('TN-HOLD'), 'exit', 'SENSOR_THRESHOLD',
   '{"parameter":"pasteurisation_temp_c","operator":">=","value":58,
     "sop_field_ref":"SOP-P2C.pasteurisation_temp_c"}'::jsonb,
   'Blocked — pasteurisation not achieved: {actual} °C against 58–60 °C',
   'sop_inferred', false, 'C-27', 50);
