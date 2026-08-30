> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# STEP 1 + STEP 2 — DETAILED BUILD SPEC

For Kiro. Executable detail for the first two steps of `KIRO_BUILD_INSTRUCTIONS.md §3`.
Everything here is verifiable by a query or a command — no step is "done" on inspection.

**Scope of this spec:** foundation, auth, RLS, audit, design system, the five-layer node,
reference data, the process-engine schema, and the `PROCESS-2026B` role-based seed.
**Not in scope:** batch creation, activities, execution. That is Step 3 onward.

---

# STEP 1 — FOUNDATION

## 1.1 Repo

```
mushroomos/
  supabase/
    migrations/          0001_extensions.sql, 0002_profiles_auth.sql, …
    seed/                s01_materials.sql, s02_locations.sql, …
    functions/           Edge Functions (empty until Step 6)
    config.toml
  src/
    domain/              generated types + hand-written domain unions
    api/                 typed Supabase client, one module per aggregate
    components/
      primitives/        Chip, Stat, Field, Card, Bar, Countdown
      node/              FiveLayerNode  ← §1.7
      layout/            AppShell, SideNav, TopBar
    routes/              operator/ lab/ supervisor/ admin/ manager/ gm/
    theme/               tokens.css, theme.ts
    lib/                 auth, offline queue (Step 7), formatters
  tests/
    rls/                 one file per role
    unit/
  .env.local             gitignored — never committed
```

**Migration rule:** numbered, forward-only, never edited after being applied to a shared
environment. Seeds are separate from migrations and are idempotent (`ON CONFLICT DO UPDATE`)
so re-seeding a changed process definition is safe.

**Type generation:** `supabase gen types typescript --local > src/domain/database.types.ts`,
run in CI and committed. Hand-written database types are a build failure.

## 1.2 Roles

```sql
create type app_role as enum
  ('gm','manager','admin','supervisor','operator','lab_tech');

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  role          app_role not null,
  shift         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;
```

## 1.3 Role in the JWT — not fetched after login

The old app read the role with a REST call after sign-in and kept it in `localStorage`
(S8d). That is spoofable. The role must be a **claim**.

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  claims    jsonb;
  user_role text;
begin
  select role::text into user_role
  from public.profiles
  where id = (event->>'user_id')::uuid;

  claims := event->'claims';
  if user_role is not null then
    claims := jsonb_set(claims, '{app_metadata,app_role}', to_jsonb(user_role));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;
```

Enable it in `config.toml`:
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Reader used by every policy:

```sql
create or replace function public.current_app_role()
returns app_role language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'app_role', ''
  )::app_role;
$$;

create or replace function public.has_role(variadic roles app_role[])
returns boolean language sql stable as $$
  select public.current_app_role() = any(roles);
$$;
```

## 1.4 RLS baseline

**Deny by default, everywhere.** Every table gets `enable row level security` in the same
migration that creates it. A table without a policy is unreadable — that is correct.

Reference-data pattern (read-all-authenticated, write-admin):

```sql
create policy ref_read on public.<table>
  for select to authenticated using (true);

create policy ref_write on public.<table>
  for all to authenticated
  using  (public.has_role('admin'))
  with check (public.has_role('admin'));
```

**Process-state tables (Step 3 onward) get NO write policy at all** — writes go through
`SECURITY DEFINER` functions only. Establish that habit now:

```sql
revoke insert, update, delete on public.<process_state_table> from authenticated, anon;
```

## 1.5 Audit

```sql
create table public.audit_event (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,
  actor_role    app_role,
  action        text not null,        -- 'activate_batch', 'submit_activity', …
  entity_table  text not null,
  entity_id     text not null,
  before_state  jsonb,
  after_state   jsonb,
  reason        text,
  request_id    text
);
alter table public.audit_event enable row level security;

create policy audit_read on public.audit_event
  for select to authenticated
  using (public.has_role('gm','manager','admin','supervisor'));

