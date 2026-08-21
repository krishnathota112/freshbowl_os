-- s06 · Lab specifications, methods and Phase-2 control bands.
-- docs/LAB_MODEL.md §3–§4, S4a Tables 1–3, S1c.

-- Compost-phase acceptance ranges — S4a Table 2, verbatim.
-- The bagasse-wetting row (75–78 %) directly contradicts S1a's 68–69 % for the same
-- operation. Both are carried, neither is chosen. C-01.
insert into public.lab_spec
  (checkpoint_code, parameter_code, min_value, max_value, unit, source_ref, conflict_id)
values
  ('SOAK_PIT_WATER','ph',6.5,7.5,'pH','S4a Table 2',null),
  ('FIBRE_WETTING','moisture_pct',75,78,'%','S4a Table 2','C-01'),
  ('FIBRE_BUNKER_LOADING','moisture_pct',75,77,'%','S4a Table 2','C-01'),
  ('FIBRE_RELOADING','moisture_pct',75,76.5,'%','S4a Table 2','C-01'),
  ('TURNING_0_1','moisture_pct',72,74,'%','S4a Table 2',null),
  ('TURNING_2_BUNKER_LOADING','moisture_pct',74,77,'%','S4a Table 2',null),
  ('TURNING_2_BUNKER_LOADING','ph',8.1,8.4,'pH','S4a Table 2','C-07'),
  ('TURNING_2_BUNKER_LOADING','ash_pct',16,20,'%','S4a Table 2',null),
  ('TURNING_2_BUNKER_LOADING','n_pct',1.3,1.6,'%','S4a Table 2','C-06'),
  ('TURNING_2_BUNKER_LOADING','cn_ratio',25,32,':1','S4a Table 2',null),
  ('RELOADING','moisture_pct',75,76.5,'%','S4a Table 2',null),
  ('RELOADING','ph',7.8,8.0,'pH','S4a Table 2','C-07'),
  ('RELOADING','ash_pct',19,23,'%','S4a Table 2',null),
  ('RELOADING','n_pct',1.4,1.7,'%','S4a Table 2',null),
  ('RELOADING','cn_ratio',22,28,':1','S4a Table 2',null),
  ('TUNNEL_LOAD','moisture_pct',72.5,74,'%','S4a Table 2',null),
  ('TUNNEL_LOAD','ph',7.6,7.8,'pH','S4a Table 2',null),
  ('TUNNEL_LOAD','ash_pct',23,26,'%','S4a Table 2',null),
  ('TUNNEL_LOAD','n_pct',1.6,1.9,'%','S4a Table 2',null),
  ('TUNNEL_LOAD','cn_ratio',19,24,':1','S4a Table 2',null),
  ('GR_LOAD','moisture_pct',65,68,'%','S4a Table 2','C-16'),
  ('GR_LOAD','ph',7.4,7.7,'pH','S4a Table 2',null),
  ('GR_LOAD','ash_pct',25,29,'%','S4a Table 2',null),
  ('GR_LOAD','n_pct',1.8,2.2,'%','S4a Table 2',null),
  ('GR_LOAD','cn_ratio',16,20,':1','S4a Table 2',null),
  -- EC has NO band at any compost checkpoint in any source. Recorded, trended, never
  -- auto-failed. docs/LAB_MODEL.md §9, TBD-13.
  ('TUNNEL_LOAD','ec',null,null,'mS/cm','S4a gives no compost EC band — see TBD-13','TBD-13'),
  ('COMPOST_OUT','ec',null,null,'mS/cm','S4a gives no compost EC band — see TBD-13','TBD-13'),
  ('COMPOST_OUT','moisture_pct',65,68,'%','S4a Table 2','C-16'),
  -- Water types — S4a Table 3. Cooling tower EC is quoted in a different magnitude from
  -- every other row, so it is imported as-is and excluded from auto-verdict. C-09.
  ('WATER_BORE_WELL','ec',700,900,'µS/cm','S4a Table 3',null),
  ('WATER_MAINTENANCE','ec',700,900,'µS/cm','S4a Table 3',null),
  ('WATER_CHILLING_LINE','ec',700,900,'µS/cm','S4a Table 3',null),
  ('WATER_COOLING_TOWER','ec',4.2,6.5,'unit_uncertain','S4a Table 3 — magnitude differs from every other row','C-09'),
  ('WATER_SOFT','ec',700,900,'µS/cm','S4a Table 3',null),
  ('WATER_BOILER','ec',50,200,'µS/cm','S4a Table 3',null),
  ('WATER_COMPOST_RO','ec',50,200,'µS/cm','S4a Table 3',null),
  ('WATER_GROWING_RO','ec',50,200,'µS/cm','S4a Table 3',null),
  ('WATER_CANTEEN_RO','ec',50,200,'µS/cm','S4a Table 3',null)
on conflict (checkpoint_code, parameter_code) do update set
  min_value = excluded.min_value, max_value = excluded.max_value,
  conflict_id = excluded.conflict_id;

-- The eight methods. Three carry C-10: their calculations are transcription-damaged in the
-- source. A technician must never see a known-wrong procedure presented as authoritative.
insert into public.lab_method
  (code, name, apparatus, procedure_steps, calculation_formula, calibration_note,
   source_ref, conflict_id)
