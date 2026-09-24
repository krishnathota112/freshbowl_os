-- ─────────────────────────────────────────────────────────────────────────────
-- 0129 · PRE-H0 MATERIAL WEIGHTS (owner, 17 Sep 2026)
--
-- Batch Creation → Pre-H0 Material Entry gains a "Weights" section: Dry and Fresh weight (kg) for Urea,
-- Ash, Nitrogen, Gypsum, Bagasse, Paddy, Chicken Manure, Wheat, Mustard and Ammonium Sulphate.
-- They are saved exactly like Moisture / pH / Dry weight: readings on the batch's pre-H0 sample
-- (open_prebatch_sample → request_lab_test → record_lab_result), with who and when from the server.
-- DATA ONLY: 20 numeric parameters so each reading carries its label and its unit (kg).
-- No checkpoint's parameter list, spec, gate, validation or activation rule changes.
-- Rollback: db-rollback/pre_0129__prebatch_weights.sql
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.lab_parameter (code, label, value_kind, choices, unit, source_ref)
select 'wt_' || m.key || '_' || w.kind || '_kg',
       m.label || ' — ' || w.word || ' weight',
       'numeric', null, 'kg',
       'Owner request 17 Sep 2026 · Pre-H0 material weights (0129)'
  from (values ('urea', 'Urea'), ('ash', 'Ash'), ('nitrogen', 'Nitrogen'), ('gypsum', 'Gypsum'),
               ('bagasse', 'Bagasse'), ('paddy', 'Paddy'), ('chicken_manure', 'Chicken Manure'),
               ('wheat', 'Wheat'), ('mustard', 'Mustard'), ('ammonium_sulphate', 'Ammonium Sulphate')) as m(key, label)
 cross join (values ('dry', 'Dry'), ('fresh', 'Fresh')) as w(kind, word)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
