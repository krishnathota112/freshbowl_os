drop function if exists public.tk_batch_create_plan(text, uuid, timestamptz, text, jsonb);
-- Retain the template if any batch references it, including later edited versions.
delete from public.tk_sop s where s.id = '14600000-0000-4000-8000-000000000001'
and not exists (select 1 from public.tk_batch b where b.sop_id = s.id);
notify pgrst, 'reload schema';
