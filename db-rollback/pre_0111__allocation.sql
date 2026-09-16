CREATE OR REPLACE FUNCTION public.allocate_vessel(p_batch uuid, p_scope text, p_instance_no integer, p_location uuid, p_note text DEFAULT NULL::text)
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
    (master_batch_id, scope, instance_no, location_id, conflict_id, note, allocated_by)
  values (p_batch, p_scope, p_instance_no, p_location, m.conflict_id, p_note, auth.uid())
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

  select * into alloc from batch_vessel_allocation
   where master_batch_id = new.master_batch_id
     and scope = pa.scope::text
     and instance_no = new.instance_no;
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
