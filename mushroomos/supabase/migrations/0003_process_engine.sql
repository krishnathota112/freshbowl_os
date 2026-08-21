-- 0003 · The process engine. docs/DOMAIN_MODEL.md §8, docs/STEP_1_2_BUILD_SPEC.md §2.3
--
-- Layer 1 of three. The process is DATA: adding an activity, changing a duration or adding
-- an evidence requirement is a seed change with zero application-code change.

do $$ begin
  create type process_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_scope as enum
    ('MASTER','LOAD','BUNKER_LINE','PILE','STRAW_PILE','TUNNEL','INDIVIDUAL_BATCH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stream_code as enum
    ('PRIMARY_FIBRE','SECONDARY_FIBRE','STRUCTURAL_STRAW','NITROGEN_MINERAL',
     'YARD','BUNKER','TUNNEL');
exception when duplicate_object then null; end $$;

create table if not exists public.process_definition (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null,
  version          int not null default 1,
  status           process_status not null default 'draft',
  source_ref       text not null,
  anchor_day_label text not null,
  total_days       int not null,
  published_by     uuid,
  published_at     timestamptz,
  unique (code, version)
);
alter table public.process_definition enable row level security;

create table if not exists public.process_activity (
  id                        uuid primary key default gen_random_uuid(),
  process_definition_id     uuid not null references public.process_definition(id) on delete cascade,
  code                      text not null,
  label_template            text not null,
  material_role             material_role_code,
  stream                    stream_code not null,
  rel_day                   int not null,
  seq                       int not null,
  scope                     activity_scope not null,
  cardinality_rule          jsonb not null,
  duration_target_min_hr    numeric,
  duration_target_max_hr    numeric,
  duration_required_at_day0 boolean not null default false,
  is_time_gate              boolean not null default false,
  is_optional               boolean not null default false,
  default_enabled           boolean not null default true,
  golden_rule               text,
  source_ref                text not null,
  tbd_marker                text references public.conflict_register(conflict_id),
  unique (process_definition_id, code),

  -- ───────────────────────────────────────────────────────────────────────────
  -- THE constraint. docs/STEP_1_2_BUILD_SPEC.md §2.3.
  --
  -- No material name may appear in a process activity code. The streams are
  -- process-shaped, not material-shaped: batch 303–305 used no new bagasse at all.
  -- Making this a CHECK rather than a review habit means it cannot be forgotten.
  -- ───────────────────────────────────────────────────────────────────────────
  constraint process_activity_code_has_no_material_name
    check (code !~* '(bagasse|paddy|mustard|wheat|gypsum|manure|urea|lime)')
);
alter table public.process_activity enable row level security;

create index if not exists idx_process_activity_def_seq
  on public.process_activity (process_definition_id, seq);

-- Conditional variants — the hopper water/dry decision.
create table if not exists public.activity_variant (
  id                          uuid primary key default gen_random_uuid(),
  process_activity_id         uuid not null references public.process_activity(id) on delete cascade,
  code                        text not null,
  label                       text not null,
  selection_rule              jsonb,
  -- FROZEN DECISION 1: auto-selection ships DISABLED. The threshold is unresolved (C-01/C-29)
  -- and the decision changes the physical action, so the operator chooses and states why.
  auto_select_enabled         boolean not null default false,
  requires_reason_on_override boolean not null default true,
  conflict_id                 text references public.conflict_register(conflict_id),
  unique (process_activity_id, code)
);
alter table public.activity_variant enable row level security;

-- The six-column model. docs/DOMAIN_MODEL.md §5. Columns 1–3 freeze at activation.
create table if not exists public.activity_field (
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references public.process_activity(id) on delete cascade,
  key                 text not null,
  label               text not null,
  datatype            text not null,
  unit                text,
  sop_value           text,        -- ① what the SOP says
  sop_min             numeric,
  sop_max             numeric,
  sop_source_ref      text,        -- cites the absence too, when there is no bound
  conflict_id         text references public.conflict_register(conflict_id),
  day0_editable       boolean not null default true,   -- ②
  day0_required       boolean not null default false,
  default_variance    text,                            -- ③
  operator_input      text not null default 'required' -- ④
                        check (operator_input in ('required','optional','not_collected')),
  remarks_default     text,                            -- ⑤
  section             text,                            -- ⑥
  step_no             int,
  display_order       int,
  unique (process_activity_id, key)
);
alter table public.activity_field enable row level security;

-- Evidence is N NAMED requirements, each individually satisfied — never a photo count.
-- docs/EVIDENCE_CONFIGURATION_MODEL.md §1.
create table if not exists public.evidence_requirement (
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references public.process_activity(id) on delete cascade,
  key                 text not null,
  label               text not null,
  media_kinds         text[] not null default '{photo}',
  min_count           int not null default 1,
  max_count           int,
  is_required         boolean not null default true,
  gates_submission    boolean not null default true,
  capture_hint        text,
  ordering            int not null,
  unique (process_activity_id, key)
);
alter table public.evidence_requirement enable row level security;

create table if not exists public.gate_rule (
  id                      uuid primary key default gen_random_uuid(),
  process_activity_id     uuid not null references public.process_activity(id) on delete cascade,
  phase                   text not null check (phase in ('entry','exit')),
  kind                    text not null,
  config                  jsonb not null default '{}'::jsonb,
  -- SAME_SCOPE_INSTANCE is the T1→T2 requirement. Pile 2's T2 waits on pile 2's T1 only.
  predecessor_binding     text check (predecessor_binding in
                            ('ALL_INSTANCES','ANY_INSTANCE','SAME_SCOPE_INSTANCE')),
  is_enabled              boolean not null default true,
  mapping_confidence      text not null default 'dictated'
                            check (mapping_confidence in
                              ('dictated','sop_direct','sop_inferred','unmapped')),
  conflict_id             text references public.conflict_register(conflict_id),
  -- Every non-actionable state must be able to explain itself.
  blocked_reason_template text not null check (length(trim(blocked_reason_template)) > 0),
  ordering                int not null default 10
);
alter table public.gate_rule enable row level security;

create table if not exists public.movement_rule (
  process_activity_id        uuid primary key references public.process_activity(id) on delete cascade,
  source_kind               location_kind,
  destination_kind          location_kind,
  requires_distinct_vessel  boolean not null default false,
  allow_same_vessel_override boolean not null default false,
  creates_locations         jsonb,
  consumes_locations        jsonb
);
alter table public.movement_rule enable row level security;

create table if not exists public.resource_requirement (
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references public.process_activity(id) on delete cascade,
  machine_kind        machine_kind not null,
  quantity            int not null default 1,
  is_required         boolean not null default true,
  role_hint           text
);
alter table public.resource_requirement enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lab reference
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_spec (
  id              uuid primary key default gen_random_uuid(),
  checkpoint_code text not null,
  parameter_code  text not null,
  min_value       numeric,     -- null where no source gives a bound. Never invented.
  max_value       numeric,
  unit            text,
  source_ref      text not null,
  conflict_id     text references public.conflict_register(conflict_id),
  unique (checkpoint_code, parameter_code)
);
alter table public.lab_spec enable row level security;

create table if not exists public.lab_method (
  code                text primary key,
  name                text not null,
  apparatus           text[],
  procedure_steps     text[],
  calculation_formula text,
  calibration_note    text,
  source_ref          text not null,
  conflict_id         text references public.conflict_register(conflict_id)
);
alter table public.lab_method enable row level security;

create table if not exists public.phase2_control_band (
  id               uuid primary key default gen_random_uuid(),
  from_hr          int not null,
  to_hr            int not null,
  stage            text not null,
  probe            text not null check (probe in ('tunnel_top','compost','plenum')),
  band_min         numeric,
  band_max         numeric,
  verdict          text not null,
  action           text not null,
  expected_outcome text,
  source_ref       text not null,
  conflict_id      text references public.conflict_register(conflict_id)
);
alter table public.phase2_control_band enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-28 · the SOP limit mapping review artefact. A VIEW, so it stays live.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_sop_limit_mapping as
select
  src.code                as sop_activity,
  srcf.key                as sop_field,
  srcf.sop_min,
  srcf.sop_max,
  srcf.unit,
  srcf.sop_source_ref,
  tgt.code                as mapped_to_activity,
  coalesce(g.mapping_confidence, 'unmapped') as mapping_confidence,
  coalesce(g.is_enabled, false)              as is_enabled,
  g.conflict_id
from public.process_activity src
join public.activity_field srcf on srcf.process_activity_id = src.id
left join public.gate_rule g
       on g.config->>'sop_field_ref' = src.code || '.' || srcf.key
left join public.process_activity tgt on tgt.id = g.process_activity_id
where src.process_definition_id =
      (select id from public.process_definition where code = 'ROUTE-2026A' limit 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: reference data is read-all-authenticated, write-admin.
-- Deny by default is already in force — a table without a policy is unreadable.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'conflict_register','material','material_role_eligibility','material_spec',
    'location','machine','process_definition','process_activity','activity_variant',
    'activity_field','evidence_requirement','gate_rule','movement_rule',
    'resource_requirement','lab_spec','lab_method','phase2_control_band'
  ]
  loop
    execute format('drop policy if exists ref_read on public.%I', t);
    execute format(
      'create policy ref_read on public.%I for select to authenticated using (true)', t);

    execute format('drop policy if exists ref_write on public.%I', t);
    execute format(
      'create policy ref_write on public.%I for all to authenticated '
      'using (public.has_role(''admin'')) with check (public.has_role(''admin''))', t);
  end loop;
end $$;

grant select on public.v_sop_limit_mapping to authenticated;
