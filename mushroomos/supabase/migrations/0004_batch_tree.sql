-- 0004 · The batch tree. Reconstructed 22 Aug 2026.
--
-- WHY THIS FILE EXISTS
--
-- This migration was missing. `master_batch`, `batch_material_role`, `batch_activity`,
-- `batch_activity_value`, `batch_activity_evidence_req`, `batch_process_config` and the
-- `batch_status` / `activity_state` enums are referenced by migrations 0005–0010, by all nine
-- seeds and by every screen — and were created by no file in the repository and by no commit in
-- its history. `npm run db:migrate` against a clean project failed at 0006
-- (`alter table public.batch_activity`). The deployed database had them because they were
-- applied out of band. docs/CONTRACT_AUDIT_2026-08-22.md §3.1.
--
-- HOW IT WAS RECONSTRUCTED
--
-- Not guessed. Two independent derivations, cross-checked:
--
--   1. MECHANICAL — every `insert into`, `update … set`, `alter table` and `.select('…')` in
--      migrations 0005–0010, supabase/seed/*.sql and src/api/*.ts that names these tables.
--   2. LIVE — the deployed schema read back from the project via information_schema and
--      pg_constraint, then the columns added later by 0006/0007/0008 subtracted.
--
-- Where the two disagreed, the live schema won and the difference is commented below. Applying
-- 0004…0010 in order to a clean project must reproduce the deployed shape exactly.
--
-- COLUMNS LATER MIGRATIONS ADD ARE DELIBERATELY ABSENT HERE, so the history stays honest:
--   0006 → batch_activity.submitted_at/submitted_by/instance_count,
--          batch_activity_value.variance_flag/actual_recorded_at/actual_recorded_by,
--          batch_activity_evidence_req.satisfied_count, and the reason-required CHECK
--   0007 → batch_activity routing, assignment, location, variant and lab columns
--   0008 → batch_activity.unblocks_at

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: the deployed enum carries four values. docs/DOMAIN_MODEL.md §2.4 lists seven
-- (draft|configuring|validated|active|in_tunnel|closed|cancelled). The narrower set is what the
-- code actually produces — `create_master_batch` writes 'draft', `activate_batch` writes
-- 'active' — and it is what is deployed. The wider vocabulary is NOT adopted here: adding a
-- state nothing can reach would be inventing workflow. If the factory needs one, it is a
-- deliberate migration.
do $$ begin
  create type batch_status as enum ('draft','active','closed','cancelled');
exception when duplicate_object then null; end $$;

-- The fourteen workflow states. docs/WORKFLOW_MODEL.md §2, mirrored in src/domain/types.ts
-- ACTIVITY_STATES. The two lists must stay identical; src/domain/types.ts is the client mirror,
-- this is the authority.
do $$ begin
  create type activity_state as enum (
    'LOCKED','READY','IN_PROGRESS','SUBMITTED','AWAITING_LAB','WAITING_TIME','WAITING_CONDITION',
    'AWAITING_SUPERVISOR','BLOCKED','DEVIATION','RETURNED','COMPLETED','SKIPPED','CANCELLED');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- master_batch · one row per Master Batch. The Day-0 answers live in `config`.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.master_batch (
  id                    uuid primary key default gen_random_uuid(),
  -- TBD-6 is open: batch numbering resets (399 → 001) and nobody has said on what cycle. The
  -- UNIQUE constraint is deployed and is kept — removing it would be a behaviour change — but
  -- the question of what makes a batch code unique over time is NOT settled.
  code                  text not null unique,
  label                 text not null,
  process_definition_id uuid not null references public.process_definition(id),
  -- The calendar day the batch starts. A2 adds `start_at timestamptz`, because H0 is 05:00 and
  -- not midnight (docs/TIME_CONTRACT.md §1.1). Until then every planned timestamp derived from
  -- this column is five hours early.
  start_date            date not null,
  status                batch_status not null default 'draft',
  supervisor_name       text,
  weather_note          text,
  -- Every Day-0 answer: quantities, structure counts, rest durations, per-field targets.
  -- Read by evaluate_cardinality and generate_activity_plan.
  config                jsonb not null default '{}'::jsonb,
  activated_at          timestamptz,
  activated_by          uuid,
  created_at            timestamptz not null default now(),
  created_by            uuid
);
alter table public.master_batch enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- batch_material_role · which material fills which process role, for this batch.
--
-- This is what makes the process definition material-agnostic: activities bind to roles, and
-- Admin binds materials to roles here. docs/ADMIN_CONFIGURABILITY_MODEL.md §2 —
-- "instead of bagasse they may use mustard".
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.batch_material_role (
  master_batch_id uuid not null references public.master_batch(id) on delete cascade,
  role            material_role_code not null,
  material_id     uuid not null references public.material(id),
  -- Exactly one lead per role resolves {role_lead} in a label template.
  is_role_lead    boolean not null default false,
  -- Deployed but referenced by nothing in the repository. Retained for fidelity with the
  -- deployed schema; the formulation model that would use it is not built.
  pct_of_role     numeric,
  primary key (master_batch_id, role, material_id)
);
alter table public.batch_material_role enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- batch_activity · one row per activity INSTANCE.
--
-- The instance count is derived from the cardinality rule and the Day-0 config, never typed:
-- 21 MT / 2 MT capacity produces eleven LOAD rows, ten at 2.0 and a tail at 1.0.
-- Columns 1-3 of the six-column model are frozen onto the instance at generation time.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.batch_activity (
  id                     uuid primary key default gen_random_uuid(),
  master_batch_id        uuid not null references public.master_batch(id) on delete cascade,
  process_activity_id    uuid not null references public.process_activity(id),
  -- Copied from the template so the row stays readable if the definition is versioned.
  code                   text not null,
  title                  text not null,          -- {role_lead} already resolved
  stream                 stream_code not null,
  rel_day                int not null,
  seq                    int not null,
  scope                  activity_scope not null,
  scope_label            text not null,          -- 'Load 08 of 11', 'Pile 2 of 3'
  instance_no            int not null,
  planned_qty_mt         numeric,
  planned_start          timestamptz,
  planned_end            timestamptz,
  duration_target_min_hr numeric,
  duration_target_max_hr numeric,
  -- The Day-0 answer for a time gate. NO DEFAULT, deliberately: the factory has never stated
  -- the rest hours (TBD-21), and activate_batch refuses while any rest has none.
  day0_duration_hr       numeric,
  is_time_gate           boolean not null default false,
  golden_rule            text,
  -- No FK, matching the deployed schema. process_activity.tbd_marker does carry one.
  tbd_marker             text,
  state                  activity_state not null default 'LOCKED',
  -- 0006 adds the CHECK that makes a non-actionable state without a reason unwritable.
  blocked_reason         text,
  actual_start           timestamptz,
  actual_end             timestamptz,
  -- Deployed but referenced by nothing in the repository. A2 replaces the intent with a
  -- GENERATED variance column (DEMO_PLAN_V2 criterion 21); this is its unused precursor.
  duration_actual_min    int,
  unique (master_batch_id, process_activity_id, instance_no)
);
alter table public.batch_activity enable row level security;

-- Both of these are deployed. The second is a prefix of the first and therefore redundant;
-- kept for fidelity, and safe to drop in a later migration if anyone measures.
create index if not exists idx_batch_activity_batch_seq
  on public.batch_activity (master_batch_id, seq, instance_no);
create index if not exists idx_batch_activity_batch
  on public.batch_activity (master_batch_id, seq);
create index if not exists idx_batch_activity_state
  on public.batch_activity (state);

-- ─────────────────────────────────────────────────────────────────────────────
-- batch_activity_value · the six-column model, per field, per instance.
--
--   ① sop_*      what the SOP says, frozen with its source ref — which cites the ABSENCE of a
--                bound too, because "no source gives one" is information, not an omission
--   ② day0_value what Admin chose
--   ③ actual_*   what happened (0006 adds who and when)
--   ④ variance_allowed  ⑤ remarks  ⑥ section
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.batch_activity_value (
  id                uuid primary key default gen_random_uuid(),
  batch_activity_id uuid not null references public.batch_activity(id) on delete cascade,
  field_key         text not null,
  label             text not null,
  unit              text,
  sop_value         text,
  sop_min           numeric,
  sop_max           numeric,
  sop_source_ref    text,
  -- No FK, matching the deployed schema. activity_field.conflict_id does carry one.
  conflict_id       text,
  day0_value        text,
  variance_allowed  text,
  actual_value      text,
  remarks           text,
  section           text,
  operator_input    text not null default 'required',
  display_order     int,
  unique (batch_activity_id, field_key)
);
alter table public.batch_activity_value enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- batch_activity_evidence_req · N NAMED requirements, each individually satisfied.
--
-- Never a photo count. The reference case is the nitrogen/mineral mix: before, after, and a
-- third for the ammonium sulphate spread by hand. docs/EVIDENCE_CONFIGURATION_MODEL.md §1.
--
-- 0006 adds satisfied_count. A4 replaces that counter with real stored media — today it is
-- incremented with no file, no path and no uploader. CONTRACT_AUDIT §3.3.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.batch_activity_evidence_req (
  id                uuid primary key default gen_random_uuid(),
  batch_activity_id uuid not null references public.batch_activity(id) on delete cascade,
  key               text not null,
  label             text not null,
  media_kinds       text[] not null,
  min_count         int not null default 1,
  gates_submission  boolean not null default true,
  capture_hint      text,
  ordering          int not null,
  unique (batch_activity_id, key)
);
alter table public.batch_activity_evidence_req enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- batch_process_config · per-batch process option overrides.
--
-- Deployed, and referenced by NOTHING in the repository — no migration, no seed, no screen.
-- Retained so a clean rebuild reproduces the deployed schema exactly. Whether it is a
-- superseded precursor of master_batch.config or a slot for a feature never built is not
-- recorded anywhere; do not build against it without asking.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.batch_process_config (
  master_batch_id uuid primary key references public.master_batch(id) on delete cascade,
  config          jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);
alter table public.batch_process_config enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Read is open to any authenticated user; WRITE GOES THROUGH SECURITY DEFINER FUNCTIONS ONLY.
-- 0006 repeats the read policy and the revoke for the three execution tables; the three
-- configuration tables are policied here and nowhere else, so removing these makes the
-- application unreadable rather than merely unwritable.
--
-- The `or current_app_role() is null` clause is the documented escape hatch for a project where
-- the Customize Access Token hook is not yet switched on: without the claim, current_app_role()
-- returns null and Admin writes would be refused for everyone. AppShell shows a banner while
-- that is the case. It is NOT a permanent authorisation model — once the hook is enabled the
-- clause is dead code and should be removed.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'master_batch','batch_material_role','batch_activity',
    'batch_activity_value','batch_activity_evidence_req','batch_process_config'
  ]
  loop
    execute format('drop policy if exists batch_read on public.%I', t);
    execute format(
      'create policy batch_read on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

drop policy if exists batch_admin_write on public.master_batch;
create policy batch_admin_write on public.master_batch
  for all to authenticated
  using (public.has_role('admin') or public.current_app_role() is null)
  with check (public.has_role('admin') or public.current_app_role() is null);

drop policy if exists bmr_admin_write on public.batch_material_role;
create policy bmr_admin_write on public.batch_material_role
  for all to authenticated
  using (public.has_role('admin') or public.current_app_role() is null)
  with check (public.has_role('admin') or public.current_app_role() is null);

drop policy if exists cfg_admin_write on public.batch_process_config;
create policy cfg_admin_write on public.batch_process_config
  for all to authenticated
  using (public.has_role('admin') or public.current_app_role() is null)
  with check (public.has_role('admin') or public.current_app_role() is null);
