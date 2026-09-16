-- ─────────────────────────────────────────────────────────────────────────────
-- 0110 · BUNKER / TUNNEL CLEANING AND READINESS (backend repair spec §6, §9, §18-E).
--
-- WHAT EXISTED (inspected first): location (11 bunkers, 12 tunnels, lagoon, yard, hopper), vessel_scope_map,
-- batch_vessel_allocation, location_occupancy + fn_track_occupancy (occupancy follows allocation and the activity's
-- own start/end), allocate_vessel / release_vessel (Admin/Manager; kind, status and occupancy clash are checked),
-- v_vessel_availability. There is NO cleaning or readiness anywhere: a bunker emptied by batch A can be allocated to
-- batch B the same second. Nothing else in the process models cleaning either (the two "Bunker preparation /
-- Bunker cleaning" checklist items live inside the new hopper pass, which is batch work, not resource work).
--
-- WHAT THIS ADDS — resource-level lifecycle, exact-resource scoped, reusing what exists:
--   vessel_readiness_task   one cleaning job for ONE location: requested → (assigned) → started → completed.
--   vessel_readiness_media  its photographs, same shape and protections as extension_request_media (0088/0108).
--   v_vessel_readiness      per location: last released, last cleaned, ready / needs cleaning, open task, occupancy.
--   v_resource_need         upcoming vessel needs per active batch, from the projection engine (0109) — so Admin
--                           sees "batch X needs a bunker around 18 Sep 04:00" BEFORE the step is due.
--   allocate_vessel         now refuses a vessel that has been used and not cleaned since. Exact resource only:
--                           bunker 1 being dirty never blocks bunker 2.
-- The checklist wording is the factory's own (the SOP's "Bunker preparation" / "Bunker cleaning", and the tunnel
-- preparation lines); nothing new is invented. NEEDS FACTORY DECISION: whether more items belong on it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.vessel_readiness_task (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.location(id),
  for_batch_id  uuid references public.master_batch(id),
  state         text not null default 'PENDING'
                check (state in ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  checklist     jsonb not null default '[]'::jsonb,
  note          text,
  requested_by  uuid references public.profiles(id),
  requested_at  timestamptz not null default now(),
  assigned_to   uuid references public.profiles(id),
  started_at    timestamptz,
  started_by    uuid references public.profiles(id),
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id),
  cancel_reason text
);
create index if not exists vessel_readiness_task_location on public.vessel_readiness_task (location_id, state);
create unique index if not exists vessel_readiness_task_one_open
  on public.vessel_readiness_task (location_id) where state in ('PENDING', 'IN_PROGRESS');

create table if not exists public.vessel_readiness_media (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.vessel_readiness_task(id) on delete cascade,
  storage_path text not null unique,
  media_kind   text not null default 'photo',
  mime_type    text,
  byte_size    bigint,
  uploaded_by  uuid not null references public.profiles(id),
  uploaded_at  timestamptz not null default now()
);

alter table public.vessel_readiness_task enable row level security;
alter table public.vessel_readiness_media enable row level security;
drop policy if exists vessel_readiness_task_read on public.vessel_readiness_task;
create policy vessel_readiness_task_read on public.vessel_readiness_task for select to authenticated using (true);
drop policy if exists vessel_readiness_media_read on public.vessel_readiness_media;
create policy vessel_readiness_media_read on public.vessel_readiness_media for select to authenticated using (true);
grant select on public.vessel_readiness_task to authenticated;
grant select on public.vessel_readiness_media to authenticated;

-- Cleaning photographs live in the evidence bucket under readiness/<task id>/<file>. The existing per-activity
-- policy cannot cover them (they belong to a resource, not a batch activity), so this adds that one path shape.
drop policy if exists readiness_insert on storage.objects;
create policy readiness_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and array_length(path_tokens, 1) = 3 and path_tokens[1] = 'readiness'
              and public.has_role(variadic array['supervisor', 'admin', 'manager']::app_role[])
              and exists (select 1 from public.vessel_readiness_task t
                           where t.id::text = path_tokens[2] and t.state in ('PENDING', 'IN_PROGRESS')));

