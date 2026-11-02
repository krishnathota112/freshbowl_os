-- ─────────────────────────────────────────────────────────────────────────────
-- 0108 · Two of the three named ticket defects from the 16 Sep 2026 audit.
--
--   1 · attach_extension_photo had no protection against the same photo (by storage
--       eTag) being reused across tickets, tasks, or batches. bind_evidence (0101) has
--       carried this protection since 0101; extension_request_media never got it. Same
--       fix, same wording, same table shape (join through storage.objects on eTag).
--
--   2 · manager_decide_extension / gm_decide_extension are dead code with a live
--       surface: 0087/0088 moved ticket decisions to Admin only, and 0088 already makes
--       both functions raise an exception at runtime ("routes through admin_decide_extension
--       now"). But they are still GRANTed to authenticated, so they are reachable and a
--       future screen could be wired to them by mistake, same shape of hazard as the
--       dead admin/api/batches.ts::createBatch() found in the same audit. Revoking
--       execute makes the retirement real instead of merely enforced by a runtime check.
--       The function bodies are kept — migration history is not deleted — only the grant
--       is removed.
--
-- The third named defect (the due/overdue calculation duplicated across v_my_work,
-- v_batch_timeline, v_batch_monitor and request_extension) is NOT in this migration.
-- Consolidating four view/function bodies into one shared helper needs to be checked
-- against a live database or a test run — this session cannot run `npm test` or apply a
-- migration here (device_bash is unavailable on the connected machine) — and a view
-- rewrite that fails at apply time is a worse outcome than leaving the duplication in
-- place one more pass. Left for the next pass with a working shell/build.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · duplicate-photo protection on ticket attachments, mirroring bind_evidence (0101).
create or replace function public.attach_extension_photo(
  p_request uuid, p_storage_path text, p_media_kind text default 'photo')
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  er     extension_request;
  segs   text[];
  obj    record;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'A ticket photo needs a signed-in user.' using errcode = 'insufficient_privilege';
  end if;

  select * into er from extension_request where id = p_request;
  if not found then raise exception 'No such ticket: %', p_request; end if;
  if er.requested_by is distinct from auth.uid() then
    raise exception 'Only the person who raised this ticket adds its photos.' using errcode = 'insufficient_privilege';
  end if;
  if er.status <> 'REQUESTED' then
    raise exception 'This ticket is %; photos are added while it is open.', er.status using errcode = 'check_violation';
  end if;
  if p_media_kind not in ('photo', 'video') then
    raise exception 'A ticket attachment is a photo or a video.' using errcode = 'check_violation';
  end if;

  segs := string_to_array(p_storage_path, '/');
  if array_length(segs, 1) <> 3 or segs[1] <> er.master_batch_id::text or segs[2] <> er.batch_activity_id::text then
    raise exception 'Storage path % does not belong to this ticket''s task.', p_storage_path using errcode = 'check_violation';
  end if;

  select o.id, o.metadata into obj from storage.objects o
   where o.bucket_id = 'evidence' and o.name = p_storage_path;
  if not found then
    raise exception 'No object at evidence/% — upload the photo first, then attach it.', p_storage_path
      using errcode = 'no_data_found';
  end if;
  if coalesce(nullif(obj.metadata->>'size', '')::bigint, 0) <= 0 then
    raise exception 'The uploaded file is empty. Take the photo again.' using errcode = 'check_violation';
  end if;

  -- 0108 · ONE PHOTOGRAPH, ONE RECORD — the same protection bind_evidence has had since
  -- 0101. The same file (same content hash) cannot be reused as a ticket photo, whether
  -- it was already bound as evidence elsewhere or already attached to another ticket.
  if nullif(obj.metadata->>'eTag', '') is not null and (
       exists (
         select 1 from evidence_media m
           join storage.objects o2 on o2.bucket_id = 'evidence' and o2.name = m.storage_path
          where o2.metadata->>'eTag' = obj.metadata->>'eTag' and o2.name <> p_storage_path
       )
       or exists (
         select 1 from extension_request_media m
           join storage.objects o2 on o2.bucket_id = 'evidence' and o2.name = m.storage_path
          where o2.metadata->>'eTag' = obj.metadata->>'eTag' and o2.name <> p_storage_path
       )
     ) then
    raise exception 'This photo has already been used as evidence. Take a new photo of the work as it is now.'
      using errcode = 'check_violation';
  end if;

  insert into extension_request_media (extension_request_id, storage_path, media_kind, mime_type, byte_size, uploaded_by)
  values (p_request, p_storage_path, p_media_kind, nullif(obj.metadata->>'mimetype', ''),
          nullif(obj.metadata->>'size', '')::bigint, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'attach_extension_photo', 'extension_request_media', new_id::text,
          jsonb_build_object('ticket', p_request, 'path', p_storage_path), 'Photo added to late-task ticket');
  return new_id;
end;
$function$;

revoke all on function public.attach_extension_photo(uuid, text, text) from public, anon;
grant execute on function public.attach_extension_photo(uuid, text, text) to authenticated, service_role;

-- 2 · retire the dead Manager/GM ticket-decision RPCs for real, not just at runtime.
-- Bodies kept (0088 already made them raise on call); only the grant is removed, so a
-- future screen cannot be wired to them by accident.
revoke all on function public.manager_decide_extension(uuid, boolean, text, numeric) from public, anon, authenticated;
revoke all on function public.gm_decide_extension(uuid, boolean, text, numeric) from public, anon, authenticated;