revoke insert, update, delete on public.audit_event from authenticated, anon;
```

Generic trigger, attached to every process-state table from Step 3:

```sql
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_event(actor_id, actor_role, action, entity_table, entity_id,
                          before_state, after_state)
  values (auth.uid(), public.current_app_role(), tg_op, tg_table_name,
          coalesce(new.id::text, old.id::text),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
```

## 1.6 App shell

Six role layouts, one router. Route guard reads the role from the **session JWT claim**, not
from a profile fetch. A role landing on an unauthorised route is redirected to its own home,
and the guard is defence-in-depth only — RLS is the boundary.

| Role | Home route |
|---|---|
| `operator` | `/operator/my-work` |
| `lab_tech` | `/lab/queue` |
| `supervisor` | `/supervisor/control-room` |
| `admin` | `/admin/today` |
| `manager` | `/manager/resources` |
| `gm` | `/gm/command-center` |

PWA: manifest, service worker, offline read cache via TanStack Query persistence. **No
offline auth.** Offline means "session already valid".

## 1.7 The five-layer node — build it now

`UI_DESIGN_SPEC.md §2`. One component, six density variants. Building it here is what stops
the roles drifting apart.

```ts
export type LayerValue = {
  text: string;                       // '2.08 MT · 08:10 → 08:19 · 9 min'
  tone?: 'ok' | 'warn' | 'crit' | 'muted';
  annotations?: string[];             // ['+0.2 m', '+47 min']
  sourceRef?: string;                 // 'S1a 0B' — layer ① only
  conflictId?: string;                // 'C-01' — renders the amber marker
};

export type FiveLayerNodeProps = {
  title: string;                      // resolved from label_template
  subtitle: string;                   // 'Day 1 · PRIMARY_FIBRE · BUNKER_LINE'
  instanceLabel?: string;             // 'Load 08 of 11'
  state: ActivityState;
  blockedReason?: string;             // ALWAYS rendered when state is non-actionable
  unblocksAt?: string;                // drives the live countdown
  layers: {
    sop:      LayerValue | null;      // ① lock    — null renders '—' + sourceRef
    plan:     LayerValue | null;      // ② accent
    actual:   LayerValue | null;      // ③ tone by variance
    evidence: LayerValue | null;      // ④ '2 / 3'
    decision: LayerValue | null;      // ⑤
  };
  density: 'operator' | 'lab' | 'supervisor' | 'admin' | 'manager' | 'gm';
  onExpand?: () => void;
};
```

Rules the component enforces, not its callers:
- A null layer renders `—`, never a blank.
- `blockedReason` renders on the face of the node whenever `state` is non-actionable.
- `conflictId` renders an amber marker linking to the conflict entry.
- Layer order and colour are fixed and identical in every density.

Ship with a component-gallery route (`/dev/gallery`, admin-only, excluded from production
builds) rendering every state × every density. This is the regression surface for "not sloppy".

## 1.8 Step 1 — definition of done

| # | Check | How |
|---|---|---|
| 1 | Six accounts sign in, land on six distinct routes | Playwright |
| 2 | Role is in the JWT, not fetched | decode the access token; assert `app_metadata.app_role` |
| 3 | A role cannot read another role's data | `curl` PostgREST with a valid operator JWT against an admin-only table → expect 401/empty |
| 4 | Editing `localStorage` does not change authorisation | set a fake role, retry check 3, expect no change |
| 5 | `audit_event` cannot be updated or deleted | `curl` PATCH and DELETE with each role → expect 403 |
| 6 | Type generation is clean | `supabase gen types` produces no diff in CI |
| 7 | Both themes complete | gallery screenshots, light and dark, no unstyled element |
| 8 | Five-layer node renders every state × density | gallery route |

---

# STEP 2 — REFERENCE DATA + PROCESS ENGINE + SEED

## 2.1 Materials and roles

```sql
create type material_category as enum
  ('fibre','straw','manure','mineral','additive','water');

create table public.material (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,      -- 'BAGASSE_NEW','PADDY_PUNJAB','MUSTARD'
  name               text not null,
  category           material_category not null,
  default_unit       text not null default 'MT',
  is_nitrogen_source boolean not null default false,
  notes              text
);

create type material_role_code as enum (
  'PRIMARY_FIBRE','SECONDARY_FIBRE','STRUCTURAL_STRAW',
  'NITROGEN_SOURCE','MINERAL','PH_CORRECTOR'
);

-- which materials MAY fill which role
create table public.material_role_eligibility (
  role         material_role_code not null,
  material_id  uuid not null references material(id),
  is_default_lead boolean not null default false,
  primary key (role, material_id)
);

-- acceptance ranges for incoming lots — S4a Table 1
create table public.material_spec (
  material_id uuid not null references material(id),
  parameter   text not null,          -- 'moisture_pct','ph','n_pct','ash_pct','cn_ratio'
  min_value   numeric,
  max_value   numeric,
  unit        text,
  source_ref  text not null,          -- 'S4a Table 1'
  primary key (material_id, parameter)
);
```

**Seed** — materials from S4b row 5 + S5a: `PADDY_LOCAL`, `PADDY_PUNJAB`, `BAGASSE_NEW`,
`BAGASSE_OLD`, `WHEAT_STRAW`, `MUSTARD_STRAW`, `CHICKEN_MANURE`, `GYPSUM`,
`AMMONIUM_SULPHATE`, `LIME`, `UREA`.

Eligibility per `ADMIN_CONFIGURABILITY_MODEL.md §2`:

| Role | Eligible | Default lead |
|---|---|---|
| `PRIMARY_FIBRE` | `BAGASSE_NEW`, `BAGASSE_OLD`, `MUSTARD_STRAW`, `WHEAT_STRAW` | `BAGASSE_NEW` |
| `SECONDARY_FIBRE` | `WHEAT_STRAW`, `MUSTARD_STRAW` | none |
| `STRUCTURAL_STRAW` | `PADDY_LOCAL`, `PADDY_PUNJAB` | `PADDY_PUNJAB` |
| `NITROGEN_SOURCE` | `CHICKEN_MANURE`, `UREA` | `CHICKEN_MANURE` |
| `MINERAL` | `GYPSUM`, `AMMONIUM_SULPHATE`, `LIME` | `GYPSUM` |
| `PH_CORRECTOR` | `LIME` | none |

`material_spec` from S4a Table 1 — all 7 rows, all parameters.

## 2.2 Locations and machines

```sql
create type location_kind as enum
  ('BUNKER','TUNNEL','YARD','PILE','STRAW_PILE','SOAK_PIT','HOPPER',
   'GROWING_ROOM','EXTERNAL');

create table public.location (
  id            uuid primary key default gen_random_uuid(),
  kind          location_kind not null,
  code          text not null unique,        -- 'BUNKER-03','TUNNEL-01'
  label         text not null,
  capacity_mt   numeric,
  max_fill_height_m numeric,
  is_persistent boolean not null default true,
  is_exclusive  boolean not null default true,
  status        text not null default 'available'
);

create type machine_kind as enum
  ('LOADER_JCB','TURNER','HOPPER','ROTAVATOR','CONVEYOR',
   'VEHICLE_TRUCK','WINCH','AHU_FAN','WEIGHBRIDGE','OTHER');

create table public.machine (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  kind          machine_kind not null,
  status        text not null default 'available',
  meters_hours  boolean not null default false,
  meters_fuel   boolean not null default false
);
```

**Seed** — bunkers 1–11, tunnels 1–12 (S7a), one yard, one soak pit.
Machines per **TBD-33**: `JCB-01`, `JCB-02`, **`TURNER-01`, `TURNER-02`**, `HOPPER-01`,
`ROTAVATOR-01`, `CONVEYOR-01`, `TRUCK-01`…`TRUCK-04`.
Two turners are **required** — `TR-T1 ‖ TR-T2` is impossible with one.

## 2.3 Process definition — the core schema

```sql
create type process_status as enum ('draft','published','archived');
create type activity_scope as enum
  ('MASTER','LOAD','BUNKER_LINE','PILE','STRAW_PILE','TUNNEL','INDIVIDUAL_BATCH');
create type stream_code as enum
  ('PRIMARY_FIBRE','SECONDARY_FIBRE','STRUCTURAL_STRAW','NITROGEN_MINERAL',
   'YARD','BUNKER','TUNNEL');

create table public.process_definition (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,      -- 'PROCESS-2026B','ROUTE-2026A'
  name              text not null,
  version           int  not null default 1,
  status            process_status not null default 'draft',
  source_ref        text not null,
  anchor_day_label  text not null,             -- 'Day 0 = Fibre Weighment'
  total_days        int  not null,
  published_by      uuid, published_at timestamptz,
  unique (code, version)
);

create table public.process_activity (
  id                     uuid primary key default gen_random_uuid(),
  process_definition_id  uuid not null references process_definition(id) on delete cascade,
  code                   text not null,        -- 'FIB1-WEIGH' — NEVER a material name
  label_template         text not null,        -- '{role_lead} Weighment'
  material_role          material_role_code,   -- null for material-agnostic activities
  stream                 stream_code not null,
  rel_day                int  not null,
  seq                    int  not null,
  scope                  activity_scope not null,
  cardinality_rule       jsonb not null,
  duration_target_min_hr numeric,
  duration_target_max_hr numeric,
  duration_required_at_day0 boolean not null default false,   -- rest activities: TRUE
  is_time_gate           boolean not null default false,
  is_optional            boolean not null default false,
  default_enabled        boolean not null default true,
  golden_rule            text,
  source_ref             text not null,        -- 'W §5.2' or 'S1a data2.xml'
  tbd_marker             text,                 -- 'TBD-21' — renders amber in the UI
  unique (process_definition_id, code)
);
```

> `check (code !~* '(bagasse|paddy|mustard|wheat|gypsum|manure|urea|lime)')` on
> `process_activity.code`. Make the constraint the enforcement, not a review habit.

```sql
create table public.activity_variant (
  id                     uuid primary key default gen_random_uuid(),
  process_activity_id    uuid not null references process_activity(id) on delete cascade,
  code                   text not null,        -- 'WATER' | 'DRY'
  label                  text not null,
  selection_rule         jsonb,
  auto_select_enabled    boolean not null default false,   -- FROZEN DECISION 1
  requires_reason_on_override boolean not null default true,
  conflict_id            text,                 -- 'C-29'
  unique (process_activity_id, code)
);

create table public.activity_field (            -- six-column definition
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references process_activity(id) on delete cascade,
  key                 text not null,
  label               text not null,
  datatype            text not null,           -- numeric|text|bool|enum|duration
  unit                text,
  sop_value           text,                    -- ① frozen at activation
  sop_min             numeric,
  sop_max             numeric,
  sop_source_ref      text,
  conflict_id         text,                    -- 'C-01' when the SOP value is disputed
  day0_editable       boolean not null default true,
  day0_required       boolean not null default false,
  default_variance    text,                    -- ③ '± 1 %'
  operator_input      text not null default 'required',   -- required|optional|not_collected
  remarks_default     text,                    -- ⑤
  section             text, step_no int, display_order int,
  unique (process_activity_id, key)
);

create table public.evidence_requirement (
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references process_activity(id) on delete cascade,
  key                 text not null,           -- 'before'|'after'|'as_hand_mixing'
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

create table public.gate_rule (
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references process_activity(id) on delete cascade,
  phase               text not null check (phase in ('entry','exit')),
  kind                text not null,
  config              jsonb not null,
  predecessor_binding text check (predecessor_binding in
                        ('ALL_INSTANCES','ANY_INSTANCE','SAME_SCOPE_INSTANCE')),
  is_enabled          boolean not null default true,
  mapping_confidence  text not null default 'dictated'
                        check (mapping_confidence in
                          ('dictated','sop_direct','sop_inferred','unmapped')),
  conflict_id         text,
  blocked_reason_template text not null,
  ordering            int not null
);

create table public.movement_rule (
  process_activity_id      uuid primary key references process_activity(id) on delete cascade,
  source_kind              location_kind,
  destination_kind         location_kind,
  requires_distinct_vessel boolean not null default false,
  allow_same_vessel_override boolean not null default false,
  creates_locations        jsonb,     -- {"kind":"PILE","count_field":"yard_pile_count"}
  consumes_locations       jsonb
);

create table public.resource_requirement (
  id                  uuid primary key default gen_random_uuid(),
  process_activity_id uuid not null references process_activity(id) on delete cascade,
  machine_kind        machine_kind not null,
  quantity            int not null default 1,
  is_required         boolean not null default true,
  role_hint           text                     -- 'primary_turner' | 'secondary_turner'
);
```

## 2.4 Cardinality rule — JSON contract

Six kinds. The evaluator is a pure function `(rule, config) → instances[]`.

```jsonc
// 1 — one instance, master scope
{ "kind": "SINGLETON" }

// 2 — derived from a quantity and a capacity. FIB1-WEIGH.
{ "kind": "DERIVED_FROM_QUANTITY",
  "quantity_field": "primary_fibre_required_mt",
  "capacity_field": "expected_load_capacity_mt",
  "formula": "ceil",
  "tail_instance_takes_remainder": true }

// 3 — one per existing scope instance. P1-BUNK-LOAD, TR-T1, TR-T2.
{ "kind": "PER_SCOPE_INSTANCE", "scope": "BUNKER_LINE" }

// 4 — creates transient locations. FIB1-YARD-UNLOAD.
{ "kind": "CREATES_SCOPE_INSTANCES", "scope": "PILE",
  "count_field": "yard_pile_count", "label_prefix": "PILE" }

// 5 — merges instances. YD-HOP-COMBINE.
{ "kind": "MERGES_SCOPE_INSTANCES", "scope": "PILE",
  "from": "all_open", "to_count": 1, "new_label": "MIXED-PILE" }

// 6 — repeats N times in sequence. STRAW-SOAK-n.
{ "kind": "REPEAT", "count_field": "straw_soak_count", "index_label": "Soaking {n}" }
```

**Every kind reads a `*_field` from `batch_process_config`. No literal counts.**

## 2.5 Gate rule — JSON contract

```jsonc
{ "kind": "PREDECESSOR", "activity_codes": ["TR-T1"] }        // + predecessor_binding
{ "kind": "ELAPSED_TIME", "since": "activity_end",
  "activity_code": "TR-T0", "hours": 24 }
{ "kind": "TIME_WINDOW", "since": "activity_end", "min_hours": 8, "max_hours": 12 }
{ "kind": "DAY0_DURATION", "config_field": "rest_duration_d2_d3_hr" }   // TBD-21
{ "kind": "SENSOR_THRESHOLD", "parameter": "compost_temp_c",
  "operator": ">=", "value": 58 }
{ "kind": "EITHER_OR", "sub": [ …, … ] }
{ "kind": "BOTH",      "sub": [ …, … ] }
{ "kind": "LAB_RESULT_PASS", "checkpoint": "BUNKER_FILL",
  "parameters": ["moisture_pct","ph"] }
{ "kind": "EVIDENCE_COMPLETE" }
{ "kind": "FIELD_IN_RANGE", "field_key": "fill_height_m" }
{ "kind": "MACHINE_STINT_CLOSED" }
{ "kind": "MOVEMENT_VALID" }
{ "kind": "SUPERVISOR_RELEASE" }
{ "kind": "GM_APPROVAL", "checkpoint": 3 }
```

`blocked_reason_template` is mandatory on every rule, with `{}` placeholders:
```
"Waiting — rest period, {remaining} remaining"
"Blocked — {parameter} {actual} outside {min}–{max} on {scope_label}"
"Locked — {predecessor_label} not complete"
```

## 2.6 Seeding `PROCESS-2026B`

36 activity templates. Source: `PROCESS_V2_FACTORY_CONFIRMED.md §17`, translated to the
role-based codes in `ADMIN_CONFIGURABILITY_MODEL.md §3`.

Four representative rows showing every pattern — build the rest to match:

```sql
-- 1 · derived cardinality, no material name, no SOP bound
insert into process_activity (process_definition_id, code, label_template, material_role,
  stream, rel_day, seq, scope, cardinality_rule, source_ref)
values (:pd, 'FIB1-WEIGH', '{role_lead} Weighment', 'PRIMARY_FIBRE',
  'PRIMARY_FIBRE', 0, 10, 'LOAD',
  '{"kind":"DERIVED_FROM_QUANTITY","quantity_field":"primary_fibre_required_mt",
     "capacity_field":"expected_load_capacity_mt","formula":"ceil",
     "tail_instance_takes_remainder":true}', 'W §2');

-- 2 · conditional variant, auto-select DISABLED (frozen decision 1)
insert into activity_variant (process_activity_id, code, label, auto_select_enabled,
  conflict_id, selection_rule)
values
 (:fib1_hop2, 'WATER', 'Water Hopper Pass', false, 'C-29',
  '{"input_field":"measured_moisture_pct","if_below":"WATER","if_within_or_above":"DRY",
    "candidate_bands":[{"min":68,"max":69,"source":"S1a 0A"},
                       {"min":75,"max":78,"source":"S4a Table 2"}]}'),
 (:fib1_hop2, 'DRY',   'Dry Hopper Pass',   false, 'C-29', null);

-- 3 · time gate with NO default duration (frozen decision 2)
insert into process_activity (…, code, label_template, rel_day, scope, cardinality_rule,
  is_time_gate, duration_required_at_day0, tbd_marker, source_ref)
values (…, 'FIB1-REST-1', '{role_lead} Rest', 2, 'BUNKER_LINE',
  '{"kind":"PER_SCOPE_INSTANCE","scope":"BUNKER_LINE"}',
  true, true, 'TBD-21', 'W §4');

insert into gate_rule (process_activity_id, phase, kind, config, is_enabled,
  mapping_confidence, blocked_reason_template, ordering)
values (:fib1_rest1, 'exit', 'DAY0_DURATION',
  '{"config_field":"rest_duration_d2_d3_hr"}', true, 'dictated',
  'Resting — {remaining} of {required} remaining', 10);

-- 4 · THE T1→T2 RULE. Getting this wrong fails the build.
insert into gate_rule (process_activity_id, phase, kind, config,
  predecessor_binding, blocked_reason_template, ordering)
values (:tr_t2, 'entry', 'PREDECESSOR', '{"activity_codes":["TR-T1"]}',
  'SAME_SCOPE_INSTANCE',
  'Locked — T1 not complete on {scope_label}', 10);
```

Evidence, per `EVIDENCE_CONFIGURATION_MODEL.md §3`. Note `NMIX-ROTAVATE` takes **three**:

```sql
insert into evidence_requirement (process_activity_id, key, label, ordering) values
 (:nmix, 'before',         'Photo before mixing',              10),
 (:nmix, 'after',          'Photo after mixing',               20),
 (:nmix, 'as_hand_mixing', 'Ammonium sulphate hand mixing',    30);
```

## 2.7 Seeding `ROUTE-2026A` as archived reference

```sql
insert into process_definition (code, name, version, status, source_ref,
  anchor_day_label, total_days)
values ('ROUTE-2026A', 'SOP 17-stage reference', 1, 'archived',
  'S1a flow diagrams + S1c + S4a', 'Day 0 = Mixing', 19);
```

All 17 stages with their ~110 process-control limits. **Never executable.** It exists so the
limits are queryable and citable, and so C-28's mapping report has a left-hand side.

## 2.8 The C-28 mapping report

The largest reconciliation surface. Produce it as a **view**, so it stays live:

```sql
create view v_sop_limit_mapping as
select
  src.code            as sop_activity,
  srcf.key            as sop_field,
  srcf.sop_min, srcf.sop_max, srcf.unit, srcf.sop_source_ref,
  tgt.code            as mapped_to_activity,
  g.mapping_confidence,
  g.is_enabled,
  g.conflict_id
from process_activity src
join activity_field  srcf on srcf.process_activity_id = src.id
left join gate_rule  g    on g.config->>'sop_field_ref' = src.code || '.' || srcf.key
left join process_activity tgt on tgt.id = g.process_activity_id
where src.process_definition_id = (select id from process_definition
                                   where code = 'ROUTE-2026A');
```

Classification rule:
- `dictated` — the walkthrough states it → **enabled**
- `sop_direct` — one unambiguous target activity (tunnel fill 1.8–2.2 m → `TN-LOAD`;
  bunker fill 2.6–2.7 m → `P1-BUNK-LOAD`; T2 moisture 73–75 % → `TR-T2`) → **enabled**
- `sop_inferred` — plausible but not certain → **disabled**, listed for review
- `unmapped` — no counterpart in `PROCESS-2026B` → **disabled**, listed

Export as CSV for the client. **This is a review artefact, not an assumption.**

## 2.9 Lab, methods, control bands

`lab_spec` — S4a Tables 1–3, verbatim, with `source_ref` on every row.
`lab_method` — the 8 methods, with `C-10` flagged on the three damaged calculations
(moisture, ash, Kjeldahl sample weight) so a technician never sees a wrong procedure
presented as authoritative.
`phase2_control_band` — S1c's 7 bands × 3 probes, with `C-04/C-05/C-17` on the disputed rows
(frozen decision 5: retained, configuration-driven, visibly sourced).

## 2.10 Step 2 — definition of done

| # | Check | Query / command |
|---|---|---|
| 1 | 36 activities seeded | `select count(*) from process_activity pa join process_definition pd on pd.id=pa.process_definition_id where pd.code='PROCESS-2026B';` → **36** |
| 2 | **No material name in the definition** | `select code,label_template from process_activity where code ~* '(bagasse\|paddy\|mustard\|wheat\|gypsum\|manure)';` → **0 rows** |
| 3 | Every activity has a cardinality rule | `select count(*) from process_activity where cardinality_rule is null;` → **0** |
| 4 | No literal counts in rules | `select code from process_activity where cardinality_rule::text ~ '"count"\s*:\s*[0-9]';` → **0 rows** |
| 5 | Rest activities require a Day-0 duration | `select code from process_activity where is_time_gate and not duration_required_at_day0;` → **0 rows** |
| 6 | Hopper auto-select disabled | `select code from activity_variant where auto_select_enabled;` → **0 rows** |
| 7 | T1→T2 binds per instance | `select predecessor_binding from gate_rule g join process_activity a on a.id=g.process_activity_id where a.code='TR-T2' and g.kind='PREDECESSOR';` → **`SAME_SCOPE_INSTANCE`** |
| 8 | Every gate has a reason template | `select count(*) from gate_rule where coalesce(blocked_reason_template,'')='';` → **0** |
| 9 | Ambiguous SOP limits are disabled | `select count(*) from gate_rule where mapping_confidence in ('sop_inferred','unmapped') and is_enabled;` → **0** |
| 10 | `NMIX-ROTAVATE` has 3 evidence requirements | `select count(*) from evidence_requirement e join process_activity a on a.id=e.process_activity_id where a.code='NMIX-ROTAVATE';` → **3** |
| 11 | Two turners exist | `select count(*) from machine where kind='TURNER';` → **≥ 2** |
| 12 | `ROUTE-2026A` archived, not executable | `select status from process_definition where code='ROUTE-2026A';` → **`archived`** |
| 13 | Lab specs seeded | `select count(*) from lab_spec;` → 9 phase rows + 7 material rows + 9 water rows |
| 14 | **Mustard-for-bagasse relabels with zero code changes** | swap `is_default_lead` to `MUSTARD_STRAW` on `PRIMARY_FIBRE`; render the activity list; assert titles read "Mustard Weighment", "Mustard Hopper Pass 1"; `git diff src/` → **empty** |
| 15 | **Process is data** | add one `process_activity` row in seed SQL, re-run seed, assert the activity list grows; `git diff src/` → **empty** |

Checks **2, 7, 14 and 15** are the ones that matter. If any of those four fail, the
architecture is wrong regardless of what else passes.

---

## 3. Report back with

- The four verification outputs for checks 2, 7, 14, 15 — pasted, not summarised.
- The `v_sop_limit_mapping` CSV, with counts per `mapping_confidence`.
- Anything in `KIRO_BUILD_INSTRUCTIONS.md §7` that had to be defaulted, and how.
- Anything in the seed you could not source to a document — those are new TBDs, and they get
  IDs, not guesses.
