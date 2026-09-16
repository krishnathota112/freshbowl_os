-- ─────────────────────────────────────────────────────────────────────────────
-- 0112 · ADMIN DELETE OF A TEST / DEMO BATCH (spec §16, §16.1, §18-F).
--
-- LIFECYCLE THE SCHEMA ACTUALLY SUPPORTS (inspected first):
--   · cancel_batch(batch, reason) exists and is the production path: status → cancelled, open work cancelled,
--     everything kept and audited. That is the least destructive action and stays the default.
--   · Hard delete is physically possible: every child of master_batch cascades (batch_activity, values, evidence
--     requirements, evidence_media, lab_sample→test→result, extension_request, deviations, notifications,
--     allocations, occupancy, movements, corrections), except monthly_schedule_group (restrict, nullable) and
--     0110's vessel_readiness_task.for_batch_id (no action, nullable) — both detached here before the delete.
--   · audit_event has NO foreign key to the batch, so the trail survives a delete. It stays append-only.
--
-- THE RULE THIS IMPLEMENTS: only a DEMO / TEST batch may be deleted, and only by an Admin who retypes its code.
-- A real production batch is refused and pointed at cancel_batch, so history and accountability cannot be erased
-- by a button. The deleted batch's evidence RECORDS go with it; their files stay in the storage bucket, which
-- Supabase will not let SQL delete, and the count is returned. An audit row recording exactly what was removed is
-- written BEFORE the delete.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_delete_batch(p_batch uuid, p_confirm_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare b master_batch; v_counts jsonb; v_objs int;
begin
  perform public.assert_role(array['admin']::app_role[], 'delete a batch');
  select * into b from master_batch where id = p_batch for update;
  if not found then raise exception 'No such batch.'; end if;

  if not b.is_demo then
    raise exception 'Batch % is a production batch. Deleting it would erase its history. Cancel it instead — cancelled batches stay on the record and disappear from the screens.', b.code
      using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_confirm_code), '') <> b.code then
    raise exception 'Type the batch code (%) to confirm the deletion.', b.code using errcode = 'check_violation';
  end if;

  select jsonb_build_object(
    'code', b.code, 'label', b.label, 'status', b.status, 'is_demo', b.is_demo,
    'process', (select pd.code from process_definition pd where pd.id = b.process_definition_id),
    'activities', (select count(*) from batch_activity where master_batch_id = p_batch),
    'completed', (select count(*) from batch_activity where master_batch_id = p_batch and state = 'COMPLETED'),
    'photos', (select count(*) from evidence_media where master_batch_id = p_batch),
    'lab_samples', (select count(*) from lab_sample where master_batch_id = p_batch),
    'tickets', (select count(*) from extension_request where master_batch_id = p_batch))
  into v_counts;

  -- the trail is written first, and survives the delete (audit_event has no foreign key to the batch)
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, before_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_delete_batch', 'master_batch', p_batch::text, v_counts,
          'DEMO / TEST batch ' || b.code || ' deleted by Admin');

  -- detach the two references that do not cascade
  update monthly_schedule_group set master_batch_id = null where master_batch_id = p_batch;
  update vessel_readiness_task set for_batch_id = null where for_batch_id = p_batch;
  -- its photograph RECORDS cascade with the batch. The FILES stay in the bucket: Supabase refuses a direct delete
  -- from storage.objects ("Use the Storage API instead"), so the count is reported rather than faked.
  select count(*) into v_objs from storage.objects
   where bucket_id = 'evidence' and (storage.foldername(name))[1] = p_batch::text;

  delete from master_batch where id = p_batch;

  return v_counts || jsonb_build_object('storage_files_left_in_bucket', v_objs, 'deleted_at', now());
end;
$fn$;

revoke all on function public.admin_delete_batch(uuid, text) from public, anon;
grant execute on function public.admin_delete_batch(uuid, text) to authenticated;

notify pgrst, 'reload schema';