values
  ('MOISTURE','Moisture',
   '{beaker,"micro oven",desiccator,balance}',
   '{"Take 100 g of sample","Micro oven at 72 °C for 12–15 min","Cool in desiccator","Weigh"}',
   '(initial - dry) / initial x 100  [SOURCE INCOMPLETE — see C-10]',
   null,'S4a','C-10'),
  ('MOISTURE_SPAWN','Moisture (spawn)','{"hot air oven",balance}',
   '{"Take 50 g of sample","Hot air oven at 100 °C for 2 h","Weigh"}',
   '(initial - dry) / initial x 100',null,'S4a',null),
  ('PH','pH','{"pH meter",beaker,"glass rod"}',
   '{"10 g sample + 100 ml distilled water","Mix","Immerse probe","Read directly"}',
   'direct read','Calibrate DAILY with 7.0 buffer; set temperature to ambient','S4a',null),
  ('ASH','Ash','{crucible,"muffle furnace",desiccator,balance}',
   '{"Take 5 g of sample","Muffle furnace at 600 °C for 4 h","Cool in desiccator 30 min","Weigh"}',
   '(W3 - W1) / W2 x 100  [SOURCE GARBLED — see C-10]',
   null,'S4a','C-10'),
  ('NITROGEN','Nitrogen (Kjeldahl)',
   '{"block digestion system","distillation system",burette}',
   '{"Digest at 350–420 °C with 3 g catalyst and 10 ml H2SO4  [SOURCE SAYS 200 g SAMPLE — physically impossible, see C-10]","Distil with NaOH into boric acid with mixed indicator","Titrate with HCl"}',
   '14.01 x 0.1 x (titrate - blank) x 100 / sample weight',
   null,'S4a','C-10'),
  ('CN_RATIO','C:N ratio','{}','{"Computed — never entered by a technician"}',
   '(100 - Ash) x 0.5 / N',null,'S4a',null),
  ('EC','Electro-conductivity','{"EC meter",beaker}',
   '{"10 g sample + 100 ml distilled water","Read directly"}',
   'direct read','Calibrate WEEKLY','S4a',null),
  ('TDS','Total dissolved solids','{}','{"Computed — never entered by a technician"}',
   'EC x 0.64',null,'S4a',null),
  ('HARDNESS','Total hardness','{"hardness kit"}','{"Per kit procedure"}',
   'per kit',null,'S4a',null)
on conflict (code) do update set
  calculation_formula = excluded.calculation_formula, conflict_id = excluded.conflict_id;

-- phase2_control_band has no natural unique key; this file owns every row, so it clears
-- them before reinserting. Re-running the seed must be a no-op.
delete from public.phase2_control_band;

-- Phase-2 hour-banded control. S1c, seven bands.
-- FROZEN DECISION 5: retained, configuration-driven, visibly sourced. This is the
-- food-safety-equivalent content the walkthrough did not restate — dropping it would be
-- a serious regression (C-27).
insert into public.phase2_control_band
  (from_hr, to_hr, stage, probe, band_min, band_max, verdict, action, expected_outcome,
   source_ref, conflict_id)
values
  (0,14,'Levelling and conditioning-1','compost',null,47,'Low N, over-degraded in bunker','Decrease fan speed','Temperature recovers into band','S1c',null),
  (0,14,'Levelling and conditioning-1','compost',47,50,'Ideal','None','—','S1c',null),
  (0,14,'Levelling and conditioning-1','compost',51,null,'High N, under-degraded','Increase fan speed','Temperature falls into band','S1c',null),
  (15,28,'Heating-up','compost',58,60,'Ideal when reached in 10–12 h','None','—','S1c',null),
  (15,28,'Heating-up','compost',null,null,'Reached in under 10 h — low N or over-degradation','Decrease fan','Slower rise','S1c',null),
  (29,40,'Pasteurisation','compost',63,null,'Microbe loss leading to poor yield','Increase airflow','Temperature falls to 58–60','S1c',null),
  (29,40,'Pasteurisation','compost',58,60,'Ideal — fan at or above 75 %','None','—','S1c',null),
  (29,40,'Pasteurisation','compost',null,54,'Improper pasteurisation','Check fan, damper, Phase-1 duration, formulation','Corrected pasteurisation','S1c',null),
  (41,54,'Cooling-1','compost',51,58,'On programme, 58 to 51 over 14 h','None','—','S1c',null),
  (41,54,'Cooling-1','compost',58,null,'Less microbial multiplication','Increase airflow','Cooling resumes','S1c',null),
  (55,102,'Conditioning','plenum',42,null,'Plenum must never fall below 42','Reduce fresh air','Plenum recovers','S1c',null),
  (55,102,'Conditioning','compost',45,51,'On programme, 51 to 45 over 48 h','None','—','S1c','C-04'),
  (103,142,'Conditioning hold','compost',45,45,'Hold at 45 for 40 h','None','—','S1c','C-05'),
  (143,150,'Cooling-2','compost',24,26,'Ideal','None','Ready to transfer','S1c','C-17'),
  (143,150,'Cooling-2','compost',28,null,'Not ready to transfer','Increase airflow','Temperature falls below 28','S1c','C-17');
