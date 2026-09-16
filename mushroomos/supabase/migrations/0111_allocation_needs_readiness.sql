-- ─────────────────────────────────────────────────────────────────────────────
-- 0111 · ALLOCATION: EXACT ACTIVITY, AND READINESS IS CONSULTED (spec §6.8-§6.10, §9).
--
-- Two defects, both proven on the runtime before this file existed:
--   1 · allocate_vessel checked kind, status and occupancy but knew nothing about cleaning, so a bunker emptied by
--       batch A could be handed to batch B the same second. It now refuses a vessel that has been used and not
--       cleaned since (0110's v_vessel_readiness), naming the reason, by location id — other vessels are untouched.
--   2 · batch_vessel_allocation is keyed by (scope, instance_no), but PROCESS-2026J names each bunker and tunnel in
--       the ACTIVITY CODE (BNK-B1-FILL … BNK-B3-FILL) and leaves instance_no = 1 on all of them. So an allocation
--       for "bunker 3" matched every bunker activity, fn_track_occupancy found no distinct match, and NO occupancy
--       row was ever written (location_occupancy: 0 rows on the live database). allocate_vessel now takes the
--       activity code, stores it, and fn_track_occupancy matches on it first.
-- Rollback: db-rollback/pre_0111__allocation.sql (and drop column batch_vessel_allocation.activity_code).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.batch_vessel_allocation add column if not exists activity_code text;
-- the 5-argument allocate_vessel is replaced by the 6-argument one (an added default would make the call ambiguous)
drop function if exists public.allocate_vessel(uuid, text, integer, uuid, text);
create unique index if not exists batch_vessel_allocation_one_per_activity
  on public.batch_vessel_allocation (master_batch_id, activity_code) where activity_code is not null;

CREATE OR REPLACE FUNCTION public.allocate_vessel(p_batch uuid, p_scope text, p_instance_no integer, p_location uuid, p_note text DEFAULT NULL::text, p_activity_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m        vessel_scope_map;
  loc      location;
  clash    record;
  new_id   uuid;
begin
  -- 0101 · who may call this (cheat audit, 15 Sep 2026)
  perform public.assert_role(array['admin','manager']::app_role[], 'allocate a bunker or tunnel');
  select * into m from vessel_scope_map where scope = p_scope;
  if not found then
    raise exception 'Unknown process scope "%". Vessel scopes come from vessel_scope_map.', p_scope;
  end if;
  if m.location_kind is null then
    raise exception 'Scope "%" is not held in a vessel: %', p_scope, m.unmapped_reason
      using errcode = 'invalid_parameter_value';
  end if;

  select * into loc from location where id = p_location;
  if not found then raise exception 'No such location: %', p_location; end if;

  if loc.kind <> m.location_kind then
    raise exception '% needs a % — % is a %.',
      p_scope, m.location_kind, loc.label, loc.kind
      using errcode = 'invalid_parameter_value';
  end if;

  if loc.status is distinct from 'available' then
    raise exception '% is not available (status: %).', loc.label, loc.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- The double-allocation warning the document asks for, as a refusal. Only meaningful for an
  -- exclusive vessel; the yard is shared on purpose.
  -- 0111 · A USED VESSEL IS NOT READY UNTIL IT HAS BEEN CLEANED (0110). Exact resource only: bunker 1 being dirty
  -- never blocks bunker 2.
  if exists (select 1 from public.v_vessel_readiness r
              where r.location_id = p_location and not r.is_ready
                and r.occupied_by_batch_id is distinct from p_batch) then
    raise exception '% is not ready: %. Create a cleaning job for it and complete that first.',
      loc.label, coalesce((select r.not_ready_reason from public.v_vessel_readiness r where r.location_id = p_location),
                          'it has not been cleaned since it was last used')
      using errcode = 'check_violation';
  end if;

  if loc.is_exclusive then
    select mb.code, o.started_at into clash
      from location_occupancy o
      join master_batch mb on mb.id = o.master_batch_id
     where o.location_id = p_location
       and o.ended_at is null
       and o.master_batch_id <> p_batch
     limit 1;
    if found then
      raise exception '% is occupied by % since %, and has not been released.',
        loc.label, clash.code, to_char(clash.started_at, 'DD Mon HH24:MI')
        using errcode = 'exclusion_violation';
    end if;
  end if;

  insert into batch_vessel_allocation
    (activity_code, master_batch_id, scope, instance_no, location_id, conflict_id, note, allocated_by)
  values (nullif(trim(coalesce(p_activity_code, '')), ''), p_batch, p_scope, p_instance_no, p_location,
          m.conflict_id, p_note, auth.uid())
  on conflict (master_batch_id, scope, instance_no) do update set
    location_id  = excluded.location_id,
    conflict_id  = excluded.conflict_id,
    note         = excluded.note,
    allocated_by = excluded.allocated_by,
    allocated_at = now()
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'allocate_vessel', 'batch_vessel_allocation',
          new_id::text,
          jsonb_build_object('scope', p_scope, 'instance_no', p_instance_no, 'location', loc.code),
          format('%s %s of this batch is %s', p_scope, p_instance_no, loc.label));
  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_track_occupancy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pa   process_activity;
  alloc batch_vessel_allocation;
  excl boolean;
begin
  select * into pa from process_activity where id = new.process_activity_id;
  if not found or pa.scope is null then return new; end if;

  -- 0111 · PROCESS-2026J names each bunker/tunnel in the ACTIVITY CODE (BNK-B1-FILL, BNK-B2-FILL …) and leaves
  -- instance_no = 1 on all of them, so matching on instance_no alone tied every bunker to the same allocation and
  -- occupancy was never recorded. Prefer the allocation made for this exact activity code; fall back to the
  -- instance for processes that do use cardinality instances.
  select * into alloc from batch_vessel_allocation
   where master_batch_id = new.master_batch_id
     and scope = pa.scope::text
     and (activity_code = new.code or (activity_code is null and instance_no = new.instance_no))
   order by (activity_code = new.code) desc nulls last
   limit 1;
  if not found then return new; end if;          -- unallocated slot: record nothing, invent nothing

  -- WORK STARTED → the vessel is occupied from the recorded start, not from `now()`. An actual
  -- start backdated by an operator has to place the batch when it was actually there.
  if new.actual_start is not null and (old.actual_start is null) then
    select l.is_exclusive into excl from location l where l.id = alloc.location_id;
    insert into location_occupancy
      (location_id, master_batch_id, batch_activity_id, stream, started_at, is_exclusive, tbd_marker)
    values (alloc.location_id, new.master_batch_id, new.id, new.stream, new.actual_start,
            coalesce(excl, true), alloc.conflict_id)
    on conflict do nothing;
  end if;

  -- WORK FINISHED → close the window. `ended_at` is the recorded end for the same reason.
  if new.actual_end is not null and (old.actual_end is null) then
    update location_occupancy
       set ended_at = new.actual_end
     where batch_activity_id = new.id
       and ended_at is null;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';
