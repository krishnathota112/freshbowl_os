-- s02 · Materials, material-role eligibility, specs, locations, machines.
-- docs/STEP_1_2_BUILD_SPEC.md §2.1–§2.2

insert into public.material (code, name, category, is_nitrogen_source) values
  ('PADDY_LOCAL',       'Paddy Straw (local)',  'straw',    false),
  ('PADDY_PUNJAB',      'Paddy Straw (Punjab)', 'straw',    false),
  ('BAGASSE_NEW',       'Bagasse (new)',        'fibre',    false),
  ('BAGASSE_OLD',       'Bagasse (old)',        'fibre',    false),
  ('WHEAT_STRAW',       'Wheat Straw',          'straw',    false),
  ('MUSTARD_STRAW',     'Mustard Straw',        'straw',    false),
  ('CHICKEN_MANURE',    'Chicken Manure',       'manure',   true),
  ('GYPSUM',            'Gypsum',               'mineral',  false),
  ('AMMONIUM_SULPHATE', 'Ammonium Sulphate',    'mineral',  true),
  ('LIME',              'Lime',                 'additive', false),
  ('UREA',              'Urea',                 'additive', true)
on conflict (code) do update set name = excluded.name, category = excluded.category;

-- Which materials MAY fill which role. docs/ADMIN_CONFIGURABILITY_MODEL.md §2.
-- The role split is not invented: S1c explains that paddy absorbs on contact while
-- wheat and mustard are waxy, which is why they cannot share a stream.
insert into public.material_role_eligibility (role, material_id, is_default_lead, tbd_marker)
select r.role::material_role_code, m.id, r.lead, r.tbd
from (values
  ('PRIMARY_FIBRE',    'BAGASSE_NEW',       true,  null),
  ('PRIMARY_FIBRE',    'BAGASSE_OLD',       false, null),
  ('PRIMARY_FIBRE',    'MUSTARD_STRAW',     false, null),
  ('PRIMARY_FIBRE',    'WHEAT_STRAW',       false, null),
  ('SECONDARY_FIBRE',  'WHEAT_STRAW',       false, 'TBD-39'),
  ('SECONDARY_FIBRE',  'MUSTARD_STRAW',     false, 'TBD-39'),
  ('STRUCTURAL_STRAW', 'PADDY_PUNJAB',      true,  'TBD-40'),
  ('STRUCTURAL_STRAW', 'PADDY_LOCAL',       false, 'TBD-40'),
  ('NITROGEN_SOURCE',  'CHICKEN_MANURE',    true,  null),
  ('NITROGEN_SOURCE',  'UREA',              false, null),
  ('MINERAL',          'GYPSUM',            true,  null),
  ('MINERAL',          'AMMONIUM_SULPHATE', false, null),
  ('MINERAL',          'LIME',              false, null),
  ('PH_CORRECTOR',     'LIME',              false, null)
) as r(role, mcode, lead, tbd)
join public.material m on m.code = r.mcode
on conflict (role, material_id) do update set
  is_default_lead = excluded.is_default_lead, tbd_marker = excluded.tbd_marker;

