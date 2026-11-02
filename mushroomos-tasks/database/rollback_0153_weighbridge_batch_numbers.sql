-- Rollback for 0153_weighbridge_batch_numbers.sql → back to 0151 (requirements tied to Tasks batches).
-- Refuses if any requirement was made against typed batch numbers only (it would have no Tasks batch to go back to).
do $$ begin
  if exists (select 1 from public.wb_requirement where batch_id is null) then
    raise exception 'Some requirements have no Tasks batch (made after 0153). Cancel them first; nothing was changed.';
  end if;
end $$;
drop view if exists public.wb_v_requirement, public.wb_v_slip, public.wb_v_alert, public.wb_v_batch;
drop function if exists public.wb_batch_create(text, text, jsonb), public.wb_requirement_add(uuid, text, numeric, numeric, text),
  public.wb_batch_update(uuid, text, text), public.wb_batch_set_calc_slip(uuid, text), public.wb_batch_close(uuid, text),
  public.wb_batch_reopen(uuid, text), public.wb_label(uuid);
alter table public.wb_requirement drop constraint if exists wb_requirement_batch_material;
alter table public.wb_requirement alter column batch_id set not null;
alter table public.wb_requirement add constraint wb_requirement_batch_id_material_code_key unique (batch_id, material_code);
alter table public.wb_requirement drop column wb_batch_id;
alter table public.wb_slip drop column if exists entry_seq;
drop table public.wb_batch;
-- Then re-run 0151_weighbridge.sql: it restores wb_requirement_create, the 0151 helpers, storage policies, the
-- tk_batch read rule for the weighbridge login and the 0151 views (create or replace / if not exists throughout).
