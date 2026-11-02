-- Rollback for mushroomos/supabase/migrations/0144_tasks_app.sql (MushroomOS Tasks). Deletes the app's data.
drop view if exists public.tk_v_checkpoint, public.tk_v_batch, public.tk_v_task, public.tk_v_sop;
drop policy if exists tasks_insert on storage.objects;
drop policy if exists tasks_delete on storage.objects;
drop policy if exists tasks_read on storage.objects;
drop function if exists public.tk_gm_decide(uuid, boolean, text), public.tk_lab_submit(uuid, jsonb, text), public.tk_note(uuid, text),
  public.tk_add_photo(uuid, text, text), public.tk_finish(uuid, text, text), public.tk_start(uuid), public.tk_running_since(uuid, timestamptz),
  public.tk_done_before(uuid), public.tk_task_remove(uuid), public.tk_task_edit(uuid, jsonb), public.tk_task_add(uuid, uuid, jsonb),
  public.tk_batch_close(uuid), public.tk_batch_create(text, uuid, timestamptz, text), public.tk_sop_delete_draft(uuid),
  public.tk_sop_new_version(uuid), public.tk_sop_publish(uuid), public.tk_sop_save(uuid, text, text, jsonb), public.tk_sop_create(text, text, jsonb),
  public.tk_clean_rows(jsonb), public.tk_task_for_update(uuid), public.tk_blocker(uuid), public.tk_log(text, text, uuid, jsonb);
drop table if exists public.tk_decision, public.tk_reading, public.tk_photo, public.tk_task, public.tk_batch, public.tk_sop_row, public.tk_sop;
-- the storage bucket 'tasks' is left in place (delete its objects first if it must go)
