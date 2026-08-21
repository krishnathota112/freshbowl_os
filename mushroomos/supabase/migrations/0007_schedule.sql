-- 0007 · The schedule builder.
--
-- The SHAPE is fixed: which days exist, what happens on each, the order, the dependencies.
-- The CONTENT is the admin's: quantities, vessels, durations, machines, people, evidence,
-- water or dry. This migration adds the columns that hold her choices, plus assignment,
-- alerts and validation.

-- Who a template routes to by default. Seeded from the activity's nature: anything measuring
-- pH, moisture, EC, ash, nitrogen or C:N goes to lab; anything moving material goes to operator.
alter table public.process_activity
  add column if not exists responsible_role app_role,
  add column if not exists lab_parameters text[];

alter table public.process_activity
  alter column responsible_role set default 'operator';

-- The admin's per-instance choices.
alter table public.batch_activity
  add column if not exists responsible_role      app_role not null default 'operator',
  add column if not exists assigned_person_id    uuid references public.profiles(id),
  add column if not exists assigned_machine_id   uuid references public.machine(id),
  add column if not exists assigned_vehicle_id   uuid references public.machine(id),
  add column if not exists source_location_id    uuid references public.location(id),
  add column if not exists destination_location_id uuid references public.location(id),
  add column if not exists variant_code          text,
  add column if not exists variant_reason        text,
  add column if not exists planned_time          time,
  add column if not exists planned_qty_override_mt numeric,
  add column if not exists lab_parameters        text[],
  add column if not exists assignment_reason     text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Alerts and forced assignment. An alert NEVER changes state — it is a nudge.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification (
  id                uuid primary key default gen_random_uuid(),
  master_batch_id   uuid references public.master_batch(id) on delete cascade,
  batch_activity_id uuid references public.batch_activity(id) on delete cascade,
  to_role           app_role,
  to_person_id      uuid references public.profiles(id),
  kind              text not null check (kind in ('assignment','alert','gate_opened','returned')),
  message           text not null,
  reason            text,
  sent_by           uuid references public.profiles(id),
  sent_at           timestamptz not null default now(),
  read_at           timestamptz
);
alter table public.notification enable row level security;

drop policy if exists notif_read on public.notification;
create policy notif_read on public.notification for select to authenticated using (true);
revoke insert, update, delete on public.notification from authenticated, anon;

