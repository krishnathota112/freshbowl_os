-- 0025 · Vessel allocation — binding a batch to the physical plant.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS WRONG, IN THREE NUMBERS
--
--   736 of 800 batch activities had NO location at all.
--   `location_occupancy` — the table built to answer "which batch is in which vessel right now" —
--   had ZERO rows. It was created in 0021 and never written to.
--   11 bunkers and 12 tunnels exist in `location`, and essentially nothing referenced them.
--
-- The system modelled the PROCESS — day 5, line 2 of 3, stream PRIMARY_FIBRE — but not the PLANT.
-- `batch_activity.scope_label` reads 'Tunnel 1 of 3', which is a RELATIVE SLOT, not Tunnel 7. So
-- the product could say a batch uses three tunnels and could not say which three.
--
-- Everything downstream of that was unbuildable: the bunker and tunnel utilisation plans the client
-- document asks for in §1, its double-allocation conflict warning, its bunker-wise and tunnel-wise
-- performance reports in §9, the traceability chain in §7 that has to name which tunnel supplied
-- which room — and any drawn map of the factory, because the data did not say where anything was.
--
-- This migration binds slot → vessel, and writes occupancy as work happens.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Which KIND of vessel does a process scope need?
--
-- SEEDED ONLY WHERE THE SOURCES STATE IT. `process_activity.cardinality_rule` already carries
-- `{"kind":"PER_SCOPE_INSTANCE","scope":"TUNNEL"}` and `..."scope":"BUNKER_LINE"`, so the process
-- definition names the scope. What it does NOT say is which physical vessel kind each scope is.
--
--   TUNNEL       → TUNNEL.  The scope and the location kind are the same word. Unambiguous.
--   BUNKER_LINE  → BUNKER, PROVISIONALLY, and marked. A batch takes three BUNKER_LINE instances and
--                  the plant has eleven bunkers, so one line per bunker fits — but no source states
--                  whether a "bunker line" IS a bunker or a lane within one. TBD-57.
--   PILE, STRAW_PILE → LEFT UNMAPPED. Piles sit in the yard, which is non-exclusive and undivided;
--                  nothing states how many pile positions a yard has or whether they are tracked.
--   LOAD, MASTER, INDIVIDUAL_BATCH → no vessel. A load is a truck, not a place.
--
-- A mapping table rather than a CASE expression in a function, for the usual reason: the factory
-- can correct a row without anyone touching code, and an unmapped scope is visible as an absent row
-- instead of silently falling through to a default.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.vessel_scope_map (
  scope          text primary key,
  location_kind  location_kind,
  -- Null `location_kind` is a STATED absence, and this says why. Never blank.
  unmapped_reason text,
  conflict_id    text references public.conflict_register(conflict_id),
  source_ref     text not null,
  constraint vessel_scope_map_states_itself
    check (location_kind is not null or unmapped_reason is not null)
);
alter table public.vessel_scope_map enable row level security;

insert into public.conflict_register
  (conflict_id, kind, severity, question, sources, ship_with_default, status, blocks_phase)
values (
  'TBD-57', 'tbd', 'blocks_behaviour',
  'Is a "bunker line" one bunker, or a lane within a bunker?',
  'PROCESS-2026B scopes ten activities to BUNKER_LINE and a batch takes three instances. `location` '
  'holds eleven exclusive BUNKER rows labelled "Bunker 1".."Bunker 11". One line per bunker fits the '
  'counts, but no source states the relationship, and if a bunker holds several lines then eleven '
  'bunkers is not eleven lines and the whole capacity plan changes.',
  'BUNKER_LINE is mapped to BUNKER so allocation works, and every allocation made under that '
  'reading carries this marker. If the answer is lanes-within-a-bunker, the mapping row changes and '
  'the marked allocations are the exact list to revisit.',
  'open', 'Plant view'
)
on conflict (conflict_id) do nothing;

