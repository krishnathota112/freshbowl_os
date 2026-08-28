-- 0031 · Individual batches, and vessels claimed per MOVEMENT.
--
-- Two things the factory's own records make plain and the system did not have.
--
-- 1 · A MASTER BATCH IS A GROUP OF INDIVIDUAL BATCHES.
--     "Batch No 366,367,368". "Batch No 387,388,389,390". "Batch No 121,122".
--     Two, three or four - the size is not fixed. They share the early process and separate at
--     tunnel loading, where each takes its own tunnel, its own Phase-2 timings and its own quality
--     result. Management has to be able to ask "which tunnel did 367 use, and what came out".
--
-- 2 · VESSELS ARE CLAIMED PER MOVEMENT, NOT ONCE PER BATCH.
--     From a real record: first fill Bunker 3, reload-1 Bunker 5, reload-2 back into Bunker 3. And
--     the counts do not line up either - "3 batches loading into 2 bunkers", then "2 bunkers filled
--     into 3 tunnels". 0026 bound one bunker to a batch for its whole life, which cannot express
--     any of that.
--
-- `BATCH PHASE MOVEMENT UPDATED.xlsx` is the shape being followed here, column for column:
--     Bunker Filling | Reload-1 | Reload-2 | Tunnel Loading | Tunnel Out | Harvest estimate
--     each with a vessel number, a DATE and a TIMING recorded to the minute.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The individual batches inside a master batch.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.individual_batch (
  id               uuid primary key default gen_random_uuid(),
  master_batch_id  uuid not null references public.master_batch(id) on delete cascade,
  -- The factory's own number, as written: '366'. Text, not an integer - the records also carry
  -- '001' and '013', and leading zeros are part of how they are read.
  batch_no         text not null,
  seq              int  not null check (seq >= 1),
  created_at       timestamptz not null default now(),
  unique (master_batch_id, seq),
  unique (batch_no)
);
alter table public.individual_batch enable row level security;

comment on table public.individual_batch is
  'One of the two-to-four batches inside a master batch. Shares the early process; separates at '
  'tunnel loading, where each takes its own tunnel and its own quality result.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The movements a batch makes, as DATA.
--
-- Not an enum in code. The factory's phase-movement sheet names them, and if a seventh movement
-- appears it is a row here, not a change to the software.
--
-- `is_per_individual_batch` is what separates a bunker movement (the whole master batch moves
-- together) from tunnel loading (each individual batch goes to its own tunnel).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.movement_template (
  code                    text primary key,
  label                   text not null,
  seq                     int  not null,
  vessel_kind             location_kind,
  is_per_individual_batch boolean not null default false,
  source_ref              text not null
);
alter table public.movement_template enable row level security;

insert into public.movement_template (code, label, seq, vessel_kind, is_per_individual_batch, source_ref) values
  ('BUNKER_FILL',     'Bunker filling', 10, 'BUNKER', false, 'BATCH PHASE MOVEMENT - Bunker Filling'),
  ('BUNKER_RELOAD_1', 'Reload 1',       20, 'BUNKER', false, 'BATCH PHASE MOVEMENT - Bunker Reload-1'),
  ('BUNKER_RELOAD_2', 'Reload 2',       30, 'BUNKER', false, 'BATCH PHASE MOVEMENT - Bunker Reload-2'),
  ('TUNNEL_LOAD',     'Tunnel loading', 40, 'TUNNEL', true,  'BATCH PHASE MOVEMENT - Tunnel Loading'),
  ('TUNNEL_OUT',      'Tunnel out',     50, null,     true,  'BATCH PHASE MOVEMENT - TUNNEL OUT')
on conflict (code) do update set
  label = excluded.label, seq = excluded.seq, vessel_kind = excluded.vessel_kind,
  is_per_individual_batch = excluded.is_per_individual_batch, source_ref = excluded.source_ref;

grant select on public.movement_template to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · One movement of one batch into one vessel.
--
-- `planned_at` and `actual_at` are INSTANTS, because the factory records the timing to the minute -
-- 8:00 PM, 4:06 PM, 5:10 AM. Not a day.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.batch_movement (
  id                  uuid primary key default gen_random_uuid(),
  master_batch_id     uuid not null references public.master_batch(id) on delete cascade,
  -- Null for a movement the whole master batch makes together, such as a bunker fill.
  individual_batch_id uuid references public.individual_batch(id) on delete cascade,
  movement_code       text not null references public.movement_template(code),
  -- Where it came from. Null on the first movement - the material arrives from outside.
  from_location_id    uuid references public.location(id),
  to_location_id      uuid references public.location(id),
  planned_at          timestamptz,
  actual_at           timestamptz,
  fill_height_m       numeric,
  note                text,
  conflict_id         text references public.conflict_register(conflict_id),
  recorded_by         uuid references public.profiles(id),
  created_at          timestamptz not null default now()
);
alter table public.batch_movement enable row level security;