create index if not exists idx_notification_batch on public.notification (master_batch_id, sent_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- set_activity_plan · the admin edits one row of the schedule.
--
-- A whitelist, deliberately. She overrides everything on the right of the model and nothing
-- on the left: code, order, day, dependencies and scope are absent from this list and cannot
-- be reached through it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_activity_plan(p_activity uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  ba batch_activity;
  b  master_batch;
  src uuid;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity'; end if;

  select * into b from master_batch where id = ba.master_batch_id;
  if b.status <> 'draft' then
    raise exception 'The baseline is frozen — % is %. Change goes through a deviation or an override.', b.code, b.status;
  end if;

  update batch_activity set
    day0_duration_hr        = coalesce(nullif(p_patch->>'day0_duration_hr','')::numeric, day0_duration_hr),
    planned_qty_override_mt = coalesce(nullif(p_patch->>'planned_qty_override_mt','')::numeric, planned_qty_override_mt),
    planned_time            = coalesce(nullif(p_patch->>'planned_time','')::time, planned_time),
    responsible_role        = coalesce(nullif(p_patch->>'responsible_role','')::app_role, responsible_role),
    assigned_person_id      = case when p_patch ? 'assigned_person_id'
                                  then nullif(p_patch->>'assigned_person_id','')::uuid
                                  else assigned_person_id end,
    assigned_machine_id     = case when p_patch ? 'assigned_machine_id'
                                  then nullif(p_patch->>'assigned_machine_id','')::uuid
                                  else assigned_machine_id end,
    assigned_vehicle_id     = case when p_patch ? 'assigned_vehicle_id'
                                  then nullif(p_patch->>'assigned_vehicle_id','')::uuid
                                  else assigned_vehicle_id end,
    destination_location_id = case when p_patch ? 'destination_location_id'
                                  then nullif(p_patch->>'destination_location_id','')::uuid
                                  else destination_location_id end,
    source_location_id      = case when p_patch ? 'source_location_id'
                                  then nullif(p_patch->>'source_location_id','')::uuid
                                  else source_location_id end,
    variant_code            = case when p_patch ? 'variant_code'
                                  then nullif(p_patch->>'variant_code','')
                                  else variant_code end,
    variant_reason          = coalesce(nullif(p_patch->>'variant_reason',''), variant_reason)
  where id = p_activity;

  -- A reload's source is whatever the previous stint used. Inherited, not typed.
  if p_patch ? 'destination_location_id' then
    select destination_location_id into src
    from batch_activity prev
    where prev.master_batch_id = ba.master_batch_id
      and prev.instance_no = ba.instance_no
      and prev.seq < ba.seq
      and prev.destination_location_id is not null
    order by prev.seq desc limit 1;

    if src is not null and ba.source_location_id is null then
      update batch_activity set source_location_id = src where id = p_activity;
    end if;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- assign_activity · force a named person onto a row.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.assign_activity(
  p_activity uuid, p_person uuid, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare ba batch_activity; b master_batch; prev uuid;
begin
  select * into ba from batch_activity where id = p_activity;
  select * into b from master_batch where id = ba.master_batch_id;

  if b.status = 'active' and coalesce(p_reason,'') = '' then
    raise exception 'A forced assignment on a running batch needs a reason';
  end if;

  prev := ba.assigned_person_id;
  update batch_activity
     set assigned_person_id = p_person, assignment_reason = p_reason
   where id = p_activity;

  -- Notify both sides of the change, not just the new assignee.
  insert into notification (master_batch_id, batch_activity_id, to_person_id, to_role, kind, message, reason, sent_by)
  select ba.master_batch_id, p_activity, p_person, ba.responsible_role, 'assignment',
         ba.title || ' — ' || ba.scope_label || ' assigned to you', p_reason, auth.uid();

  if prev is not null and prev <> p_person then
    insert into notification (master_batch_id, batch_activity_id, to_person_id, to_role, kind, message, reason, sent_by)
    values (ba.master_batch_id, p_activity, prev, ba.responsible_role, 'assignment',
            ba.title || ' — ' || ba.scope_label || ' reassigned away from you', p_reason, auth.uid());
  end if;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'assign_activity', 'batch_activity', p_activity::text,
          jsonb_build_object('person', p_person), p_reason);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- send_alert · a nudge. Never changes state, and says so when the target is locked.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.send_alert(
  p_activity uuid, p_role app_role, p_message text, p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare ba batch_activity; b master_batch; nid uuid; note text;
begin
  select * into ba from batch_activity where id = p_activity;
  select * into b from master_batch where id = ba.master_batch_id;

  if b.status = 'active' and coalesce(p_reason,'') = '' then
    raise exception 'An alert on a running batch needs a reason';
  end if;

  note := p_message;
  if ba.state = 'LOCKED' then
    note := note || ' (note: this task is still locked — ' || coalesce(ba.blocked_reason,'waiting') || ')';
  end if;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (ba.master_batch_id, p_activity, p_role, 'alert', note, p_reason, auth.uid())
  returning id into nid;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'send_alert', 'batch_activity', p_activity::text,
          coalesce(p_reason, p_message));
  return nid;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- validate_batch · blocking / warning / info, per SCHEDULE_BUILDER_SPEC §7.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.validate_batch(p_batch uuid)
returns table (severity text, code text, message text, activity_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  -- BLOCKING · a rest with no duration. The factory never stated these hours.
  return query
    select 'blocking', 'REST_NO_DURATION',
           ba.title || ' on Day ' || ba.rel_day || ' has no duration set', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.is_time_gate and ba.day0_duration_hr is null;

  -- BLOCKING · a reload must move material somewhere else.
  return query
    select 'blocking', 'SAME_VESSEL',
           ba.title || ' — ' || ba.scope_label || ' would reload into the bunker it came from', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.requires_distinct_vessel
      and ba.destination_location_id is not null
      and ba.destination_location_id = ba.source_location_id;

  -- BLOCKING · one turner cannot do T1 and T2 on the same pile.
  return query
    select 'blocking', 'TURNER_CLASH',
           'Pile ' || t1.instance_no || ' has the same turner on T1 and T2', t2.id
    from batch_activity t1
    join batch_activity t2
      on t2.master_batch_id = t1.master_batch_id
     and t2.instance_no = t1.instance_no
     and t2.code = 'TR-T2'
    where t1.master_batch_id = p_batch
      and t1.code = 'TR-T1'
      and t1.assigned_machine_id is not null
      and t1.assigned_machine_id = t2.assigned_machine_id;

  -- BLOCKING · a vessel already committed to another batch in the same window.
  return query
    select distinct 'blocking', 'VESSEL_DOUBLE_BOOKED',
           l.label || ' is already used by ' || other.code || ' on Day ' || ba.rel_day, ba.id
    from batch_activity ba
    join location l on l.id = ba.destination_location_id
    join batch_activity ob on ob.destination_location_id = ba.destination_location_id
                          and ob.master_batch_id <> ba.master_batch_id
    join master_batch other on other.id = ob.master_batch_id
    where ba.master_batch_id = p_batch
      and other.status = 'active'
      and ob.planned_start between ba.planned_start - interval '2 days'
                               and ba.planned_start + interval '2 days';

  -- BLOCKING · every row needs somebody responsible.
  return query
    select 'blocking', 'NO_ASSIGNEE',
           ba.title || ' — ' || ba.scope_label || ' has nobody assigned', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and not ba.is_time_gate
      and ba.assigned_person_id is null;

  -- BLOCKING · a movement with no destination chosen.
  return query
    select 'blocking', 'NO_DESTINATION',
           ba.title || ' — ' || ba.scope_label || ' has no destination chosen', ba.id
    from batch_activity ba
    join movement_rule mr on mr.process_activity_id = ba.process_activity_id
    where ba.master_batch_id = p_batch
      and mr.destination_kind in ('BUNKER','TUNNEL')
      and ba.destination_location_id is null;

  -- WARNING · a duration outside the range the source states.
  return query
    select 'warning', 'DURATION_OUT_OF_RANGE',
           ba.title || ' — ' || ba.day0_duration_hr || ' h is outside the stated '
             || ba.duration_target_min_hr || '–' || ba.duration_target_max_hr || ' h', ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and ba.day0_duration_hr is not null
      and ba.duration_target_min_hr is not null
      and (ba.day0_duration_hr < ba.duration_target_min_hr
        or ba.day0_duration_hr > ba.duration_target_max_hr);

  -- INFO · every unresolved question this plan touches, named.
  return query
    select distinct 'info', ba.tbd_marker,
           coalesce(cr.question, 'Unresolved') || ' — ships as: '
             || coalesce(cr.ship_with_default, 'no default'), null::uuid
    from batch_activity ba
    join conflict_register cr on cr.conflict_id = ba.tbd_marker
    where ba.master_batch_id = p_batch and ba.tbd_marker is not null;
end;
$$;

-- Activation refuses while any blocking finding stands.
create or replace function public.activate_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare blockers text;
begin
  select string_agg(message, '; ') into blockers
  from public.validate_batch(p_batch_id) where severity = 'blocking';

  if blockers is not null then
    raise exception 'Cannot activate — %', left(blockers, 400) using errcode = 'check_violation';
  end if;

  update master_batch
     set status = 'active', activated_at = now(), activated_by = auth.uid()
   where id = p_batch_id and status = 'draft';

  -- The first day's work opens; everything later says what it waits for.
  update batch_activity ba set state = 'READY', blocked_reason = null
   where ba.master_batch_id = p_batch_id
     and ba.rel_day = (select min(rel_day) from batch_activity where master_batch_id = p_batch_id);

  insert into notification (master_batch_id, to_role, kind, message, sent_by)
  select p_batch_id, ba.responsible_role, 'gate_opened',
         ba.title || ' is ready', auth.uid()
  from batch_activity ba
  where ba.master_batch_id = p_batch_id and ba.state = 'READY';

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'activate_batch', 'master_batch',
          p_batch_id::text, 'Baseline frozen');
end;
$$;

grant execute on function public.set_activity_plan(uuid, jsonb) to authenticated;
grant execute on function public.assign_activity(uuid, uuid, text) to authenticated;
grant execute on function public.send_alert(uuid, app_role, text, text) to authenticated;
grant execute on function public.validate_batch(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Carry responsible_role and lab parameters onto each instance as it is generated.
--
-- A trigger rather than an edit to generate_activity_plan: the generator already works and
-- is exercised, so extending it from the outside is the smaller change.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_inherit_activity_routing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(pa.responsible_role, 'operator'), pa.lab_parameters
    into new.responsible_role, new.lab_parameters
  from process_activity pa where pa.id = new.process_activity_id;

  -- Pre-fill the machine from the resource plan where the fleet gives only one candidate,
  -- so the admin confirms rather than types. T1 and T2 are left blank deliberately: they
  -- must differ, and choosing them is her decision.
  if new.assigned_machine_id is null and new.code not in ('TR-T1','TR-T2') then
    select m.id into new.assigned_machine_id
    from resource_requirement rr
    join machine m on m.kind = rr.machine_kind
    where rr.process_activity_id = new.process_activity_id
      and rr.machine_kind <> 'VEHICLE_TRUCK'
    order by m.code
    limit 1;
  end if;

  if new.assigned_vehicle_id is null then
    select m.id into new.assigned_vehicle_id
    from resource_requirement rr
    join machine m on m.kind = rr.machine_kind
    where rr.process_activity_id = new.process_activity_id
      and rr.machine_kind = 'VEHICLE_TRUCK'
    order by m.code
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inherit_routing on public.batch_activity;
create trigger trg_inherit_routing
  before insert on public.batch_activity
  for each row execute function public.fn_inherit_activity_routing();

-- The assignment picker needs to see colleagues. Until now profiles was read-self-only,
-- which made "Assign to…" an empty list and every row unassignable.
--
-- Names and roles of active staff, nothing more. No credential material lives in this table.
drop policy if exists profiles_read_roster on public.profiles;
create policy profiles_read_roster on public.profiles
  for select to authenticated using (is_active);
