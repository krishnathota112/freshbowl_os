-- ─────────────────────────────────────────────────────────────────────────────
-- 0088 · Late-task tickets (user decision, 14 Sep 2026).
--
-- When work runs over its stated time, the Supervisor or Lab technician raises a ticket: a reason, the
-- extra hours needed, and photos. Admin sees it and approves (granting hours) or rejects, with a reason.
-- Only Admin decides (13 Sep ruling: late-work time tickets go to Admin, replacing Manager → GM).
--
-- NO SECOND SYSTEM. A ticket is a row of the existing extension register (extension_request), which
-- already records who asked, when, why, how many hours, and feeds the authorised end in the forecast.
--
--   · extension_policy.admin_decides = true; requesters = supervisor, lab technician. The manager and GM
--     decision functions refuse while Admin decides.
--   · extension_request gains admin_decision / admin_decided_by / admin_decided_at / admin_granted_hr /
--     admin_reason and overdue_at_request. Statuses ADMIN_APPROVED / ADMIN_REJECTED (0087).
--   · extension_request_media: the ticket's photos, bound through attach_extension_photo — the object
--     must already be in the evidence bucket under that batch and activity, and not be empty.
--   · "Overdue" = IN_PROGRESS past the stated maximum duration plus approved extra hours. Nothing is
--     measured against a schedule: PROCESS-2026E states no planned hours.
--   · v_extension_request, v_batch_timeline, v_batch_monitor, v_my_work carry tickets and overdue.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · register and policy ────────────────────────────────────────────────────
alter table public.extension_request
  add column if not exists admin_decision     extension_decision,
  add column if not exists admin_decided_by   uuid references public.profiles(id),
  add column if not exists admin_decided_at   timestamptz,
  add column if not exists admin_granted_hr   numeric check (admin_granted_hr is null or admin_granted_hr > 0),
  add column if not exists admin_reason       text,
  add column if not exists overdue_at_request boolean not null default false;

alter table public.extension_request drop constraint if exists extension_approved_has_hours;
alter table public.extension_request add constraint extension_approved_has_hours
  check ((status in ('GM_APPROVED', 'ADMIN_APPROVED')) = (approved_extension_hr is not null));
alter table public.extension_request drop constraint if exists extension_admin_decision_attributed;
alter table public.extension_request add constraint extension_admin_decision_attributed
  check (admin_decision is null or (admin_decided_by is not null and admin_decided_at is not null
                                    and length(trim(coalesce(admin_reason, ''))) > 0));

alter table public.extension_policy
  add column if not exists admin_decides boolean not null default false;

update public.extension_policy
   set admin_decides = true,
       manager_approval_required = false,
       gm_approval_required = false,
       requester_roles = array['supervisor', 'lab_tech']::app_role[],
       updated_at = now()
 where id;

-- ── 2 · ticket photos ──────────────────────────────────────────────────────────
create table if not exists public.extension_request_media (
  id                   uuid primary key default gen_random_uuid(),
  extension_request_id uuid not null references public.extension_request(id) on delete cascade,
  storage_path         text not null unique,
  media_kind           text not null default 'photo',
  mime_type            text,
  byte_size            bigint,
  uploaded_by          uuid not null references public.profiles(id),
  uploaded_at          timestamptz not null default now()
);
alter table public.extension_request_media enable row level security;
drop policy if exists extension_request_media_read on public.extension_request_media;
create policy extension_request_media_read on public.extension_request_media
  for select to authenticated using (true);
grant select on public.extension_request_media to authenticated;

-- An unbound upload may be tidied away by its capturer; a ticket photo is bound, so it may not.
drop policy if exists evidence_delete_unbound on storage.objects;
create policy evidence_delete_unbound on storage.objects for delete to authenticated
  using ((bucket_id = 'evidence'::text) AND (array_length(path_tokens, 1) = 3)
         AND public.can_capture_for_activity((path_tokens[2])::uuid)
         AND (NOT (EXISTS (SELECT 1 FROM public.evidence_media m WHERE m.storage_path = objects.name)))
         AND (NOT (EXISTS (SELECT 1 FROM public.extension_request_media t WHERE t.storage_path = objects.name))));

