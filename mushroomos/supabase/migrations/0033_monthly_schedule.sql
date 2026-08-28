-- 0033 · Monthly schedule planning intake (Additive layer).
--
-- The monthly schedule is macro planning input, NEVER the execution record.
-- A planned group becomes a Master Batch only when Admin explicitly starts/instantiates it.
--
-- Preserves canonical runtime:
--   - Master Batch remains the sole execution entity.
--   - H0 clock (0011/0030) remains the authoritative process clock.
--   - batch_activity (0007/0027/0028) remains the activity-level planning engine.
--   - batch_movement (0031) remains the per-movement vessel claim engine.
--
-- IDEMPOTENT: scripts/db.mjs replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · monthly_schedule_import · The uploaded spreadsheet file for a month.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.monthly_schedule_import (
  id              uuid primary key default gen_random_uuid(),
  schedule_month  date not null check (schedule_month = date_trunc('month', schedule_month)::date),
  source_filename text not null check (length(trim(source_filename)) > 0),
  imported_at     timestamptz not null default now(),
  imported_by     uuid references public.profiles(id),
  source_rows     integer not null check (source_rows > 0),
  is_current      boolean not null default true,
  column_map      jsonb not null default '{}'::jsonb
);

create unique index if not exists monthly_schedule_import_one_current_month
  on public.monthly_schedule_import (schedule_month)
  where is_current;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · monthly_schedule_group · The planned batch group rows inside the import.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.monthly_schedule_group (
  id                   uuid primary key default gen_random_uuid(),
  schedule_import_id   uuid not null references public.monthly_schedule_import(id) on delete cascade,
  source_row_number    integer not null check (source_row_number > 0),
  group_code           text not null check (length(trim(group_code)) > 0),
  group_label          text,
  scheduled_start_date date not null,
  resource_note        text,
  raw_row              jsonb not null default '{}'::jsonb,
  status               text not null default 'scheduled'
                       check (status in ('scheduled', 'instantiated', 'cancelled')),
  master_batch_id      uuid unique references public.master_batch(id) on delete restrict,
  instantiated_at      timestamptz,
  instantiated_by      uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  unique (schedule_import_id, source_row_number),
  unique (schedule_import_id, group_code)
);

create index if not exists monthly_schedule_group_month_start_idx
  on public.monthly_schedule_group (schedule_import_id, scheduled_start_date);

create index if not exists monthly_schedule_group_batch_idx
  on public.monthly_schedule_group (master_batch_id)
  where master_batch_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Link Master Batch to its source schedule group (if originated from schedule)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.master_batch
  add column if not exists schedule_group_id uuid unique
  references public.monthly_schedule_group(id) on delete restrict;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · RLS & Access Grants
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.monthly_schedule_import enable row level security;
alter table public.monthly_schedule_group enable row level security;

revoke all on table public.monthly_schedule_import, public.monthly_schedule_group from anon, authenticated;
grant select on table public.monthly_schedule_import, public.monthly_schedule_group to authenticated;

drop policy if exists monthly_schedule_import_management_read on public.monthly_schedule_import;
create policy monthly_schedule_import_management_read on public.monthly_schedule_import
  for select to authenticated
  using (public.has_role('gm', 'manager', 'admin', 'supervisor'));

