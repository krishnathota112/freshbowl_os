-- Rollback for 0158_weighment_main_app.sql: supervisors lose weighment access; the main-app link is dropped.
-- Slips supervisors already recorded stay (they are real weighments); only who may add more changes.
drop view if exists public.wb_v_batch;
drop function if exists public.wb_batch_create_for_master(uuid, text, jsonb), public.wb_match_master(text);
drop index if exists public.wb_batch_master_open;
alter table public.wb_batch drop column if exists master_batch_id;
-- Then re-apply the role lists and views exactly as they were: re-run 0153_weighbridge_batch_numbers.sql's view block
-- and 0157_weighment_material_units.sql (wb_v_requirement with weight_unit), and restore wb_add_slip / wb_finish /
-- the four *_read policies / weighments_insert / weighments_read with 'supervisor' removed from their role arrays.
