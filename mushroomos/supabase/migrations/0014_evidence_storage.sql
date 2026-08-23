-- 0014 · A4 — evidence storage. docs/BUILD_SEQUENCE_KIRO.md §A4,
-- docs/EVIDENCE_CONFIGURATION_MODEL.md §5/§6/§7, docs/ARCHITECTURE_V2.md §7.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE LIVE SECURITY DEFECT THIS CLOSES
--
-- `mark_evidence(p_req uuid)` took a requirement id and incremented a counter. That is all it did:
--
--     update batch_activity_evidence_req
--        set satisfied_count = least(satisfied_count + 1, min_count)
--      where id = p_req;
--
-- No role check. No ownership check. No file. It was granted to `authenticated`, so ANY signed-in
-- user could satisfy ANY requirement on ANY batch, and the evidence gate — the thing that stops an
-- activity being submitted without proof — could be cleared by six POSTs from a lab technician's
-- session against a batch they had never seen. `CONTRACT_AUDIT §3.3`.
--
-- It is DROPPED here, not deprecated. §A4: "Leave no counter-only path callable from any client."
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- UPLOAD FIRST, THEN BIND — AND WHY THE PATH CARRIES THE ACTIVITY
--
-- The row is inserted only after the object exists. `bind_evidence` verifies the object is in
-- storage before it will write anything, so a row claiming a photograph that is not there cannot be
-- created. That is an INTEGRITY rule: a false record of proof is the exact failure this product
-- exists to prevent.
--
-- Uploading first means the upload must be authorised on its own, before any row names it. That is
-- what the path is for. `ARCHITECTURE_V2 §7` already specifies
-- `{master_batch_id}/{activity_id}/{uuid}.jpg`, so the storage INSERT policy reads the activity id
-- out of `path_tokens[2]` and refuses anyone who is not entitled to that activity. An unauthorised
-- user cannot put an object there in the first place.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHO MAY CAPTURE EVIDENCE — READ, NOT CHOSEN
--
-- `ROLE_AND_APPROVAL_MODEL §2`'s permission matrix has a row for it:
--
--     | Capture evidence | ✅ | ✅ | ✅ | | | |
--
-- The columns are Field Operator · Lab Technician · Supervisor · Admin · Manager · GM, fixed by the
-- rows around it ("Record operator actual" is column 1 only, "Record lab result" column 2 only,
-- "Configure Day-0 baseline" column 4 only, "Approve management checkpoint 2–4" column 6 only).
--
-- So: operator, lab_tech, supervisor. **Admin, manager and GM may not**, and are refused even
-- though they can do almost everything else. Management SEES the image (§12); it does not create it.
--
-- On top of the role, ownership: the caller must be the person the activity is assigned to. A
-- supervisor is exempt from that half — `ROLE_AND_APPROVAL_MODEL §1` gives them "operational
-- control authority" and `assign_activity` already lets them reassign the row to themselves, so
-- refusing them would be theatre. Whoever binds is recorded in `uploaded_by` either way.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY NOT BUILT
--
-- No offline queue, no IndexedDB blob cache, no idempotency key. `ARCHITECTURE_V2 §5` carries the
-- client decision of 22 Aug 2026: operators and lab technicians have reliable realtime internet, so
-- the offline design is retained as a specification and not built. `EVIDENCE_CONFIGURATION_MODEL §6`
-- still says "capture works offline; blobs queue in IndexedDB" — that line is superseded by the same
-- decision. Upload-first-then-bind here is an integrity rule, not an offline one.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The bucket. Private.
--
-- Created from SQL. The `postgres` role can insert into `storage.buckets` on a managed Supabase
-- project — verified before writing this. IF A FUTURE ENVIRONMENT REFUSES, the dashboard equivalent
-- is: Storage → New bucket → name `evidence` → leave "Public bucket" OFF → Save. Nothing else on
-- that screen matters; the policies below are what govern access, not the bucket settings.
--
-- `file_size_limit` is a guard, not a business rule. 25 MB is set because
-- `EVIDENCE_CONFIGURATION_MODEL §7` estimates a photo at ~400 kB after the client downscale and a
-- 60-second clip at 15–30 MB, and **TBD-35** is open on whether video on the Day-4 hopper pass is
-- genuinely wanted. Capping duration and resolution at capture is what that TBD asks for; until it
-- is answered the limit is loose enough not to pre-empt the answer.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 26214400,
  -- The kinds the process definition actually asks for. `evidence_requirement.media_kinds` is
  -- `{photo}` everywhere except FIB1-HOP-3, which is `{photo,video}` under TBD-35.
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · evidence_media · the captured item.
--
-- Shape from `EVIDENCE_CONFIGURATION_MODEL §5`. Every row points at the REQUIREMENT it satisfies —
-- that is what makes "2 of 3 uploaded" computable and the submission gate real rather than advisory.
--
-- `superseded_by_id` is §6's rule: "Retaking does not delete: the original is kept with
-- superseded_by_id." So this table is append-only. Nothing deletes a photograph.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.evidence_media (
  id                 uuid primary key default gen_random_uuid(),
  master_batch_id    uuid not null references public.master_batch(id) on delete cascade,
  batch_activity_id  uuid not null references public.batch_activity(id) on delete cascade,
  requirement_id     uuid not null references public.batch_activity_evidence_req(id) on delete cascade,
  -- Denormalised from the requirement so the row is readable on its own and so an audit trail
  -- survives a requirement being regenerated. §A4 asks for the requirement KEY by name.
  requirement_key    text not null,
  -- `{master_batch_id}/{activity_id}/{uuid}.ext` — ARCHITECTURE_V2 §7. Unique: one row per object,
  -- so a single upload cannot be bound twice to inflate a count.
  storage_path       text not null unique,
  media_kind         text not null check (media_kind in ('photo','video')),
  mime_type          text,
  byte_size          bigint,
  -- FROM THE JWT, never from a parameter. A client cannot claim to be somebody else.
  uploaded_by        uuid not null references public.profiles(id),
  -- SERVER timestamp. ARCHITECTURE_V2 §7: "Capture timestamp + capturing user are stored
  -- server-side on insert". A device clock is not evidence of when a photograph was taken.
  uploaded_at        timestamptz not null default now(),
  superseded_by_id   uuid references public.evidence_media(id),
  superseded_reason  text,
  constraint evidence_media_not_self_superseding check (superseded_by_id is distinct from id),
  constraint evidence_media_supersede_has_reason
    check (superseded_by_id is null or coalesce(trim(superseded_reason), '') <> '')
);
alter table public.evidence_media enable row level security;