-- Raw-material acceptance ranges — S4a Table 1, verbatim.
-- Real incoming assays already sit outside these (S3f paddy pH 6.49 against 7.0–7.3),
-- which is the point: the gate flags real lots.
insert into public.material_spec (material_id, parameter, min_value, max_value, unit, source_ref)
select m.id, s.parameter, s.min_value, s.max_value, s.unit, 'S4a Table 1'
from (values
  ('PADDY_PUNJAB','moisture_pct',12,13,'%'), ('PADDY_PUNJAB','ph',7.0,7.3,'pH'),
  ('PADDY_PUNJAB','ash_pct',12,17,'%'), ('PADDY_PUNJAB','n_pct',0.7,1.0,'%'),
  ('PADDY_PUNJAB','cn_ratio',60,70,':1'),
  ('PADDY_LOCAL','moisture_pct',12,13,'%'), ('PADDY_LOCAL','ph',7.0,7.3,'pH'),
  ('PADDY_LOCAL','ash_pct',12,17,'%'), ('PADDY_LOCAL','n_pct',0.7,1.0,'%'),
  ('PADDY_LOCAL','cn_ratio',60,70,':1'),
  ('MUSTARD_STRAW','moisture_pct',7.5,8,'%'), ('MUSTARD_STRAW','ash_pct',6,8,'%'),
  ('MUSTARD_STRAW','n_pct',0.5,0.9,'%'), ('MUSTARD_STRAW','cn_ratio',51,60,':1'),
  ('BAGASSE_NEW','moisture_pct',40,55,'%'), ('BAGASSE_NEW','ph',4.6,5.0,'pH'),
  ('BAGASSE_NEW','ash_pct',2,5,'%'), ('BAGASSE_NEW','n_pct',0.4,0.5,'%'),
  ('BAGASSE_NEW','cn_ratio',97,98,':1'),
  ('BAGASSE_OLD','moisture_pct',40,55,'%'), ('BAGASSE_OLD','ph',4.6,5.0,'pH'),
  ('BAGASSE_OLD','ash_pct',2,5,'%'), ('BAGASSE_OLD','n_pct',0.4,0.5,'%'),
  ('CHICKEN_MANURE','moisture_pct',16,20,'%'), ('CHICKEN_MANURE','ph',7.5,8.0,'pH'),
  ('CHICKEN_MANURE','ash_pct',25,33,'%'), ('CHICKEN_MANURE','n_pct',2.7,3.5,'%'),
  ('CHICKEN_MANURE','cn_ratio',11,15,':1'),
  ('GYPSUM','moisture_pct',25,30,'%'), ('GYPSUM','ph',2.8,3.5,'pH'),
  ('GYPSUM','ash_pct',85,88,'%'),
  ('UREA','n_pct',46,46,'%'),
  ('AMMONIUM_SULPHATE','n_pct',20.6,20.6,'%')
) as s(mcode, parameter, min_value, max_value, unit)
join public.material m on m.code = s.mcode
on conflict (material_id, parameter) do update set
  min_value = excluded.min_value, max_value = excluded.max_value;

-- Bunkers 1–11 and tunnels 1–12 — the range S7a shows in real rotation.
insert into public.location (kind, code, label, is_persistent, is_exclusive)
select 'BUNKER', 'BUNKER-' || lpad(n::text,2,'0'), 'Bunker ' || n, true, true
from generate_series(1,11) n
on conflict (code) do nothing;

insert into public.location (kind, code, label, max_fill_height_m, is_persistent, is_exclusive)
select 'TUNNEL', 'TUNNEL-' || lpad(n::text,2,'0'), 'Tunnel ' || n, 2.2, true, true
from generate_series(1,12) n
on conflict (code) do nothing;

insert into public.location (kind, code, label, is_persistent, is_exclusive) values
  ('YARD','YARD-A','Yard A', true, false),          -- TBD-27: no finite bays modelled
  ('SOAK_PIT','LAGOON-01','Lagoon 1', true, true),
  ('HOPPER','HOPPER-LOC','Hopper line', true, false)
on conflict (code) do nothing;

-- Fleet. TBD-33: real size unconfirmed. TWO turners are required — T1 runs on one while
-- T2 runs on another, per pile. With one turner the parallelism is impossible.
insert into public.machine (code, name, kind, meters_hours, tbd_marker) values
  ('JCB-01','JCB Loader 01','LOADER_JCB',true,'TBD-33'),
  ('JCB-02','JCB Loader 02','LOADER_JCB',true,'TBD-33'),
  ('TURNER-01','Turner 01','TURNER',true,'TBD-33'),
  ('TURNER-02','Turner 02','TURNER',true,'TBD-33'),
  ('HOPPER-01','Hopper 01','HOPPER',false,'TBD-33'),
  ('ROTAVATOR-01','Rotavator 01','ROTAVATOR',false,'TBD-33'),
  ('CONVEYOR-01','Conveyor 01','CONVEYOR',false,'TBD-33'),
  ('TRUCK-01','Truck 01','VEHICLE_TRUCK',false,'TBD-33'),
  ('TRUCK-02','Truck 02','VEHICLE_TRUCK',false,'TBD-33'),
  ('TRUCK-03','Truck 03','VEHICLE_TRUCK',false,'TBD-33'),
  ('TRUCK-04','Truck 04','VEHICLE_TRUCK',false,'TBD-33')
on conflict (code) do update set name = excluded.name, kind = excluded.kind;
