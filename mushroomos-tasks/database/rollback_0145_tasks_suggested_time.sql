-- Reverts 0145. This removes all saved suggested times; use only when that loss is intended.
drop view if exists public.tk_v_task_v2;
drop function if exists public.tk_task_edit_v2(uuid, jsonb);
drop function if exists public.tk_task_add_v2(uuid, uuid, jsonb);
drop function if exists public.tk_batch_create_v2(text, uuid, timestamptz, text);
drop function if exists public.tk_sop_new_version_v2(uuid);
drop function if exists public.tk_sop_save_v2(uuid, text, text, jsonb, timestamptz);
drop function if exists public.tk_sop_create_v2(text, text, jsonb, timestamptz);
drop function if exists public.tk_apply_sop_schedule(uuid, jsonb, timestamptz);
alter table public.tk_task drop column if exists suggested_at;
alter table public.tk_sop_row drop column if exists suggested_offset_minutes;
alter table public.tk_sop drop column if exists reference_h0;
