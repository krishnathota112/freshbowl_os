-- 0002 · Reference data: the conflict register, materials and material roles,
-- locations, machines. docs/STEP_1_2_BUILD_SPEC.md §2.1–§2.2

-- ─────────────────────────────────────────────────────────────────────────────
-- Conflict register.
--
-- Schema rather than seed, deliberately: the UI links to entries by conflict_id, so a
-- dangling marker should be a foreign-key failure rather than a broken link.
-- docs/SOURCE_CONFLICTS.md — 31 conflicts, 41 TBDs, none silently resolved.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.conflict_register (
  conflict_id       text primary key,          -- 'C-01', 'TBD-21'
  kind              text not null check (kind in ('conflict','tbd')),
  severity          text check (severity in ('blocks_build','blocks_behaviour','cosmetic')),
  question          text not null,
  sources           text,
  ship_with_default text,
  status            text not null default 'open' check (status in ('open','decided','resolved')),
  blocks_phase      text
);
alter table public.conflict_register enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Materials bind to ROLES, not to activities.
-- docs/ADMIN_CONFIGURABILITY_MODEL.md §2 — "instead of bagasse they may use mustard".
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type material_category as enum ('fibre','straw','manure','mineral','additive','water');
exception when duplicate_object then null; end $$;

do $$ begin
  create type material_role_code as enum (
    'PRIMARY_FIBRE','SECONDARY_FIBRE','STRUCTURAL_STRAW',
    'NITROGEN_SOURCE','MINERAL','PH_CORRECTOR');
exception when duplicate_object then null; end $$;

create table if not exists public.material (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  category           material_category not null,
  default_unit       text not null default 'MT',
  is_nitrogen_source boolean not null default false,
  notes              text
);
alter table public.material enable row level security;

create table if not exists public.material_role_eligibility (
  role            material_role_code not null,
  material_id     uuid not null references public.material(id) on delete cascade,
  is_default_lead boolean not null default false,
  tbd_marker      text references public.conflict_register(conflict_id),
  primary key (role, material_id)
);
alter table public.material_role_eligibility enable row level security;

-- Acceptance ranges for incoming lots — S4a Table 1.
create table if not exists public.material_spec (
  material_id uuid not null references public.material(id) on delete cascade,
  parameter   text not null,
  min_value   numeric,
  max_value   numeric,
  unit        text,
  source_ref  text not null,
  primary key (material_id, parameter)
);
alter table public.material_spec enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Locations and machines — contended resources, not string fields.
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type location_kind as enum (
    'BUNKER','TUNNEL','YARD','PILE','STRAW_PILE','SOAK_PIT','HOPPER','GROWING_ROOM','EXTERNAL');
exception when duplicate_object then null; end $$;

create table if not exists public.location (
  id                uuid primary key default gen_random_uuid(),
  kind              location_kind not null,
  code              text not null unique,
  label             text not null,
  capacity_mt       numeric,
  max_fill_height_m numeric,
  is_persistent     boolean not null default true,
  is_exclusive      boolean not null default true,
  status            text not null default 'available'
);
alter table public.location enable row level security;

do $$ begin
  create type machine_kind as enum (
    'LOADER_JCB','TURNER','HOPPER','ROTAVATOR','CONVEYOR',
    'VEHICLE_TRUCK','WINCH','AHU_FAN','WEIGHBRIDGE','OTHER');
exception when duplicate_object then null; end $$;

create table if not exists public.machine (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  kind         machine_kind not null,
  status       text not null default 'available',
  meters_hours boolean not null default false,
  meters_fuel  boolean not null default false,
  tbd_marker   text references public.conflict_register(conflict_id)
);
alter table public.machine enable row level security;
