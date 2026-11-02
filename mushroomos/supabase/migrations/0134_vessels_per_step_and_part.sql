-- ─────────────────────────────────────────────────────────────────────────────
-- 0134 · BUNKERS AND TUNNELS FOLLOW THE BATCHES THAT ARE IN THEM.   (owner, 25 Sep 2026)
--
-- WHY. The Resources screen showed every bunker and tunnel "READY · Never used" while nine batches were running.
-- Proved on the live database: batch_vessel_allocation 0 rows, location_occupancy 0 rows — and the allocation
-- model could not have held the factory's real state even if someone had tried:
--   · UNIQUE (master_batch_id, scope, instance_no): every bunker-line step has scope BUNKER_LINE, instance 1, so a
--     batch could hold ONE bunker — but its three parts sit in three bunkers (170 → 12, 5, 6).
--   · UNIQUE (master_batch_id, location_id) and "one allocation per activity": a step could not use two vessels —
--     but 176,177,178 rests in Bunkers 3 AND 4, 179,180,181 in 14 AND 15.
--   · The kind a step needs came only from vessel_scope_map (BUNKER_LINE → BUNKER), so PROCESS-2026M's per-part
--     tunnel steps (scope BUNKER_LINE, stream TUNNEL) would have been refused a tunnel.
--   · Bunkers 12–17 are on the factory board and not in `location`.
--   · Occupancy was written only if a step was allocated BEFORE its start was recorded, one step at a time: a tunnel
--     would have read "needs cleaning" the moment Conditioning 2 ended, with the compost still inside it.
--
-- WHAT CHANGES
--   1 · location: Bunker 12 … Bunker 17 (exclusive, available).
--   2 · batch_vessel_allocation: unique per (batch, activity code, vessel). The three old keys go.
--   3 · public.vessel_kind_for(activity): TUNNEL-stream steps need a tunnel, BUNKER-stream steps a bunker, anything
--       else what vessel_scope_map says (unchanged for the other scopes).
--   4 · allocate_vessel (same signature, same checks — kind, status, readiness 0111, exclusivity): replaces this
--       step's allocation; if the step has already started, the vessel is occupied from its recorded start.
--   5 · allocate_vessels(activity, vessels[], note, since): Admin places a step in one or more vessels; for a step
--       already running (onboarding) the occupancy starts at the step's actual start, or at `since` when the
--       material entered this vessel later (a move). Same checks per vessel.
--   6 · fn_track_occupancy: every vessel of the step; a step with no allocation of its own STAYS in the vessel(s) of
--       the previous step of the same part (same stream + scope label) — material does not leave a vessel unless an
--       allocation says so. The inherited allocation is written down (note "stays in …").
--   7 · v_resource_need: needs the kind from (3), matches allocations by activity code, and lists only each part's
--       next step when that part is in no vessel yet — not every step of every tunnel.
-- Rollback: db-rollback/pre_0134__vessels.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · the missing bunkers
insert into public.location (kind, code, label, is_persistent, is_exclusive, status)
select 'BUNKER', 'BUNKER-' || n, 'Bunker ' || n::int, true, true, 'available'
  from (select lpad(g::text, 2, '0') n from generate_series(12, 17) g) s
 where not exists (select 1 from public.location l where l.code = 'BUNKER-' || s.n);

-- 2 · one row per (batch, step, vessel)
alter table public.batch_vessel_allocation drop constraint if exists batch_vessel_allocation_master_batch_id_scope_instance_no_key;
drop index if exists public.batch_vessel_allocation_master_batch_id_scope_instance_no_key;
drop index if exists public.uq_bva_batch_location;
drop index if exists public.batch_vessel_allocation_one_per_activity;
create unique index if not exists batch_vessel_allocation_step_vessel
  on public.batch_vessel_allocation (master_batch_id, activity_code, location_id) where activity_code is not null;

-- 3 · which kind of vessel a step needs
create or replace function public.vessel_kind_for(p_activity uuid) returns text
language sql stable security definer set search_path = public as $fn$
  select case ba.stream::text
           when 'TUNNEL' then 'TUNNEL'
           when 'BUNKER' then 'BUNKER'
           else (select m.location_kind::text from vessel_scope_map m where m.scope = pa.scope::text)
         end
    from batch_activity ba join process_activity pa on pa.id = ba.process_activity_id
   where ba.id = p_activity;
$fn$;
grant execute on function public.vessel_kind_for(uuid) to authenticated;

-- shared checks for one vessel
create or replace function public.vessel_allocation_check(p_batch uuid, p_location uuid, p_kind text)
returns location language plpgsql stable security definer set search_path = public as $fn$
declare
  loc   location;
  clash record;