-- A master-level movement happens once per batch; an individual-level movement once per individual
-- batch. Two partial indexes, because a UNIQUE over a nullable column treats every NULL as distinct
-- and would let the same bunker fill be recorded twice.
create unique index if not exists uq_movement_master
  on public.batch_movement (master_batch_id, movement_code)
  where individual_batch_id is null;

create unique index if not exists uq_movement_individual
  on public.batch_movement (master_batch_id, movement_code, individual_batch_id)
  where individual_batch_id is not null;

create index if not exists idx_movement_batch on public.batch_movement (master_batch_id, movement_code);
create index if not exists idx_movement_location on public.batch_movement (to_location_id);

comment on table public.batch_movement is
  'One movement of a batch into a vessel, with the instant it happened. A batch may return to a '
  'bunker it used earlier - first fill Bunker 3, reload-1 Bunker 5, reload-2 Bunker 3 again.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · What the raw material actually tested, per batch.
--
-- `batch_material_role` already carries the material and its percentage. This is the tested
-- chemistry that turns a percentage into tonnes, and the arithmetic is confirmed against a real
-- record: paddy 28.5 dry at 14.8 percent moisture gives 33.45 fresh, and 33.45 is what they wrote.
--
-- `fresh_wt_mt` is GENERATED. Nobody types a number a formula can produce, because the typed one
-- and the computed one will disagree eventually and the typed one will be believed.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.batch_material_role
  add column if not exists moisture_pct numeric check (moisture_pct >= 0 and moisture_pct < 100),
  add column if not exists n_pct        numeric,
  add column if not exists ash_pct      numeric,
  add column if not exists cn_ratio     numeric,
  add column if not exists age_months   numeric,
  add column if not exists source_note  text,
  add column if not exists dry_wt_mt    numeric;

alter table public.batch_material_role drop column if exists fresh_wt_mt;

alter table public.batch_material_role
  add column fresh_wt_mt numeric generated always as (
    case when dry_wt_mt is not null and moisture_pct is not null and moisture_pct < 100
      then round(dry_wt_mt / (1 - moisture_pct / 100.0), 3)
    end
  ) stored;

comment on column public.batch_material_role.fresh_wt_mt is
  'Computed, never typed: dry weight divided by (1 - moisture). Verified against batch 366,367,368 '
  '- paddy 28.5 dry at 14.8 percent moisture gives 33.45, the figure in the record.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Creating the individual batches from the master batch name.
--
-- "366,367,368" gives three individual batches. The factory writes the group as one string and that
-- is what Admin types, so the split happens here rather than asking her to enter them one by one.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_individual_batches(p_batch uuid, p_numbers text)
returns int language plpgsql security definer set search_path = public as $fn$
declare
  b     master_batch;
  parts text[];
  n     text;
  i     int := 0;
  made  int := 0;
begin
  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch'; end if;
  if b.status <> 'draft' then
    raise exception
      'The baseline is frozen - % is %. The batches it covers cannot change now.', b.code, b.status;
  end if;

  -- Split on comma, slash or whitespace: the records use all three.
  parts := regexp_split_to_array(btrim(p_numbers), '[[:space:],/]+');

  delete from individual_batch where master_batch_id = p_batch;

  foreach n in array parts loop
    n := btrim(n);
    continue when n = '';
    i := i + 1;
    insert into individual_batch (master_batch_id, batch_no, seq) values (p_batch, n, i);
    made := made + 1;
  end loop;

  if made = 0 then
    raise exception 'No batch numbers found in "%". Write them as the factory does: 366,367,368',
      p_numbers using errcode = 'invalid_parameter_value';
  end if;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'set_individual_batches', 'master_batch',
          p_batch::text, format('%s covers %s', b.code, p_numbers));
  return made;
end;
$fn$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · Claiming a vessel for a movement, and refusing a clash.
--
-- The refusal names the batch holding it and when, for the same reason as before: "Bunker 7 is
-- taken" sends someone hunting; naming the batch ends the question.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_movement_vessel(
  p_batch       uuid,
  p_movement    text,
  p_location    uuid,
  p_individual  uuid default null,
  p_planned_at  timestamptz default null,
  p_note        text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  t      movement_template;
  loc    location;
  b      master_batch;
  clash  record;
  prev   uuid;
  new_id uuid;