insert into public.vessel_scope_map (scope, location_kind, unmapped_reason, conflict_id, source_ref) values
  ('TUNNEL',           'TUNNEL', null, null,
   'PROCESS-2026B cardinality_rule scope=TUNNEL; location.kind=TUNNEL. Same word, no inference.'),
  ('BUNKER_LINE',      'BUNKER', null, 'TBD-57',
   'PROCESS-2026B cardinality_rule scope=BUNKER_LINE. Mapped provisionally — see TBD-57.'),
  ('PILE',             null,
   'Piles sit in the yard, which is non-exclusive and undivided. No source states how many pile '
   'positions exist or whether a pile position is tracked as a place at all.', null,
   'PROCESS-2026B cardinality_rule scope=PILE; location has one YARD row.'),
  ('STRAW_PILE',       null,
   'As PILE. The straw pile is a heap in the yard, not an addressable vessel in any source.', null,
   'PROCESS-2026B cardinality_rule scope=STRAW_PILE.'),
  ('LOAD',             null,
   'A load is a vehicle, not a place. It has a weighbridge slip, not a vessel.', null,
   'PROCESS-2026B cardinality_rule scope=LOAD.'),
  ('MASTER',           null, 'Whole-batch scope. Not situated in one vessel.', null, 'PROCESS-2026B.'),
  ('INDIVIDUAL_BATCH', null, 'Whole-batch scope. Not situated in one vessel.', null, 'PROCESS-2026B.')
on conflict (scope) do update set
  location_kind   = excluded.location_kind,
  unmapped_reason = excluded.unmapped_reason,
  conflict_id     = excluded.conflict_id,
  source_ref      = excluded.source_ref;

grant select on public.vessel_scope_map to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The allocation itself: this batch's slot N of this scope IS this vessel.
--
-- The client document settles who decides. §1 lists "Planned bunker numbers / Planned tunnel
-- numbers / Planned growing-room numbers" as monthly-planning fields, and asks for a "conflict
-- warning where the same bunker, tunnel or room is allocated to two batches". So: a PERSON names
-- the vessel and the SYSTEM refuses a collision. Nothing here auto-assigns.
--
-- Keyed on (batch, scope, instance_no) — the slot — because that is what `scope_label` already
-- counts. 'Tunnel 2 of 3' is scope TUNNEL, instance_no 2.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.batch_vessel_allocation (
  id              uuid primary key default gen_random_uuid(),
  master_batch_id uuid not null references public.master_batch(id) on delete cascade,
  scope           text not null references public.vessel_scope_map(scope),
  instance_no     int  not null check (instance_no >= 1),
  location_id     uuid not null references public.location(id),
  -- Carried onto every allocation made under an unanswered reading. TBD-57 is the live one.
  conflict_id     text references public.conflict_register(conflict_id),
  note            text,
  allocated_by    uuid references public.profiles(id),
  allocated_at    timestamptz not null default now(),
  unique (master_batch_id, scope, instance_no)
);
alter table public.batch_vessel_allocation enable row level security;

create index if not exists idx_bva_location on public.batch_vessel_allocation (location_id);