drop policy if exists monthly_schedule_group_management_read on public.monthly_schedule_group;
create policy monthly_schedule_group_management_read on public.monthly_schedule_group
  for select to authenticated
  using (public.has_role('gm', 'manager', 'admin', 'supervisor'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · import_monthly_schedule · Atomic import of validated spreadsheet rows.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.import_monthly_schedule(
  p_schedule_month date,
  p_source_filename text,
  p_column_map jsonb,
  p_rows jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_import_id uuid;
  v_count integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'Monthly schedules may only be imported by an Admin';
  end if;
  if p_schedule_month is null
     or p_schedule_month <> date_trunc('month', p_schedule_month)::date then
    raise exception 'Choose the first day of the schedule month';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) = 0 then
    raise exception 'The spreadsheet contains no scheduled batch groups';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'A monthly schedule may contain at most 2,000 groups';
  end if;

  -- Validate before changing the current import, so a bad file cannot erase a good schedule.
  select count(*) into v_count
  from jsonb_to_recordset(p_rows) as r(
    source_row_number integer,
    group_code text,
    group_label text,
    scheduled_start_date date,
    resource_note text,
    raw_row jsonb
  )
  where r.source_row_number is null
     or nullif(trim(r.group_code), '') is null
     or r.scheduled_start_date is null
     or date_trunc('month', r.scheduled_start_date)::date <> p_schedule_month;

  if v_count > 0 then
    raise exception 'Every group needs a batch number and a start date inside the selected month';
  end if;

  update public.monthly_schedule_import
     set is_current = false
   where schedule_month = p_schedule_month and is_current;

  insert into public.monthly_schedule_import
    (schedule_month, source_filename, imported_by, source_rows, column_map)
  values
    (p_schedule_month, trim(p_source_filename), auth.uid(), jsonb_array_length(p_rows),
     coalesce(p_column_map, '{}'::jsonb))
  returning id into v_import_id;

  insert into public.monthly_schedule_group
    (schedule_import_id, source_row_number, group_code, group_label, scheduled_start_date,
     resource_note, raw_row)
  select v_import_id, r.source_row_number, trim(r.group_code), nullif(trim(r.group_label), ''),
         r.scheduled_start_date, nullif(trim(r.resource_note), ''), coalesce(r.raw_row, '{}'::jsonb)
  from jsonb_to_recordset(p_rows) as r(
    source_row_number integer,
    group_code text,
    group_label text,
    scheduled_start_date date,
    resource_note text,
    raw_row jsonb
  );

  insert into public.audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state)
  values (auth.uid(), public.current_app_role(), 'import_monthly_schedule',
          'monthly_schedule_import', v_import_id::text,
          jsonb_build_object('schedule_month', p_schedule_month, 'source_rows', jsonb_array_length(p_rows)));

  return v_import_id;
end;
$$;

revoke execute on function public.import_monthly_schedule(date, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_monthly_schedule(date, text, jsonb, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · claim_monthly_schedule_group · Links a created Master Batch to its group.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.claim_monthly_schedule_group(
  p_schedule_group uuid,
  p_master_batch uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group public.monthly_schedule_group;
  v_batch public.master_batch;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'Only an Admin can create a Master Batch from the monthly schedule';
  end if;

  select * into v_group from public.monthly_schedule_group where id = p_schedule_group for update;
  select * into v_batch from public.master_batch where id = p_master_batch for update;

  if not found or v_group.id is null then
    raise exception 'The scheduled batch group no longer exists';
  end if;
  if v_batch.id is null then
    raise exception 'The Master Batch was not created';
  end if;
  if v_group.status <> 'scheduled' or v_group.master_batch_id is not null then
    raise exception 'This scheduled group has already been used';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'Only a draft Master Batch can be linked to the schedule';
  end if;
  if v_batch.code <> v_group.group_code or v_batch.start_date <> v_group.scheduled_start_date then
    raise exception 'The Master Batch identity and Day 0 date must match the selected schedule group';
  end if;

  update public.master_batch
     set schedule_group_id = v_group.id,
         config = config || jsonb_build_object('schedule_source', v_group.schedule_import_id::text)
   where id = v_batch.id;

  update public.monthly_schedule_group
     set status = 'instantiated', master_batch_id = v_batch.id,
         instantiated_at = now(), instantiated_by = auth.uid()
   where id = v_group.id;

  insert into public.audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state)
  values (auth.uid(), public.current_app_role(), 'instantiate_scheduled_batch',
          'monthly_schedule_group', v_group.id::text,
          jsonb_build_object('master_batch_id', v_batch.id));
end;
$$;

revoke execute on function public.claim_monthly_schedule_group(uuid, uuid) from public, anon;
grant execute on function public.claim_monthly_schedule_group(uuid, uuid) to authenticated;