begin
  select * into t from movement_template where code = p_movement;
  if not found then raise exception 'Unknown movement "%"', p_movement; end if;

  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch'; end if;

  if t.is_per_individual_batch and p_individual is null then
    raise exception '% is chosen for each individual batch, so one must be named.', t.label
      using errcode = 'invalid_parameter_value';
  end if;
  if not t.is_per_individual_batch and p_individual is not null then
    raise exception '% is made by the whole master batch together.', t.label
      using errcode = 'invalid_parameter_value';
  end if;

  select * into loc from location where id = p_location;
  if not found then raise exception 'No such location'; end if;
  if t.vessel_kind is not null and loc.kind <> t.vessel_kind then
    raise exception '% needs a % - % is a %.', t.label, t.vessel_kind, loc.label, loc.kind
      using errcode = 'invalid_parameter_value';
  end if;
  if loc.status is distinct from 'available' then
    raise exception '% is not available (%).', loc.label, loc.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Held by ANOTHER batch right now. A batch returning to a bunker it used earlier is fine and the
  -- records show it happening, so this only looks at other batches.
  if loc.is_exclusive then
    select mb.code, o.started_at into clash
      from location_occupancy o
      join master_batch mb on mb.id = o.master_batch_id
     where o.location_id = p_location and o.ended_at is null and o.master_batch_id <> p_batch
     limit 1;
    if found then
      raise exception '% is occupied by % since %, and has not been released.',
        loc.label, clash.code, to_char(clash.started_at, 'DD Mon HH24:MI')
        using errcode = 'exclusion_violation';
    end if;
  end if;

  -- Where it comes FROM is the vessel of the previous movement, so the chain draws itself.
  select bm.to_location_id into prev
    from batch_movement bm
    join movement_template mt on mt.code = bm.movement_code
   where bm.master_batch_id = p_batch
     and mt.seq < t.seq
     and (bm.individual_batch_id is null or bm.individual_batch_id = p_individual)
     and bm.to_location_id is not null
   order by mt.seq desc limit 1;

  if p_individual is null then
    delete from batch_movement
     where master_batch_id = p_batch and movement_code = p_movement and individual_batch_id is null;
  else
    delete from batch_movement
     where master_batch_id = p_batch and movement_code = p_movement
       and individual_batch_id = p_individual;
  end if;

  insert into batch_movement
    (master_batch_id, individual_batch_id, movement_code, from_location_id, to_location_id,
     planned_at, note, recorded_by)
  values (p_batch, p_individual, p_movement, prev, p_location, p_planned_at, p_note, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'set_movement_vessel', 'batch_movement',
          new_id::text, jsonb_build_object('movement', p_movement, 'location', loc.code),
          format('%s goes to %s', t.label, loc.label));
  return new_id;
end;
$fn$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · The movement chain a batch is planned to make, for the screen and the flow picture.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_batch_movement as
select
  t.seq,
  t.code                as movement_code,
  t.label               as movement_label,
  t.vessel_kind::text   as needs_kind,
  t.is_per_individual_batch,
  mb.id                 as master_batch_id,
  mb.code               as batch_code,
  ib.id                 as individual_batch_id,
  ib.batch_no,
  bm.id                 as movement_id,
  bm.from_location_id,
  fl.label              as from_label,
  bm.to_location_id,
  tl.label              as to_label,
  tl.code               as to_code,
  bm.planned_at,
  bm.actual_at,
  bm.fill_height_m,
  bm.conflict_id,
  p.display_name        as recorded_by_name
from public.master_batch mb
cross join public.movement_template t
left join public.individual_batch ib
       on t.is_per_individual_batch and ib.master_batch_id = mb.id
left join public.batch_movement bm
       on bm.master_batch_id = mb.id
      and bm.movement_code = t.code
      and bm.individual_batch_id is not distinct from ib.id
left join public.location fl on fl.id = bm.from_location_id
left join public.location tl on tl.id = bm.to_location_id
left join public.profiles p on p.id = bm.recorded_by;

grant select on public.v_batch_movement to authenticated;

comment on view public.v_batch_movement is
  'Every movement a batch is expected to make, filled or not. A null to_location is a movement '
  'whose vessel has not been chosen yet - the main thing the picker exists to show.';


do $pol$
declare t text;
begin
  foreach t in array array['individual_batch','movement_template','batch_movement'] loop
    execute format('drop policy if exists movement_read on public.%I', t);
    execute format('create policy movement_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $pol$;

revoke all on function public.set_individual_batches(uuid, text) from public;
revoke all on function public.set_movement_vessel(uuid, text, uuid, uuid, timestamptz, text) from public;
grant execute on function public.set_individual_batches(uuid, text) to authenticated;
grant execute on function public.set_movement_vessel(uuid, text, uuid, uuid, timestamptz, text) to authenticated;