-- ── readiness state, per location ────────────────────────────────────────────
create or replace view public.v_vessel_readiness with (security_invoker = on) as
select l.id as location_id, l.code, l.kind::text as kind, l.label, l.status, l.is_exclusive,
       occ.master_batch_id as occupied_by_batch_id, occ_mb.code as occupied_by_batch, occ.started_at as occupied_since,
       rel.last_released_at,
       cl.last_cleaned_at, cl.last_cleaned_by,
       t.id as open_task_id, t.state as open_task_state, t.assigned_to as open_task_assigned_to,
       pr.display_name as open_task_assigned_name,
       (occ.master_batch_id is null
        and (rel.last_released_at is null or (cl.last_cleaned_at is not null and cl.last_cleaned_at >= rel.last_released_at))
        and l.status = 'available') as is_ready,
       case
         when occ.master_batch_id is not null then 'In use by ' || coalesce(occ_mb.code, 'another batch')
         when l.status <> 'available' then 'Marked ' || l.status
         when rel.last_released_at is not null and (cl.last_cleaned_at is null or cl.last_cleaned_at < rel.last_released_at)
           then 'Needs cleaning since ' || to_char(rel.last_released_at, 'DD Mon HH24:MI')
       end as not_ready_reason
  from public.location l
  left join lateral (select o.master_batch_id, o.started_at from public.location_occupancy o
                      where o.location_id = l.id and o.ended_at is null order by o.started_at limit 1) occ on true
  left join public.master_batch occ_mb on occ_mb.id = occ.master_batch_id
  left join lateral (select max(o.ended_at) as last_released_at from public.location_occupancy o
                      where o.location_id = l.id and o.ended_at is not null) rel on true
  left join lateral (select max(c.completed_at) as last_cleaned_at,
                            (array_agg(p2.display_name order by c.completed_at desc))[1] as last_cleaned_by
                       from public.vessel_readiness_task c
                       left join public.profiles p2 on p2.id = c.completed_by
                      where c.location_id = l.id and c.state = 'DONE') cl on true
  left join lateral (select * from public.vessel_readiness_task t2
                      where t2.location_id = l.id and t2.state in ('PENDING', 'IN_PROGRESS') limit 1) t on true
  left join public.profiles pr on pr.id = t.assigned_to;
grant select on public.v_vessel_readiness to authenticated;

-- ── upcoming vessel needs, from the dependency projection (0109) ─────────────
create or replace view public.v_resource_need with (security_invoker = on) as
select p.master_batch_id, p.batch_code, p.activity_id, p.code as activity_code, p.title, p.scope_label,
       pa.scope::text as scope, m.location_kind::text as needs_kind, p.projected_start_at as needed_at,
       a.location_id as allocated_location_id, l.code as allocated_location,
       (select count(*) from public.v_vessel_readiness r
         where r.kind = m.location_kind::text and r.is_ready) as ready_count
  from public.v_activity_projection p
  join public.batch_activity ba on ba.id = p.activity_id
  join public.process_activity pa on pa.id = ba.process_activity_id
  join public.vessel_scope_map m on m.scope = pa.scope::text and m.location_kind is not null
  left join public.batch_vessel_allocation a
         on a.master_batch_id = p.master_batch_id and a.scope = pa.scope::text and a.instance_no = ba.instance_no
  left join public.location l on l.id = a.location_id
 where p.actual_end is null;
grant select on public.v_resource_need to authenticated;