-- One vessel cannot be two slots of the same batch. 'Tunnel 1 of 3' and 'Tunnel 2 of 3' are two
-- tunnels; pointing both at Tunnel 7 is a data-entry slip, not a plan.
create unique index if not exists uq_bva_batch_location
  on public.batch_vessel_allocation (master_batch_id, location_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Occupancy needs to know whether the vessel is exclusive.
--
-- 0021 put a GiST exclusion constraint on `location_occupancy` — `exclude using gist (location_id
-- with =, during with &&)` — which is exactly the double-booking guarantee the client document asks
-- for, and it was never exercised because the table was empty.
--
-- But it applies to EVERY location, and two of them are not exclusive: the yard and the hopper line
-- are shared by design (`location.is_exclusive = false`). Writing real occupancy would have made
-- the second batch onto the yard fail with a constraint violation.
--
-- An exclusion predicate cannot reach into another table, so exclusivity is denormalised onto the
-- occupancy row and the constraint is rebuilt with `where (is_exclusive)`. Copied at insert from
-- the location, never passed in by a caller.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.location_occupancy
  add column if not exists is_exclusive boolean not null default true;

update public.location_occupancy o
   set is_exclusive = l.is_exclusive
  from public.location l
 where l.id = o.location_id and o.is_exclusive is distinct from l.is_exclusive;

alter table public.location_occupancy drop constraint if exists location_occupancy_no_overlap;
alter table public.location_occupancy
  add constraint location_occupancy_no_overlap
  exclude using gist (location_id with =, during with &&) where (is_exclusive);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Allocate a vessel, or refuse and say who has it.
--
-- The refusal names the batch holding the vessel and the window. "Tunnel 7 is taken" sends someone
-- hunting; "Tunnel 7 is held by MB-2026-08-14 from 14 Aug 05:00" ends the question.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.allocate_vessel(
  p_batch       uuid,
  p_scope       text,
  p_instance_no int,
  p_location    uuid,
  p_note        text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  m        vessel_scope_map;
  loc      location;
  clash    record;
  new_id   uuid;
begin
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
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Occupancy follows the work, automatically.
--
-- A TRIGGER, not an edit to `start_activity`. Adding this to the RPC would have meant reopening a
-- function that already carries the gate checks and the effective-pair guards, and a previous pass
-- through this codebase regressed exactly those by rewriting a function rather than adding beside
-- it. This is additive: it observes the state change and writes a row.
--
-- The vessel comes from the ALLOCATION, keyed by the activity's own scope and instance_no. An
-- activity whose slot has not been allocated writes nothing — it does not guess a vessel, and the
-- plant view shows the batch as unplaced rather than placed somewhere invented.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_track_occupancy()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;

drop trigger if exists trg_track_occupancy on public.batch_activity;
create trigger trg_track_occupancy
  after update of actual_start, actual_end on public.batch_activity
  for each row execute function public.fn_track_occupancy();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · THE PLANT, RIGHT NOW.
--
-- Every vessel the factory has, in one answer: what is in it, whose it is, since when, and what is
-- happening in it. A vessel with nothing in it says so — an empty bunker is a fact a planner needs,
-- and it is the difference between a list of batches and a view of a factory.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_plant_now as
select
  l.id                as location_id,
  l.kind::text        as kind,
  l.code,
  l.label,
  l.is_exclusive,
  l.status::text      as location_status,
  o.master_batch_id,
  mb.code             as batch_code,
  mb.label            as batch_label,
  o.started_at        as occupied_since,
  o.stream::text      as stream,
  ba.id               as activity_id,
  ba.title            as activity_title,
  ba.scope_label,
  ba.state::text      as activity_state,
  -- The batch's own hour, so a vessel reads on the same clock as everything else in the product.
  case
    when mb.start_at is not null
      then floor(extract(epoch from (now() - mb.start_at)) / 3600)::int + 1
  end                 as batch_hour,
  o.tbd_marker,
  -- What is ALLOCATED here but has not started yet — an empty tunnel that is spoken for is not the
  -- same as an empty tunnel, and a planner needs to see the difference.
  (select count(*)::int from batch_vessel_allocation a
    where a.location_id = l.id
      and not exists (select 1 from location_occupancy oo
                       where oo.location_id = l.id and oo.ended_at is null)) as allocated_not_started
from public.location l
left join public.location_occupancy o
       on o.location_id = l.id and o.ended_at is null
left join public.master_batch mb on mb.id = o.master_batch_id
left join public.batch_activity ba on ba.id = o.batch_activity_id;

grant select on public.v_plant_now to authenticated;

comment on view public.v_plant_now is
  'Every vessel in the plant and what is in it right now. A row with a null batch_code is an EMPTY '
  'vessel, which is information a planner needs - not a row to filter out.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · What a batch is allocated, slot by slot — for the batch page and for §1's utilisation plan.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_batch_vessel as
select
  a.master_batch_id,
  mb.code            as batch_code,
  a.scope,
  a.instance_no,
  a.location_id,
  l.kind::text       as kind,
  l.code             as location_code,
  l.label            as location_label,
  a.conflict_id,
  a.note,
  p.display_name     as allocated_by_name,
  a.allocated_at,
  (select min(o.started_at) from location_occupancy o
    where o.location_id = a.location_id and o.master_batch_id = a.master_batch_id) as first_occupied,
  (select bool_or(o.ended_at is null) from location_occupancy o
    where o.location_id = a.location_id and o.master_batch_id = a.master_batch_id) as currently_in
from public.batch_vessel_allocation a
join public.location l on l.id = a.location_id
join public.master_batch mb on mb.id = a.master_batch_id
left join public.profiles p on p.id = a.allocated_by;

grant select on public.v_batch_vessel to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · Read policies. Writes go through `allocate_vessel` only.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['vessel_scope_map','batch_vessel_allocation'] loop
    execute format('drop policy if exists vessel_read on public.%I', t);
    execute format(
      'create policy vessel_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

revoke all on function public.allocate_vessel(uuid, text, int, uuid, text) from public;
grant execute on function public.allocate_vessel(uuid, text, int, uuid, text) to authenticated;