create index if not exists idx_evidence_media_activity
  on public.evidence_media (batch_activity_id, requirement_id);
create index if not exists idx_evidence_media_batch
  on public.evidence_media (master_batch_id, uploaded_at desc);
create index if not exists idx_evidence_media_live
  on public.evidence_media (requirement_id) where superseded_by_id is null;

-- Read is open to any authenticated user — management must see the image, not a count
-- (`UI_CONTROL_TOWER_SPEC §12`). WRITE GOES THROUGH bind_evidence ONLY.
drop policy if exists evidence_media_read on public.evidence_media;
create policy evidence_media_read on public.evidence_media
  for select to authenticated using (true);
revoke insert, update, delete on public.evidence_media from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · satisfied_count becomes DERIVED.
--
-- It used to be a number a client incremented. Now it is a count of live `evidence_media` rows,
-- maintained by trigger, so the counter cannot drift from the files. A generated column cannot do
-- this — it may not read another table — so a trigger is the mechanism, and it fires on insert,
-- update and delete so a supersede is reflected immediately.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_recount_evidence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  req uuid := coalesce(new.requirement_id, old.requirement_id);
begin
  update batch_activity_evidence_req r
     set satisfied_count = least(
           (select count(*) from evidence_media m
             where m.requirement_id = r.id and m.superseded_by_id is null),
           r.min_count)
   where r.id = req;
  return null;
end;
$$;

drop trigger if exists trg_recount_evidence on public.evidence_media;
create trigger trg_recount_evidence
  after insert or update or delete on public.evidence_media
  for each row execute function public.fn_recount_evidence();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Storage policies · the upload is authorised from the PATH.