-- ── 3 · an Admin approval is effective ─────────────────────────────────────────
create or replace function public.extension_is_effective(p_status extension_status)
 returns boolean
 language sql
 stable
as $function$
  select case
    when p_status in ('GM_APPROVED', 'ADMIN_APPROVED') then true
    -- If the factory later says the GM is not required, a manager's approval is
    -- the last one needed and the request is effective at that point.
    when p_status = 'MANAGER_APPROVED'
      then not (select gm_approval_required from public.extension_policy where extension_policy.id)
    else false
  end;
$function$;

-- ── 4 · request_extension: overdue flag, Admin notified ────────────────────────
CREATE OR REPLACE FUNCTION public.request_extension(p_activity uuid, p_hours numeric, p_reason text, p_evidence uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba  batch_activity;
  b   master_batch;
  pol extension_policy;
  n   int;
  new_id uuid;
begin
  select * into pol from extension_policy where extension_policy.id;
  perform public.assert_role(pol.requester_roles, 'Requesting an extension');

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  select * into b from master_batch where id = ba.master_batch_id;

  if b.status <> 'active' then
    raise exception 'Batch % is % — an extension only means something on a running batch', b.code, b.status;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'An extension needs a reason — it is the whole record of why the plan was missed';
  end if;

  if p_hours is null or p_hours <= 0 then
    raise exception 'An extension must ask for a positive number of hours';
  end if;

  if pol.max_requested_hr is not null and p_hours > pol.max_requested_hr then
    raise exception 'An extension may not exceed % hours (extension_policy.max_requested_hr)',
      pol.max_requested_hr;
  end if;

  if pol.evidence_required and p_evidence is null then
    raise exception 'Policy requires evidence with an extension request (extension_policy.evidence_required)';
  end if;

  if not pol.allow_after_completion and ba.actual_end is not null then
    raise exception
      'Activity % has already finished. Extending it now would be rewriting history — record a deviation instead.',
      ba.code;
  end if;

  if not pol.allow_late_request
     and ba.planned_end_at is not null and now() > ba.planned_end_at then
    raise exception 'The planned end of % has passed and late requests are not permitted', ba.code;
  end if;

  if pol.max_total_per_activity is not null then
    select count(*) into n from extension_request where batch_activity_id = p_activity;
    if n >= pol.max_total_per_activity then
      raise exception 'Activity % already carries % extension request(s), the configured maximum',
        ba.code, n;
    end if;
  end if;

  -- The one-open-request rule is the partial unique index; this turns its
  -- constraint error into a sentence a person can act on.
  select count(*) into n from extension_request
   where batch_activity_id = p_activity and status in ('REQUESTED','MANAGER_APPROVED');
  if n >= pol.max_open_per_activity then
    raise exception 'Activity % already has an extension request awaiting a decision', ba.code;
  end if;

  insert into extension_request (
    master_batch_id, batch_activity_id,
    requested_by, requested_by_role, requested_extension_hr, requested_reason, evidence_id,
    planned_end_at_at_request, activity_state_at_request, status, overdue_at_request
  ) values (
    ba.master_batch_id, p_activity,
    auth.uid(), public.current_app_role(), p_hours, trim(p_reason), p_evidence,
    ba.planned_end_at, ba.state::text, 'REQUESTED',
    -- 0088 · was the work already past its stated maximum (plus any approved extra hours)?
    (ba.state = 'IN_PROGRESS' and ba.actual_start is not null and ba.duration_target_max_hr is not null and now() > ba.actual_start + make_interval(secs => ((ba.duration_target_max_hr + coalesce((select sum(er.approved_extension_hr) from extension_request er where er.batch_activity_id = ba.id and extension_is_effective(er.status)), 0)) * 3600)::int))
  ) returning extension_request.id into new_id;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (ba.master_batch_id, p_activity,
          case when pol.admin_decides then 'admin'::app_role else 'manager'::app_role end, 'alert',
          format('Late-task ticket on %s: %s more hours requested', ba.title, p_hours), trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'request_extension', 'extension_request', new_id::text,
          jsonb_build_object('hours', p_hours, 'activity', p_activity, 'status', 'REQUESTED'),
          trim(p_reason));

  return new_id;
end;
$function$;

-- ── 5 · manager / GM decisions refuse while Admin decides ─────────────────────
CREATE OR REPLACE FUNCTION public.manager_decide_extension(p_request uuid, p_approve boolean, p_reason text, p_granted_hr numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  er  extension_request;
  pol extension_policy;
  granted numeric;
begin
  perform public.assert_role(array['manager']::app_role[], 'Deciding an extension as manager');

  -- 0088 · late-task tickets are decided by Admin only (13–14 Sep 2026 ruling).
  if (select admin_decides from extension_policy where extension_policy.id) then
    raise exception 'Late-task tickets are decided by Admin. Use admin_decide_extension.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into pol from extension_policy where extension_policy.id;
  select * into er from extension_request where id = p_request for update;
  if not found then raise exception 'No such extension request: %', p_request; end if;

  if er.status <> 'REQUESTED' then
    raise exception 'Extension request is % — only a REQUESTED one awaits a manager', er.status;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason';
  end if;

  -- A manager may grant LESS than was asked for, never more: approving more time
  -- than anyone requested is a decision nobody made.
  granted := coalesce(p_granted_hr, er.requested_extension_hr);
  if granted > er.requested_extension_hr then
    raise exception 'A manager may approve at most the % hours requested', er.requested_extension_hr;
  end if;
  if granted <= 0 then
    raise exception 'An approved extension must be a positive number of hours';
  end if;

  if not p_approve then
    update extension_request set
      manager_decision = 'rejected', manager_decided_by = auth.uid(),
      manager_decided_at = now(), manager_reason = trim(p_reason),
      status = 'MANAGER_REJECTED'
    where id = p_request;
  else
    update extension_request set
      manager_decision = 'approved', manager_decided_by = auth.uid(),
      manager_decided_at = now(), manager_reason = trim(p_reason),
      manager_granted_hr = granted,
      status = 'MANAGER_APPROVED'
    where id = p_request;

    -- If the policy does not require the GM, the manager's yes was the last one
    -- needed and the authorisation takes effect now.
    if not pol.gm_approval_required then
      perform public.fn_make_extension_effective(p_request, granted);
    end if;
  end if;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (er.master_batch_id, er.batch_activity_id,
          case when p_approve and pol.gm_approval_required then 'gm' else er.requested_by_role end,
          'alert',
          format('Extension %s by manager', case when p_approve then 'approved' else 'rejected' end),
          trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'manager_decide_extension', 'extension_request',
          p_request::text,
          jsonb_build_object('approve', p_approve, 'granted_hr', case when p_approve then granted end),
          trim(p_reason));
end;
$function$;

CREATE OR REPLACE FUNCTION public.gm_decide_extension(p_request uuid, p_approve boolean, p_reason text, p_granted_hr numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  er  extension_request;
  pol extension_policy;
  ceiling numeric;
  granted numeric;
begin
  perform public.assert_role(array['gm']::app_role[], 'Deciding an extension as GM');

  -- 0088 · late-task tickets are decided by Admin only (13–14 Sep 2026 ruling).
  if (select admin_decides from extension_policy where extension_policy.id) then
    raise exception 'Late-task tickets are decided by Admin. Use admin_decide_extension.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into pol from extension_policy where extension_policy.id;
  select * into er from extension_request where id = p_request for update;
  if not found then raise exception 'No such extension request: %', p_request; end if;

  if pol.strict_approval_order and pol.manager_approval_required then
    if er.status <> 'MANAGER_APPROVED' then
      raise exception
        'Extension request is % — the manager decides first (extension_policy.strict_approval_order)',
        er.status;
    end if;
  elsif er.status not in ('REQUESTED','MANAGER_APPROVED') then
    raise exception 'Extension request is % — it is already decided', er.status;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason';
  end if;

  -- The GM cannot exceed what the manager allowed, and neither can exceed what
  -- was asked for. Approval only ever narrows.
  ceiling := least(coalesce(er.manager_granted_hr, er.requested_extension_hr),
                   er.requested_extension_hr);
  granted := coalesce(p_granted_hr, ceiling);
  if granted > ceiling then
    raise exception 'The GM may approve at most % hours here', ceiling;
  end if;
  if granted <= 0 then
    raise exception 'An approved extension must be a positive number of hours';
  end if;

  if not p_approve then
    update extension_request set
      gm_decision = 'rejected', gm_decided_by = auth.uid(),
      gm_decided_at = now(), gm_reason = trim(p_reason),
      status = 'GM_REJECTED'
    where id = p_request;
  else
    update extension_request set
      gm_decision = 'approved', gm_decided_by = auth.uid(),
      gm_decided_at = now(), gm_reason = trim(p_reason),
      gm_granted_hr = granted
    where id = p_request;
    perform public.fn_make_extension_effective(p_request, granted);
  end if;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (er.master_batch_id, er.batch_activity_id, er.requested_by_role, 'alert',
          format('Extension %s by GM', case when p_approve then 'approved' else 'rejected' end),
          trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'gm_decide_extension', 'extension_request',
          p_request::text,
          jsonb_build_object('approve', p_approve, 'granted_hr', case when p_approve then granted end),
          trim(p_reason));
end;
$function$;

-- ── 6 · Admin decisions are append-only too ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_extension_is_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.id                     is distinct from old.id
  or new.master_batch_id        is distinct from old.master_batch_id
  or new.batch_activity_id      is distinct from old.batch_activity_id
  or new.requested_by           is distinct from old.requested_by
  or new.requested_at           is distinct from old.requested_at
  or new.requested_extension_hr is distinct from old.requested_extension_hr
  or new.requested_reason       is distinct from old.requested_reason
  or new.planned_end_at_at_request is distinct from old.planned_end_at_at_request
  then
    raise exception 'An extension request is a record of what was asked. It cannot be rewritten.'
      using errcode = 'check_violation';
  end if;

  if old.manager_decision is not null
     and (new.manager_decision   is distinct from old.manager_decision
       or new.manager_decided_by is distinct from old.manager_decided_by
       or new.manager_decided_at is distinct from old.manager_decided_at
       or new.manager_granted_hr is distinct from old.manager_granted_hr
       or new.manager_reason     is distinct from old.manager_reason)
  then
    raise exception 'The manager decision on % is already recorded and cannot be changed.', old.id
      using errcode = 'check_violation';
  end if;

  if old.gm_decision is not null
     and (new.gm_decision   is distinct from old.gm_decision
       or new.gm_decided_by is distinct from old.gm_decided_by
       or new.gm_decided_at is distinct from old.gm_decided_at
       or new.gm_granted_hr is distinct from old.gm_granted_hr
       or new.gm_reason     is distinct from old.gm_reason)
  then
    raise exception 'The GM decision on % is already recorded and cannot be changed.', old.id
      using errcode = 'check_violation';
  end if;

  -- 0088 · an Admin decision, once recorded, is history too.
  if old.admin_decision is not null
     and (new.admin_decision   is distinct from old.admin_decision
       or new.admin_decided_by is distinct from old.admin_decided_by
       or new.admin_decided_at is distinct from old.admin_decided_at
       or new.admin_granted_hr is distinct from old.admin_granted_hr
       or new.admin_reason     is distinct from old.admin_reason)
  then
    raise exception 'The Admin decision on % is already recorded and cannot be changed.', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- ── 7 · admin_decide_extension, attach_extension_photo ────────────────────────
create or replace function public.admin_decide_extension(
  p_request uuid, p_approve boolean, p_reason text, p_granted_hr numeric default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  er      extension_request;
  pol     extension_policy;
  granted numeric;
  base    timestamptz;
begin
  perform public.assert_role(array['admin']::app_role[], 'Deciding a late-task ticket');

  select * into pol from extension_policy where extension_policy.id;
  if not pol.admin_decides then
    raise exception 'Extension requests are decided by the manager and GM under the current policy.'
      using errcode = 'check_violation';
  end if;

  select * into er from extension_request where id = p_request for update;
  if not found then raise exception 'No such ticket: %', p_request; end if;
  if er.status <> 'REQUESTED' then
    raise exception 'This ticket is %; it is already decided or closed.', er.status
      using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason.' using errcode = 'check_violation';
  end if;

  if not p_approve then
    update extension_request set
      admin_decision = 'rejected', admin_decided_by = auth.uid(), admin_decided_at = now(),
      admin_reason = trim(p_reason), status = 'ADMIN_REJECTED'
    where id = p_request;
  else
    -- Approval never grants more than was asked.
    granted := coalesce(p_granted_hr, er.requested_extension_hr);
    if granted <= 0 or granted > er.requested_extension_hr then
      raise exception 'Grant between 0 and % hours.', er.requested_extension_hr using errcode = 'check_violation';
    end if;
    select coalesce(er.planned_end_at_at_request, ba.planned_end_at, now()) into base
      from batch_activity ba where ba.id = er.batch_activity_id;
    update extension_request set
      admin_decision = 'approved', admin_decided_by = auth.uid(), admin_decided_at = now(),
      admin_reason = trim(p_reason), admin_granted_hr = granted,
      approved_extension_hr = granted,
      effective_from = base,
      effective_to = base + make_interval(secs => (granted * 3600)::int),
      status = 'ADMIN_APPROVED'
    where id = p_request;
  end if;

  insert into notification (master_batch_id, batch_activity_id, to_role, to_person_id, kind, message, reason, sent_by)
  values (er.master_batch_id, er.batch_activity_id, er.requested_by_role, er.requested_by, 'alert',
          format('Late-task ticket %s by Admin', case when p_approve then 'approved' else 'rejected' end),
          trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_decide_extension', 'extension_request', p_request::text,
          jsonb_build_object('approve', p_approve, 'granted_hr', case when p_approve then granted end),
          trim(p_reason));
end;
$function$;

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

revoke all on function public.admin_decide_extension(uuid, boolean, text, numeric) from public, anon;
grant execute on function public.admin_decide_extension(uuid, boolean, text, numeric) to authenticated, service_role;
revoke all on function public.attach_extension_photo(uuid, text, text) from public, anon;
grant execute on function public.attach_extension_photo(uuid, text, text) to authenticated, service_role;

-- ── 8 · views ──────────────────────────────────────────────────────────────────
create or replace view public.v_extension_request with (security_invoker = on) as
 SELECT er.id,
    er.master_batch_id,
    mb.code AS batch_code,
    er.batch_activity_id,
    ba.title AS activity_title,
    ba.scope_label,
    er.status,
    extension_is_effective(er.status) AS is_effective,
    er.requested_extension_hr,
    er.approved_extension_hr,
    er.requested_reason,
    er.requested_at,
    rq.display_name AS requested_by_name,
    er.requested_by_role,
    er.manager_decision,
    er.manager_decided_at,
    er.manager_reason,
    mg.display_name AS manager_name,
    er.gm_decision,
    er.gm_decided_at,
    er.gm_reason,
    gm.display_name AS gm_name,
    er.effective_from,
    er.effective_to,
    er.cancel_reason,
    er.cancelled_at,
    er.expired_at,
    er.evidence_id,
    er.planned_end_at_at_request,
    ba.planned_end_at AS planned_end_at_now,
    ba.actual_end,
    er.overdue_at_request,
    er.admin_decision,
    er.admin_decided_at,
    er.admin_reason,
    er.admin_granted_hr,
    ad.display_name AS admin_name,
    mb.is_demo,
    pa.stage,
    ba.state::text AS activity_state,
    ba.actual_start,
    ba.duration_target_max_hr,
    (select coalesce(jsonb_agg(jsonb_build_object('storage_path', m.storage_path, 'uploaded_at', m.uploaded_at,
                                                  'media_kind', m.media_kind, 'uploaded_by', pu.display_name) order by m.uploaded_at), '[]'::jsonb)
       from extension_request_media m left join profiles pu on pu.id = m.uploaded_by
      where m.extension_request_id = er.id) AS photos
   FROM extension_request er
     JOIN master_batch mb ON mb.id = er.master_batch_id
     JOIN batch_activity ba ON ba.id = er.batch_activity_id
     LEFT JOIN process_activity pa ON pa.id = ba.process_activity_id
     LEFT JOIN profiles rq ON rq.id = er.requested_by
     LEFT JOIN profiles mg ON mg.id = er.manager_decided_by
     LEFT JOIN profiles gm ON gm.id = er.gm_decided_by
     LEFT JOIN profiles ad ON ad.id = er.admin_decided_by;
grant select on public.v_extension_request to authenticated;

create or replace view public.v_my_work with (security_invoker = on) as
 SELECT ba.id AS activity_id,
    ba.master_batch_id,
    mb.code AS batch_code,
    ba.code,
    ba.title,
    ba.scope_label,
    ba.stream::text AS stream,
    ba.instance_no,
    ba.state::text AS state,
    ba.blocked_reason,
    ba.is_hold,
    ba.responsible_role::text AS responsible_role,
    ba.assigned_person_id,
    ba.assigned_machine_id,
    ba.baseline_start_hour,
    ba.baseline_end_hour,
    ba.planned_start_at,
    ba.planned_end_at,
    ba.actual_start,
    ba.actual_end,
    ba.variance_minutes,
    ev.required_count,
    ev.satisfied_total,
    ev.outstanding_labels,
    pa.stage,
    COALESCE(pa.skip_policy, 'not_allowed'::text) AS skip_policy,
    ba.unblocks_at,
    ps.display_name AS started_by_name,
    pf.display_name AS finished_by_name,
    (ba.state = 'IN_PROGRESS' and ba.actual_start is not null and ba.duration_target_max_hr is not null and now() > ba.actual_start + make_interval(secs => ((ba.duration_target_max_hr + coalesce((select sum(er.approved_extension_hr) from extension_request er where er.batch_activity_id = ba.id and extension_is_effective(er.status)), 0)) * 3600)::int)) AS overdue,
    ba.duration_target_max_hr,
    (select er.status::text from extension_request er where er.batch_activity_id = ba.id
      order by er.requested_at desc limit 1) AS latest_ticket_status,
    mb.is_demo
   FROM batch_activity ba
     JOIN master_batch mb ON mb.id = ba.master_batch_id
     LEFT JOIN process_activity pa ON pa.id = ba.process_activity_id
     LEFT JOIN profiles ps ON ps.id = ba.started_by
     LEFT JOIN profiles pf ON pf.id = ba.submitted_by
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS required_count,
            sum(LEAST(r.satisfied_count, r.min_count))::integer AS satisfied_total,
            string_agg(r.label, ', '::text ORDER BY r.ordering) FILTER (WHERE r.satisfied_count < r.min_count) AS outstanding_labels
           FROM batch_activity_evidence_req r
          WHERE r.batch_activity_id = ba.id AND r.gates_submission) ev ON true
  WHERE mb.status = 'active'::batch_status AND (ba.assigned_person_id = auth.uid() OR (current_app_role() = ANY (ARRAY['supervisor'::app_role, 'manager'::app_role, 'admin'::app_role, 'gm'::app_role])));
grant select on public.v_my_work to authenticated;

create or replace view public.v_batch_timeline with (security_invoker = on) as
select
  ba.master_batch_id,
  mb.code                                   as batch_code,
  mb.label                                  as batch_label,
  mb.is_demo,
  ba.id                                     as activity_id,
  ba.code,
  ba.title,
  pa.stage,
  ba.stream::text                           as stream,
  ba.scope_label,
  ba.seq,
  ba.responsible_role::text                 as responsible_role,
  (ba.responsible_role = 'lab_tech')        as is_lab,
  ba.is_hold,
  ba.state::text                            as state,
  ba.blocked_reason,
  (select string_agg(cr.conflict_id || ': ' || cr.question, ' | ')
     from gate_rule g join conflict_register cr on cr.conflict_id = g.conflict_id
    where g.process_activity_id = ba.process_activity_id and g.kind = 'UNRESOLVED_DEPENDENCY' and g.is_enabled
  )                                         as unresolved_dependency,
  ba.before_tracking,
  ba.onboarded_position,
  ba.skip_reason,
  ba.skipped_at,
  ba.duration_target_min_hr,
  ba.duration_target_max_hr,
  ba.planned_start_at,
  ba.planned_end_at,
  ba.actual_start,
  ps.display_name                           as started_by_name,
  ba.actual_end,
  ba.submitted_at,
  pf.display_name                           as finished_by_name,
  (ba.state = 'IN_PROGRESS' and ba.actual_start is not null and ba.duration_target_max_hr is not null and now() > ba.actual_start + make_interval(secs => ((ba.duration_target_max_hr + coalesce((select sum(er.approved_extension_hr) from extension_request er where er.batch_activity_id = ba.id and extension_is_effective(er.status)), 0)) * 3600)::int))
                                            as overdue,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'key', v.field_key, 'label', v.label, 'datatype', v.datatype, 'unit', v.unit,
            'target', v.sop_value, 'value', v.actual_value, 'flag', v.variance_flag,
            'skip_reason', v.skip_reason, 'remarks', v.remarks,
            'recorded_at', v.actual_recorded_at, 'recorded_by', pr.display_name)
          order by v.display_order, v.label), '[]'::jsonb)
     from batch_activity_value v left join profiles pr on pr.id = v.actual_recorded_by
    where v.batch_activity_id = ba.id)      as readings,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'media_id', em.id, 'requirement_key', em.requirement_key, 'label', r.label,
            'storage_path', em.storage_path, 'media_kind', em.media_kind,
            'uploaded_at', em.uploaded_at, 'uploaded_by', pu.display_name,
            'superseded', em.superseded_by_id is not null, 'superseded_reason', em.superseded_reason)
          order by r.ordering, em.uploaded_at), '[]'::jsonb)
     from evidence_media em
     left join batch_activity_evidence_req r on r.id = em.requirement_id
     left join profiles pu on pu.id = em.uploaded_by
    where em.batch_activity_id = ba.id)     as photos,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'key', r.key, 'label', r.label, 'required', r.min_count, 'captured', r.satisfied_count)
          order by r.ordering), '[]'::jsonb)
     from batch_activity_evidence_req r
    where r.batch_activity_id = ba.id and r.gates_submission) as photo_requirements,
  (select string_agg(distinct lca.checkpoint_code, ', ')
     from lab_checkpoint_activity lca where lca.process_activity_id = ba.process_activity_id) as lab_checkpoint,
  (select bool_or(lc.kind = 'GATE')
     from lab_checkpoint_activity lca
     join lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
    where lca.process_activity_id = ba.process_activity_id) as lab_is_gate,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'sample_label', s.sample_ref_label, 'collected_at', s.collected_at, 'collected_by', pc.display_name,
            'parameter', t.parameter_code, 'value', coalesce(lr.value_numeric::text, lr.value_text),
            'unit', lr.unit, 'verdict', lr.verdict, 'measured_at', lr.measured_at,
            'technician', pt.display_name, 'retest_reason', lr.retest_reason)
          order by s.collected_at, t.parameter_code), '[]'::jsonb)
     from lab_sample s
     left join profiles pc on pc.id = s.collected_by
     left join lab_test t on t.sample_id = s.id and t.state not in ('superseded', 'cancelled')
     left join lab_result lr on lr.test_id = t.id and lr.superseded_by_result_id is null
     left join profiles pt on pt.id = lr.technician_id
    where s.batch_activity_id = ba.id)      as lab_results,
  ld.verdict                                as decision_verdict,
  ld.reason                                 as decision_reason,
  ld.decided_at,
  ld.decided_role::text                     as decided_role,
  pd2.display_name                          as decided_by_name,
  ld.approved_out_of_range,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'id', er.id, 'status', er.status, 'requested_at', er.requested_at, 'requested_by', rq.display_name,
            'requested_by_role', er.requested_by_role, 'hours', er.requested_extension_hr, 'reason', er.requested_reason,
            'overdue_at_request', er.overdue_at_request,
            'decision', er.admin_decision, 'decided_at', er.admin_decided_at, 'decided_by', ad.display_name,
            'granted_hr', er.admin_granted_hr, 'decision_reason', er.admin_reason,
            'photos', (select coalesce(jsonb_agg(jsonb_build_object('storage_path', m.storage_path, 'uploaded_at', m.uploaded_at,
                                                                     'media_kind', m.media_kind) order by m.uploaded_at), '[]'::jsonb)
                         from extension_request_media m where m.extension_request_id = er.id))
          order by er.requested_at), '[]'::jsonb)
     from extension_request er
     left join profiles rq on rq.id = er.requested_by
     left join profiles ad on ad.id = er.admin_decided_by
    where er.batch_activity_id = ba.id) as tickets
