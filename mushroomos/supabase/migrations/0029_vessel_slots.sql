-- 0029 · What the vessel picker reads.
--
-- 0026 built the allocation engine and the refusal. It had no screen, so the demo's bunkers were
-- filled in by a script. This is the data that screen needs, and nothing more.
--
-- TWO VIEWS, because the picker asks two different questions:
--   "which slots does THIS batch have to fill?"   -> v_batch_vessel_slot
--   "which vessels are free, and if not, who has them?" -> v_vessel_availability

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The slots a batch needs, whether or not they are filled.
--
-- Derived from the plan that was actually generated - `PER_SCOPE_INSTANCE` activities grouped by
-- scope and instance - not from a fixed list of "every batch takes three bunkers". A batch whose
-- Day-0 config asked for four bunker lines shows four rows here without anyone editing this view.
--
-- An UNFILLED slot is a row with a null location. It has to be visible: the whole point of the
-- screen is to show Admin what she has not decided yet.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_batch_vessel_slot as
select
  ba.master_batch_id,
  pa.scope::text                  as scope,
  m.location_kind::text           as needs_kind,
  ba.instance_no,
  count(*)::int                   as activity_count,
  min(ba.rel_day)::int            as first_day,
  max(ba.rel_day)::int            as last_day,
  a.location_id,
  l.code                          as location_code,
  l.label                         as location_label,
  a.conflict_id,
  a.allocated_at,
  p.display_name                  as allocated_by_name,
  -- Has anything actually happened in this slot yet? Once it has, changing the vessel would
  -- rewrite history, and the screen says so rather than silently allowing it.
  bool_or(ba.actual_start is not null) as work_started
from public.batch_activity ba
join public.process_activity pa on pa.id = ba.process_activity_id
join public.vessel_scope_map m
     on m.scope = pa.scope::text and m.location_kind is not null
left join public.batch_vessel_allocation a
     on a.master_batch_id = ba.master_batch_id
    and a.scope = pa.scope::text
    and a.instance_no = ba.instance_no
left join public.location l on l.id = a.location_id
left join public.profiles p on p.id = a.allocated_by
group by ba.master_batch_id, pa.scope::text, m.location_kind, ba.instance_no,
         a.location_id, l.code, l.label, a.conflict_id, a.allocated_at, p.display_name;

grant select on public.v_batch_vessel_slot to authenticated;

comment on view public.v_batch_vessel_slot is
  'One row per vessel slot a batch needs - "BUNKER_LINE 2 of this batch". A null location_id is an '
  'UNFILLED slot and is the main thing the picker exists to show.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Every vessel, and who has it.
--
-- The picker must not offer a bunker that `allocate_vessel` is going to refuse. It shows the whole
-- fleet with the reason each unavailable one is unavailable, because "Bunker 7 is not in the list"
-- makes someone hunt, and "Bunker 7 is held by MB-2026-08-14" ends the question.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_vessel_availability as
select
  l.id                as location_id,
  l.kind::text        as kind,
  l.code,
  l.label,
  l.is_exclusive,
  l.status::text      as status,
  -- Physically occupied right now: an open occupancy window.
  occ.master_batch_id as occupied_by_batch_id,
  occ_mb.code         as occupied_by_batch,
  occ.started_at      as occupied_since,
  -- Spoken for by a plan, which may be a different batch from the one occupying it.
  alloc.master_batch_id as allocated_to_batch_id,
  alloc_mb.code         as allocated_to_batch
from public.location l
left join lateral (
  select o.master_batch_id, o.started_at
    from public.location_occupancy o
   where o.location_id = l.id and o.ended_at is null
   order by o.started_at limit 1
) occ on true
left join public.master_batch occ_mb on occ_mb.id = occ.master_batch_id
left join lateral (
  select a.master_batch_id
    from public.batch_vessel_allocation a
    join public.master_batch mb on mb.id = a.master_batch_id
   where a.location_id = l.id and mb.status in ('draft', 'active')
   order by a.allocated_at desc limit 1
) alloc on true
left join public.master_batch alloc_mb on alloc_mb.id = alloc.master_batch_id;

grant select on public.v_vessel_availability to authenticated;

comment on view public.v_vessel_availability is
  'Every vessel in the plant with the reason it is or is not available: occupied_by_batch is '
  'physical (an open occupancy), allocated_to_batch is planned. They can differ, and both matter.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Releasing a slot.
--
-- Admin changes her mind on a draft. Refused once work has started in that vessel, because the
-- occupancy rows are a record of where material physically was.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.release_vessel(
  p_batch uuid, p_scope text, p_instance_no int
) returns void language plpgsql security definer set search_path = public as $$
declare
  a  batch_vessel_allocation;
  n  int;
begin
  select * into a from batch_vessel_allocation
   where master_batch_id = p_batch and scope = p_scope and instance_no = p_instance_no;
  if not found then return; end if;

  select count(*) into n from location_occupancy o
   where o.location_id = a.location_id and o.master_batch_id = p_batch;
  if n > 0 then
    raise exception
      'Work has already been recorded in this vessel. Releasing it would rewrite where the '
      'material actually was.'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from batch_vessel_allocation where id = a.id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'release_vessel', 'batch_vessel_allocation',
          a.id::text, format('%s %s released', p_scope, p_instance_no));
end;
$$;

revoke all on function public.release_vessel(uuid, text, int) from public;
grant execute on function public.release_vessel(uuid, text, int) to authenticated;