--
-- This is what makes upload-first safe. No row exists yet when the object lands, so the only thing
-- available to authorise against is the path, and `{batch}/{activity}/{file}` carries the activity.
--
-- UPDATE and DELETE are granted to nobody. Evidence is append-only; a retake supersedes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_capture_for_activity(p_activity uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    -- The role must be one the permission matrix ticks for "Capture evidence".
    public.current_app_role() in ('operator','lab_tech','supervisor')
    and exists (
      select 1 from batch_activity ba
      join master_batch mb on mb.id = ba.master_batch_id
      where ba.id = p_activity
        -- A cancelled or closed batch takes no new evidence.
        and mb.status = 'active'
        and (
          -- the person it is assigned to
          ba.assigned_person_id = auth.uid()
          -- or a supervisor, who has operational control authority and can reassign it anyway
          or public.current_app_role() = 'supervisor'
        )
    );
$$;

grant execute on function public.can_capture_for_activity(uuid) to authenticated;

do $$ begin
  -- Written with EXECUTE because storage.objects is owned by supabase_storage_admin; the policy
  -- statements still succeed as `postgres`, but keeping them in a DO block makes the whole section
  -- re-runnable without tripping on an existing policy.
  execute 'drop policy if exists evidence_insert on storage.objects';
  execute $p$
    create policy evidence_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'evidence'
        -- {batch}/{activity}/{file} — exactly three segments, no traversal, no flat uploads.
        and array_length(path_tokens, 1) = 3
        and public.can_capture_for_activity((path_tokens[2])::uuid)
      )
  $p$;

  -- Reading is open to any authenticated user, matching the read posture of every batch table:
  -- management must be able to see the photograph. The bucket stays PRIVATE, so this is what makes
  -- a signed URL obtainable at all — without it `createSignedUrl` fails for everyone.
  execute 'drop policy if exists evidence_read on storage.objects';
  execute $p$
    create policy evidence_read on storage.objects
      for select to authenticated
      using (bucket_id = 'evidence')
  $p$;

  -- No UPDATE policy. Deliberate: an object that has been bound is a record.
  execute 'drop policy if exists evidence_update on storage.objects';
  execute 'drop policy if exists evidence_delete on storage.objects';

  -- DELETE is permitted for exactly one thing: an object that NO evidence_media row references.
  --
  -- An unbound object is not evidence. It is the residue of an upload whose bind failed, and
  -- `captureEvidence` in `src/api/batch.ts` already tries to remove it in that case — a call that
  -- silently did nothing until this policy existed, because there was no DELETE policy at all.
  --
  -- A BOUND object stays undeletable by every client, permanently: `evidence_media` has
  -- insert/update/delete revoked from `authenticated`, so nothing a client can call will ever
  -- unbind a row and make its object removable. Append-only survives.
  execute 'drop policy if exists evidence_delete_unbound on storage.objects';
  execute $p$
    create policy evidence_delete_unbound on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'evidence'
        and array_length(path_tokens, 1) = 3
        and public.can_capture_for_activity((path_tokens[2])::uuid)
        and not exists (
          select 1 from public.evidence_media m where m.storage_path = storage.objects.name
        )
      )
  $p$;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · bind_evidence · the only way a requirement becomes satisfied.