begin
  select * into loc from location where id = p_location;
  if not found then raise exception 'No such location: %', p_location; end if;
  if p_kind is not null and loc.kind::text <> p_kind then
    raise exception 'This step needs a % — % is a %.', lower(p_kind), loc.label, lower(loc.kind::text)
      using errcode = 'invalid_parameter_value';
  end if;
  if loc.kind::text not in ('BUNKER', 'TUNNEL') then
    raise exception '% is not a bunker or tunnel.', loc.label using errcode = 'invalid_parameter_value';
  end if;
  if loc.status is distinct from 'available' then
    raise exception '% is not available (status: %).', loc.label, loc.status using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from v_vessel_readiness r
              where r.location_id = p_location and not r.is_ready and r.occupied_by_batch_id is distinct from p_batch) then
    raise exception '% is not ready: %. Create a cleaning job for it and complete that first.', loc.label,
      coalesce((select r.not_ready_reason from v_vessel_readiness r where r.location_id = p_location),
               'it has not been cleaned since it was last used')
      using errcode = 'check_violation';
  end if;
  if loc.is_exclusive then
    select mb.code, o.started_at into clash
      from location_occupancy o join master_batch mb on mb.id = o.master_batch_id
     where o.location_id = p_location and o.ended_at is null and o.master_batch_id <> p_batch
     limit 1;
    if found then
      raise exception '% is occupied by % since %, and has not been released.',
        loc.label, clash.code, to_char(clash.started_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI')
        using errcode = 'exclusion_violation';
    end if;
  end if;
  return loc;
end;
$fn$;
revoke all on function public.vessel_allocation_check(uuid, uuid, text) from public, anon, authenticated;

-- place one step in its vessels (replacing what it had); occupy from its recorded start when it has one
create or replace function public.place_step_in_vessels(p_activity uuid, p_locations uuid[], p_note text, p_since timestamptz)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  ba   batch_activity;
  pa   process_activity;
  kind text;
  loc  location;
  lid  uuid;
  n    int := 0;
  from_at timestamptz;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such task: %', p_activity; end if;
  select * into pa from process_activity where id = ba.process_activity_id;
  kind := vessel_kind_for(p_activity);
  if kind is null and exists (select 1 from location l where l.id = any (p_locations) and l.kind::text <> 'BUNKER') then
    raise exception '% is not a tunnel step.', ba.title using errcode = 'invalid_parameter_value';
  end if;

  delete from location_occupancy where batch_activity_id = ba.id and ended_at is null;
  delete from batch_vessel_allocation where master_batch_id = ba.master_batch_id and activity_code = ba.code;

  foreach lid in array p_locations loop
    loc := vessel_allocation_check(ba.master_batch_id, lid, coalesce(kind, 'BUNKER'));
    insert into batch_vessel_allocation (activity_code, master_batch_id, scope, instance_no, location_id, note, allocated_by)
    values (ba.code, ba.master_batch_id, pa.scope::text, coalesce(ba.instance_no, 1), lid, p_note, auth.uid());
    if ba.actual_start is not null then
      from_at := greatest(ba.actual_start, coalesce(p_since, ba.actual_start));
      insert into location_occupancy (location_id, master_batch_id, batch_activity_id, stream, started_at, ended_at, is_exclusive)
      values (lid, ba.master_batch_id, ba.id, ba.stream, from_at, ba.actual_end, loc.is_exclusive);
    end if;
    n := n + 1;
  end loop;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), current_app_role(), 'allocate_vessels', 'batch_activity', ba.id::text,
          jsonb_build_object('locations', (select jsonb_agg(code order by code) from location where id = any (p_locations)),
                             'since', p_since, 'occupied', ba.actual_start is not null),
          coalesce(p_note, ba.title || ' placed in ' || (select string_agg(label, ' + ' order by code) from location where id = any (p_locations))));
  return n;
end;
$fn$;
revoke all on function public.place_step_in_vessels(uuid, uuid[], text, timestamptz) from public, anon, authenticated;

-- 5 · Admin: one step, one or more vessels
create or replace function public.allocate_vessels(p_activity uuid, p_locations uuid[], p_note text default null, p_since timestamptz default null)
returns integer language plpgsql security definer set search_path = public as $fn$
begin
  perform assert_role(array['admin','manager']::app_role[], 'place a batch in a bunker or tunnel');
  if coalesce(array_length(p_locations, 1), 0) = 0 then raise exception 'Name at least one bunker or tunnel.'; end if;
  return place_step_in_vessels(p_activity, p_locations, p_note, p_since);
end;
$fn$;
revoke all on function public.allocate_vessels(uuid, uuid[], text, timestamptz) from public, anon;
grant execute on function public.allocate_vessels(uuid, uuid[], text, timestamptz) to authenticated;