-- ── the cleaning job ─────────────────────────────────────────────────────────
create or replace function public.request_vessel_cleaning(p_location uuid, p_for_batch uuid default null,
                                                          p_assigned_to uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public
as $fn$
declare loc location; v_id uuid; v_items jsonb;
begin
  perform public.assert_role(array['admin', 'manager']::app_role[], 'ask for a bunker or tunnel to be cleaned');
  select * into loc from location where id = p_location;
  if not found then raise exception 'No such bunker or tunnel.'; end if;
  if exists (select 1 from vessel_readiness_task t where t.location_id = p_location and t.state in ('PENDING', 'IN_PROGRESS')) then
    raise exception '% already has a cleaning job open.', loc.label using errcode = 'unique_violation';
  end if;
  -- the factory's own wording: the SOP's bunker preparation / cleaning, and the tunnel preparation lines
  v_items := case when loc.kind::text = 'TUNNEL'
    then '[{"key":"wash","label":"Tunnel washed","done":false},{"key":"net","label":"Gliding net tight over the grid","done":false},{"key":"probes","label":"Probes clean, dry and hung","done":false}]'::jsonb
    else '[{"key":"prep","label":"Bunker preparation","done":false},{"key":"clean","label":"Bunker cleaning","done":false}]'::jsonb end;
  insert into vessel_readiness_task (location_id, for_batch_id, checklist, note, requested_by, assigned_to)
  values (p_location, p_for_batch, v_items, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), p_assigned_to)
  returning id into v_id;
  insert into notification (master_batch_id, batch_activity_id, to_role, to_person_id, kind, message, reason, sent_by)
  values (p_for_batch, null, 'supervisor'::app_role, p_assigned_to, 'assignment',
          loc.label || ' needs cleaning before the next batch', p_note, auth.uid());
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'request_vessel_cleaning', 'vessel_readiness_task', v_id::text,
          jsonb_build_object('location', loc.code, 'for_batch', p_for_batch, 'assigned_to', p_assigned_to),
          coalesce(p_note, 'Cleaning requested'));
  return v_id;
end;
$fn$;

create or replace function public.assign_vessel_cleaning(p_task uuid, p_person uuid)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  perform public.assert_role(array['admin', 'manager']::app_role[], 'assign a cleaning job');
  update vessel_readiness_task set assigned_to = p_person where id = p_task and state in ('PENDING', 'IN_PROGRESS');
  if not found then raise exception 'That cleaning job is not open.' using errcode = 'check_violation'; end if;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'assign_vessel_cleaning', 'vessel_readiness_task', p_task::text,
          jsonb_build_object('assigned_to', p_person), 'Cleaning assigned');
end;
$fn$;

create or replace function public.start_vessel_cleaning(p_task uuid)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  perform public.assert_role(array['supervisor', 'admin', 'manager']::app_role[], 'start a cleaning job');
  update vessel_readiness_task
     set state = 'IN_PROGRESS', started_at = coalesce(started_at, now()), started_by = coalesce(started_by, auth.uid())
   where id = p_task and state in ('PENDING', 'IN_PROGRESS');
  if not found then raise exception 'That cleaning job is not open.' using errcode = 'check_violation'; end if;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'start_vessel_cleaning', 'vessel_readiness_task', p_task::text, 'Cleaning started');
end;
$fn$;