--
-- Every check is here, in one place, and every one of them can refuse:
--
--   1  the object must EXIST in storage                    ← the integrity rule
--   2  the path must belong to this batch and this activity ← no cross-binding
--   3  the requirement must belong to this activity
--   4  the media kind must be one the requirement accepts
--   5  the caller must be entitled to capture for this activity
--   6  the requirement must not already be satisfied, unless this is an explicit retake
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bind_evidence(
  p_activity        uuid,
  p_requirement_key text,
  p_storage_path    text,
  p_media_kind      text default 'photo',
  p_supersedes      uuid default null,
  p_supersede_reason text default null
) returns table (
  media_id         uuid,
  requirement_key  text,
  satisfied_count  int,
  min_count        int,
  uploaded_at      timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  ba      batch_activity;
  req     batch_activity_evidence_req;
  obj     record;
  segs    text[];
  new_id  uuid;
  live    int;
begin
  if auth.uid() is null then
    raise exception 'bind_evidence needs a signed-in user — the uploader is taken from the JWT, never from a parameter'
      using errcode = 'insufficient_privilege';
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  -- 5 · entitlement first, so an unauthorised caller learns nothing about the rest.
  if not public.can_capture_for_activity(p_activity) then
    raise exception
      'Not permitted: % may not capture evidence for %. Evidence is captured by the assigned '
      'operator or lab technician, or by a supervisor (ROLE_AND_APPROVAL_MODEL §2).',
      coalesce(public.current_app_role()::text, 'an unknown role'), ba.title
      using errcode = 'insufficient_privilege';
  end if;

  -- 3 · the requirement must be this activity's.
  select * into req from batch_activity_evidence_req
   where batch_activity_id = p_activity and key = p_requirement_key;
  if not found then
    raise exception 'Activity % has no evidence requirement named %', ba.title, p_requirement_key;
  end if;

  -- 4 · the kind must be one this requirement accepts.
  if not (p_media_kind = any (req.media_kinds)) then
    raise exception '% accepts % — % was offered',
      req.label, array_to_string(req.media_kinds, ' or '), p_media_kind;
  end if;

  -- 2 · the path must name this batch and this activity.
  segs := string_to_array(p_storage_path, '/');
  if array_length(segs, 1) <> 3
     or segs[1] <> ba.master_batch_id::text
     or segs[2] <> p_activity::text then
    raise exception
      'Storage path % does not belong to this activity. Expected %/%/<file>',
      p_storage_path, ba.master_batch_id, p_activity;
  end if;

  -- 1 · THE INTEGRITY RULE. The object has to be there already.
  select o.id, o.metadata into obj
    from storage.objects o
   where o.bucket_id = 'evidence' and o.name = p_storage_path;
  if not found then
    raise exception
      'No object at evidence/% — upload the file first, then bind it. A row claiming a photograph '
      'that is not in storage is a false record.', p_storage_path
      using errcode = 'no_data_found';
  end if;

  -- 6 · already satisfied? Only an explicit retake may proceed.
  select count(*) into live from evidence_media
   where requirement_id = req.id and superseded_by_id is null;

  if p_supersedes is null and live >= req.min_count then
    raise exception
      '% already has % of % item(s). Pass the id of the item this one replaces, with a reason.',
      req.label, live, req.min_count;
  end if;

  if p_supersedes is not null then
    if coalesce(trim(p_supersede_reason), '') = '' then
      raise exception 'Replacing an evidence item needs a reason — the original is kept, not deleted';
    end if;
    if not exists (
      select 1 from evidence_media
       where id = p_supersedes and requirement_id = req.id and superseded_by_id is null
    ) then
      raise exception 'No live evidence item % on %', p_supersedes, req.label;
    end if;
  end if;

  insert into evidence_media (
    master_batch_id, batch_activity_id, requirement_id, requirement_key,
    storage_path, media_kind, mime_type, byte_size, uploaded_by
  ) values (
    ba.master_batch_id, p_activity, req.id, req.key,
    p_storage_path, p_media_kind,
    nullif(obj.metadata->>'mimetype', ''),
    nullif(obj.metadata->>'size', '')::bigint,
    auth.uid()
  )
  returning id into new_id;

  -- §6 — retaking does not delete. The original stays, pointing at what replaced it.
  if p_supersedes is not null then
    update evidence_media
       set superseded_by_id = new_id, superseded_reason = p_supersede_reason
     where id = p_supersedes;
  end if;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'bind_evidence', 'evidence_media', new_id::text,
          jsonb_build_object('activity', p_activity, 'requirement', req.key, 'path', p_storage_path),
          case when p_supersedes is null then 'Evidence captured for ' || req.label
               else 'Retake of ' || req.label || ': ' || p_supersede_reason end);

  return query
    select new_id, req.key, r.satisfied_count, r.min_count,
           (select m.uploaded_at from evidence_media m where m.id = new_id)
      from batch_activity_evidence_req r where r.id = req.id;
end;
$$;

revoke execute on function
  public.bind_evidence(uuid, text, text, text, uuid, text) from anon;
grant execute on function
  public.bind_evidence(uuid, text, text, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · mark_evidence is GONE.
--
-- Not deprecated, not left behind a flag. §A4: "Leave no counter-only path callable from any
-- client." Any caller that still references it now fails loudly, which is the correct outcome for a
-- function whose only job was to forge a counter.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.mark_evidence(uuid);

-- Bring existing counters into line with reality. Every requirement on every batch is recounted
-- from `evidence_media`, which is empty, so any count left over from the old forgeable path is
-- reset to the truth: nothing has been photographed.
update public.batch_activity_evidence_req r
   set satisfied_count = least(
         (select count(*) from public.evidence_media m
           where m.requirement_id = r.id and m.superseded_by_id is null),
         r.min_count)
 where r.satisfied_count <> least(
         (select count(*) from public.evidence_media m
           where m.requirement_id = r.id and m.superseded_by_id is null),
         r.min_count);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · What an activity's evidence looks like, for a screen.
--
-- A view rather than a query each screen writes: `UI_CONTROL_TOWER_SPEC §12` says management sees
-- the image and not the count, so every caller needs the same join and the same ordering.
-- The signed URL is minted by the client from `storage_path`; a URL cannot be stored because it
-- expires.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_evidence_state as
select
  r.id                as requirement_id,
  r.batch_activity_id,
  ba.master_batch_id,
  r.key,
  r.label,
  r.media_kinds,
  r.min_count,
  r.satisfied_count,
  r.gates_submission,
  r.capture_hint,
  r.ordering,
  m.id                as media_id,
  m.storage_path,
  m.media_kind,
  m.uploaded_at,
  m.uploaded_by,
  p.display_name      as uploaded_by_name,
  p.role              as uploaded_by_role,
  m.superseded_by_id,
  m.superseded_reason
from public.batch_activity_evidence_req r
join public.batch_activity ba on ba.id = r.batch_activity_id
left join public.evidence_media m on m.requirement_id = r.id
left join public.profiles p on p.id = m.uploaded_by;

grant select on public.v_evidence_state to authenticated;