-- 4 · the existing entry point (Resources screen), same signature
create or replace function public.allocate_vessel(p_batch uuid, p_scope text, p_instance_no integer, p_location uuid,
                                                  p_note text default null, p_activity_code text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  act uuid;
  new_id uuid;
begin
  perform assert_role(array['admin','manager']::app_role[], 'allocate a bunker or tunnel');
  select id into act from batch_activity
   where master_batch_id = p_batch and code = nullif(trim(coalesce(p_activity_code, '')), '');
  if act is null then
    raise exception 'Name the step (activity code) this bunker or tunnel is for.' using errcode = 'invalid_parameter_value';
  end if;
  perform place_step_in_vessels(act, array[p_location], p_note, null);
  select id into new_id from batch_vessel_allocation
   where master_batch_id = p_batch and activity_code = p_activity_code and location_id = p_location;
  return new_id;
end;
$fn$;

-- 6 · occupancy follows the step, and the material stays where it is unless moved
create or replace function public.fn_track_occupancy() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  prev  batch_activity;
  a     record;
  n     int;
begin
  if new.actual_start is not null and old.actual_start is null then
    select count(*) into n from batch_vessel_allocation where master_batch_id = new.master_batch_id and activity_code = new.code;
    if n = 0 then
      -- no allocation of its own: it stays in the vessel(s) of the previous step of the same part
      select * into prev from batch_activity e
       where e.master_batch_id = new.master_batch_id and e.stream = new.stream and e.scope_label is not distinct from new.scope_label
         and e.id <> new.id and e.actual_start is not null and e.actual_start <= new.actual_start
         and exists (select 1 from batch_vessel_allocation x where x.master_batch_id = e.master_batch_id and x.activity_code = e.code)
       order by e.actual_start desc limit 1;
      if found then
        insert into batch_vessel_allocation (activity_code, master_batch_id, scope, instance_no, location_id, note, allocated_by)
        select new.code, new.master_batch_id, x.scope, x.instance_no, x.location_id,
               'stays in the vessel of ' || prev.title, x.allocated_by
          from batch_vessel_allocation x where x.master_batch_id = prev.master_batch_id and x.activity_code = prev.code
        on conflict do nothing;
      end if;
    end if;
    for a in select x.location_id, l.is_exclusive from batch_vessel_allocation x join location l on l.id = x.location_id
              where x.master_batch_id = new.master_batch_id and x.activity_code = new.code loop
      insert into location_occupancy (location_id, master_batch_id, batch_activity_id, stream, started_at, is_exclusive)
      values (a.location_id, new.master_batch_id, new.id, new.stream, new.actual_start, coalesce(a.is_exclusive, true))
      on conflict do nothing;
    end loop;
  end if;

  if new.actual_end is not null and old.actual_end is null then
    update location_occupancy set ended_at = new.actual_end where batch_activity_id = new.id and ended_at is null;
  end if;
  return new;
end;
$fn$;

-- 7 · what the batches will need: each part's next step, while that part is in no vessel
create or replace view public.v_resource_need with (security_invoker = on) as
with steps as (
  select p.master_batch_id, p.batch_code, p.activity_id, p.code as activity_code, p.title, p.scope_label,
         pa.scope::text as scope, public.vessel_kind_for(ba.id) as needs_kind, p.projected_start_at as needed_at,
         ba.stream, ba.baseline_start_hour,
         row_number() over (partition by p.master_batch_id, ba.stream, ba.scope_label
                            order by ba.baseline_start_hour nulls last, ba.seq) as nth
    from public.v_activity_projection p
    join public.batch_activity ba on ba.id = p.activity_id
    join public.process_activity pa on pa.id = ba.process_activity_id
   where p.actual_end is null and coalesce(ba.responsible_role::text, '') <> 'lab_tech'
)
select s.master_batch_id, s.batch_code, s.activity_id, s.activity_code, s.title, s.scope_label, s.scope, s.needs_kind,
       s.needed_at, a.location_id as allocated_location_id, l.code as allocated_location,
       (select count(*) from public.v_vessel_readiness r where r.kind = s.needs_kind and r.is_ready) as ready_count
  from steps s
  left join public.batch_vessel_allocation a on a.master_batch_id = s.master_batch_id and a.activity_code = s.activity_code
  left join public.location l on l.id = a.location_id
 where s.needs_kind is not null and s.nth = 1
   and not exists (select 1 from public.batch_activity e
                     join public.batch_vessel_allocation x on x.master_batch_id = e.master_batch_id and x.activity_code = e.code
                    where e.master_batch_id = s.master_batch_id and e.stream = s.stream
                      and e.scope_label is not distinct from s.scope_label and e.code <> s.activity_code);
grant select on public.v_resource_need to authenticated;