from batch_activity ba
join master_batch mb             on mb.id = ba.master_batch_id
left join process_activity pa    on pa.id = ba.process_activity_id
left join profiles ps            on ps.id = ba.started_by
left join profiles pf            on pf.id = ba.submitted_by
left join lateral (
  select d.* from lab_decision d where d.batch_activity_id = ba.id order by d.seq desc limit 1
) ld on true
left join profiles pd2           on pd2.id = ld.decided_by;

grant select on public.v_batch_timeline to authenticated;

create or replace view public.v_batch_monitor with (security_invoker = on) as
select
  mb.id                                     as master_batch_id,
  mb.code                                   as batch_code,
  mb.label                                  as batch_label,
  mb.is_demo,
  mb.status::text                           as status,
  pd.code                                   as process_code,
  pd.version                                as process_version,
  mb.start_at                               as h0,
  mb.activated_at,
  exists (select 1 from batch_activity x where x.master_batch_id = mb.id and x.before_tracking) as onboarded,
  (select string_agg(distinct m.code, ', ') from batch_material_role bmr join material m on m.id = bmr.material_id
    where bmr.master_batch_id = mb.id)      as materials,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech')                        as production_total,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state in ('COMPLETED'))              as production_completed,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.before_tracking)                     as production_before_tracking,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state in ('READY', 'RETURNED'))      as production_ready,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state = 'IN_PROGRESS')              as production_in_progress,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state in ('LOCKED', 'BLOCKED', 'WAITING_TIME', 'WAITING_CONDITION')) as production_locked,
  count(ba.id) filter (where ba.state = 'DEVIATION')                                                  as deviations,
  count(ba.id) filter (where ba.responsible_role = 'lab_tech' and not ba.is_pre_h0 and not ba.before_tracking
                         and ba.state in ('READY', 'IN_PROGRESS', 'RETURNED'))                        as lab_pending,
  count(ba.id) filter (where ba.responsible_role = 'lab_tech' and ba.state = 'COMPLETED'
                         and not exists (select 1 from lab_decision d where d.batch_activity_id = ba.id)
                         and exists (select 1 from lab_checkpoint_activity lca
                                       join lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
                                      where lca.process_activity_id = ba.process_activity_id and lc.kind = 'GATE')) as awaiting_gm,
  count(ba.id) filter (where (ba.state = 'IN_PROGRESS' and ba.actual_start is not null and ba.duration_target_max_hr is not null and now() > ba.actual_start + make_interval(secs => ((ba.duration_target_max_hr + coalesce((select sum(er.approved_extension_hr) from extension_request er where er.batch_activity_id = ba.id and extension_is_effective(er.status)), 0)) * 3600)::int))) as overdue,
  (select string_agg(distinct pa2.stage, ' · ')
     from batch_activity x join process_activity pa2 on pa2.id = x.process_activity_id
    where x.master_batch_id = mb.id and x.responsible_role is distinct from 'lab_tech'
      and x.state in ('READY', 'IN_PROGRESS', 'RETURNED'))  as current_stages,
  max(ba.actual_end)                        as last_activity_at,
  (select count(*) from extension_request er where er.master_batch_id = mb.id and er.status = 'REQUESTED') as open_tickets
from master_batch mb
join process_definition pd on pd.id = mb.process_definition_id
left join batch_activity ba on ba.master_batch_id = mb.id
group by mb.id, pd.code, pd.version;

grant select on public.v_batch_monitor to authenticated;

notify pgrst, 'reload schema';