create or replace function public.attach_readiness_photo(p_task uuid, p_storage_path text)
returns uuid language plpgsql security definer set search_path = public
as $fn$
declare t vessel_readiness_task; obj record; v_id uuid;
begin
  perform public.assert_role(array['supervisor', 'admin', 'manager']::app_role[], 'add a cleaning photograph');
  select * into t from vessel_readiness_task where id = p_task;
  if not found then raise exception 'No such cleaning job.'; end if;
  if t.state not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'That cleaning job is already %.', t.state using errcode = 'check_violation';
  end if;
  if p_storage_path not like 'readiness/' || p_task::text || '/%' then
    raise exception 'A cleaning photograph is stored under readiness/<job>/<file>.' using errcode = 'check_violation';
  end if;
  select o.id, o.metadata into obj from storage.objects o where o.bucket_id = 'evidence' and o.name = p_storage_path;
  if not found then
    raise exception 'No file at evidence/% — upload it first.', p_storage_path using errcode = 'no_data_found';
  end if;
  if coalesce(nullif(obj.metadata->>'size', '')::bigint, 0) <= 0 then
    raise exception 'That file is empty (0 bytes). Take the photograph again.' using errcode = 'check_violation';
  end if;
  -- 0101 · one photograph, one record: the same file cannot be reused as evidence anywhere
  if nullif(obj.metadata->>'eTag', '') is not null and exists (
       select 1 from evidence_media m join storage.objects o2 on o2.bucket_id = 'evidence' and o2.name = m.storage_path
        where o2.metadata->>'eTag' = obj.metadata->>'eTag'
       union all
       select 1 from vessel_readiness_media m join storage.objects o2 on o2.bucket_id = 'evidence' and o2.name = m.storage_path
        where o2.metadata->>'eTag' = obj.metadata->>'eTag' and o2.name <> p_storage_path) then
    raise exception 'This photo has already been used. Take a new photo of the bunker or tunnel as it is now.'
      using errcode = 'check_violation';
  end if;
  insert into vessel_readiness_media (task_id, storage_path, mime_type, byte_size, uploaded_by)
  values (p_task, p_storage_path, nullif(obj.metadata->>'mimetype', ''), nullif(obj.metadata->>'size', '')::bigint, auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.complete_vessel_cleaning(p_task uuid, p_checklist jsonb, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $fn$
declare t vessel_readiness_task; loc location; v_missing text; v_photos int;
begin
  perform public.assert_role(array['supervisor', 'admin', 'manager']::app_role[], 'finish a cleaning job');
  select * into t from vessel_readiness_task where id = p_task for update;
  if not found then raise exception 'No such cleaning job.'; end if;
  if t.state not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'That cleaning job is already %.', t.state using errcode = 'check_violation';
  end if;
  select * into loc from location where id = t.location_id;

  select string_agg(item->>'label', ', ') into v_missing
    from jsonb_array_elements(t.checklist) item
   where coalesce((select (x->>'done')::boolean from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) x
                    where x->>'key' = item->>'key'), false) is not true;
  if v_missing is not null then
    raise exception 'Tick every item first: %', v_missing using errcode = 'check_violation';
  end if;
  select count(*) into v_photos from vessel_readiness_media where task_id = p_task;
  if v_photos = 0 then
    raise exception 'Take at least one photograph of the cleaned %.', lower(loc.kind::text) using errcode = 'check_violation';
  end if;

  update vessel_readiness_task
     set state = 'DONE', completed_at = now(), completed_by = auth.uid(),
         checklist = p_checklist, note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
   where id = p_task;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'complete_vessel_cleaning', 'vessel_readiness_task', p_task::text,
          jsonb_build_object('location', loc.code, 'photos', v_photos, 'checklist', p_checklist),
          coalesce(p_note, loc.label || ' cleaned and ready'));
end;
$fn$;

create or replace function public.cancel_vessel_cleaning(p_task uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  perform public.assert_role(array['admin', 'manager']::app_role[], 'cancel a cleaning job');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A cancellation needs a reason.' using errcode = 'check_violation'; end if;
  update vessel_readiness_task set state = 'CANCELLED', cancel_reason = trim(p_reason)
   where id = p_task and state in ('PENDING', 'IN_PROGRESS');
  if not found then raise exception 'That cleaning job is not open.' using errcode = 'check_violation'; end if;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'cancel_vessel_cleaning', 'vessel_readiness_task', p_task::text, trim(p_reason));
end;
$fn$;

revoke all on function public.request_vessel_cleaning(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.assign_vessel_cleaning(uuid, uuid) from public, anon;
revoke all on function public.start_vessel_cleaning(uuid) from public, anon;
revoke all on function public.attach_readiness_photo(uuid, text) from public, anon;
revoke all on function public.complete_vessel_cleaning(uuid, jsonb, text) from public, anon;
revoke all on function public.cancel_vessel_cleaning(uuid, text) from public, anon;
grant execute on function public.request_vessel_cleaning(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.assign_vessel_cleaning(uuid, uuid) to authenticated;
grant execute on function public.start_vessel_cleaning(uuid) to authenticated;
grant execute on function public.attach_readiness_photo(uuid, text) to authenticated;
grant execute on function public.complete_vessel_cleaning(uuid, jsonb, text) to authenticated;
grant execute on function public.cancel_vessel_cleaning(uuid, text) to authenticated;

notify pgrst, 'reload schema';
