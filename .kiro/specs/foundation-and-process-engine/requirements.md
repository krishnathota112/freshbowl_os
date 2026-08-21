# Requirements Document

## Introduction

MushroomOS v2 is a greenfield rebuild of the mushroom-compost factory operations system for
Fresh Bowl Horticulture. This spec covers **Steps 1 and 2 only** of the twelve-step build order
in `docs/KIRO_BUILD_INSTRUCTIONS.md §3`: the foundation (repo, auth, RLS, audit, design system,
five-layer node) and the reference data + process-engine schema + `PROCESS-2026B` seed.

**This document is not a source of truth.** The specification already exists in `docs/`
(20 documents). `docs/STEP_1_2_BUILD_SPEC.md` is the authoritative, executable work order for
this scope. Every requirement below **references** a document and section rather than restating
it, so that the spec cannot drift from the work order. Where the source spec already provides a
runnable query or command, the acceptance criterion cites that query rather than describing an
inspection.

**Four requirements are architecturally load-bearing.** `docs/STEP_1_2_BUILD_SPEC.md §2.10`
states: *"Checks 2, 7, 14 and 15 are the ones that matter. If any of those four fail, the
architecture is wrong regardless of what else passes."* Those four appear here as Requirements
12, 15, 13 and 20 and are marked **[LOAD-BEARING]**.

**Out of scope for this spec** (Steps 3–12): batch creation, the Day-0 configuration wizard,
`batch_process_config`, activity instances, `generate_activity_plan`, `activate_batch`,
`evaluate_gates`, execution, lab workflow, supervisor control, GM checkpoints, and the
production graph. Steps 1 and 2 build the *definitions and mechanisms*; nothing in this spec
instantiates a batch.

**Reference-only, not a specification:** `apk_extracted/` is a decompiled legacy Android app.
`docs/KIRO_BUILD_INSTRUCTIONS.md §1` items 1b, 3 and 10 exist because of its defects. It is
never a source for behaviour.

---

## Glossary

- **Platform**: the repository, toolchain, build and CI configuration defined by
  `docs/STEP_1_2_BUILD_SPEC.md §1.1` and the fixed stack in `docs/KIRO_BUILD_INSTRUCTIONS.md §2`.
- **Auth_Subsystem**: Supabase GoTrue plus `public.profiles`, `custom_access_token_hook`,
  `current_app_role()` and `has_role()` per `docs/STEP_1_2_BUILD_SPEC.md §1.2`–`§1.3`.
- **Database**: the Supabase Postgres 15 instance, including its RLS policies, constraints,
  triggers, views and grants. The Database is the authority
  (`docs/ARCHITECTURE_V2.md §2`–`§4`).
- **Audit_Subsystem**: the `audit_event` table, its grants, and the generic `fn_audit()` trigger
  function per `docs/STEP_1_2_BUILD_SPEC.md §1.5`.
- **App_Shell**: the single React application's router, six role layouts, route guards, PWA
  manifest and service worker per `docs/STEP_1_2_BUILD_SPEC.md §1.6`.
- **Design_System**: the CSS custom-property token set and primitive component vocabulary
  defined by `docs/UI_DESIGN_SPEC.md §1`.
- **Five_Layer_Node**: the single component rendering SOP → Plan → Actual → Evidence → Decision
  per `docs/UI_DESIGN_SPEC.md §2` and the props contract in
  `docs/STEP_1_2_BUILD_SPEC.md §1.7`.
- **Component_Gallery**: the admin-only `/dev/gallery` route rendering every state × density
  variant of the Five_Layer_Node, excluded from production builds.
- **Reference_Data**: the seeded contents of `material`, `material_role_eligibility`,
  `material_spec`, `location` and `machine` per `docs/STEP_1_2_BUILD_SPEC.md §2.1`–`§2.2`.
- **Process_Engine_Schema**: the tables `process_definition`, `process_activity`,
  `activity_variant`, `activity_field`, `evidence_requirement`, `gate_rule`, `movement_rule`,
  `resource_requirement` per `docs/STEP_1_2_BUILD_SPEC.md §2.3`.
- **Process_Definition**: a row of `process_definition`. `PROCESS-2026B` is the current
  operational definition; `ROUTE-2026A` is archived SOP reference. They are never merged
  (frozen decision 3, `docs/KIRO_BUILD_INSTRUCTIONS.md §0.5`).
- **Material_Role**: one of `PRIMARY_FIBRE`, `SECONDARY_FIBRE`, `STRUCTURAL_STRAW`,
  `NITROGEN_SOURCE`, `MINERAL`, `PH_CORRECTOR` per `docs/ADMIN_CONFIGURABILITY_MODEL.md §2`.
- **Role_Lead**: the material bound to a Material_Role whose name labels that role's stream
  (`docs/ADMIN_CONFIGURABILITY_MODEL.md §2.1`).
- **Label_Resolver**: the pure function that renders `process_activity.label_template`
  (for example `'{role_lead} Weighment'`) into a display title.
- **Cardinality_Evaluator**: the pure function `(rule, config) → instances[]` over the six
  cardinality kinds in `docs/STEP_1_2_BUILD_SPEC.md §2.4`.
- **Reason_Renderer**: the pure function that interpolates a `gate_rule.blocked_reason_template`
  into a displayable reason string (`docs/STEP_1_2_BUILD_SPEC.md §2.5`).
- **SOP_Mapping_View**: the `v_sop_limit_mapping` view defined in
  `docs/STEP_1_2_BUILD_SPEC.md §2.8`; the C-28 reconciliation review artefact.
- **Lab_Reference_Data**: the seeded contents of `lab_spec`, `lab_method` and
  `phase2_control_band` per `docs/STEP_1_2_BUILD_SPEC.md §2.9`.
- **Conflict_Register**: the queryable record of the 31 conflicts and 41 TBDs catalogued in
  `docs/SOURCE_CONFLICTS.md`, together with the `conflict_id` and `tbd_marker` markers carried
  on the affected schema rows.
- **Terminology_Lint**: the lint rule over UI strings enforcing
  `docs/PROCESS_V2_FACTORY_CONFIRMED.md §19`.
- **Step 1 check N**: check number N in the table at `docs/STEP_1_2_BUILD_SPEC.md §1.8`.
- **Step 2 check N**: check number N in the table at `docs/STEP_1_2_BUILD_SPEC.md §2.10`.

---

## Requirements

### Requirement 1: Repository, toolchain and CI

**User Story:** As a developer, I want the repository laid out and the toolchain fixed exactly
as specified, so that later steps have no structural decisions left to make.

#### Acceptance Criteria

1. THE Platform SHALL provide the directory structure specified in
   `docs/STEP_1_2_BUILD_SPEC.md §1.1`, including `supabase/migrations/`, `supabase/seed/`,
   `supabase/functions/`, `src/domain/`, `src/api/`, `src/components/primitives/`,
   `src/components/node/`, `src/components/layout/`, `src/routes/`, `src/theme/`, `src/lib/`,
   `tests/rls/` and `tests/unit/`.
2. THE Platform SHALL use the exact dependency set named in `docs/KIRO_BUILD_INSTRUCTIONS.md §2`:
   React 18 with TypeScript in strict mode, Vite, TanStack Query v5, Zustand, Tailwind,
   react-router v6, `vite-plugin-pwa`, `idb`, Vitest, Playwright, ESLint and Prettier.
3. THE Platform SHALL generate `src/domain/database.types.ts` with
   `supabase gen types typescript` and SHALL commit the generated file.
4. WHEN CI runs, THE Platform SHALL execute typecheck, lint, migration application and the test
   suites, and SHALL report failure if any of them fail.
5. IF `supabase gen types typescript` produces a diff against the committed types file, THEN THE
   Platform SHALL fail CI (Step 1 check 6).
6. THE Platform SHALL number migrations forward-only and SHALL keep seed files separate from
   migrations.
7. WHEN a seed file is applied a second time to an unchanged Database, THE Platform SHALL leave
   the Database in the same state as after the first application (idempotent seeds via
   `ON CONFLICT DO UPDATE`).

### Requirement 2: Supabase project and credential hygiene

**User Story:** As the general manager, I want the new backend project provisioned with no
secret anywhere in the repository, so that a leak is impossible rather than unlikely.

#### Acceptance Criteria

1. THE Platform SHALL target Supabase project reference `szwosmyqwvpaqugjtzcp`
   (TBD-15, resolved 20 Aug 2026 in `docs/KIRO_BUILD_INSTRUCTIONS.md §7`).
2. THE Platform SHALL exclude the abandoned project reference `omsxtifyzlldaxkeqerx` from all
   configuration.
3. THE Platform SHALL read `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`,
   and `.gitignore` SHALL list `.env.local`.
4. THE Platform SHALL list `key.txt` in `.gitignore`.
5. THE Platform SHALL obtain the service-role key from Supabase's own secret store at runtime
   (`docs/KIRO_BUILD_INSTRUCTIONS.md §7`, credential handling).
6. WHEN the repository and `docs/` are searched for a database password, a service-role key or a
   connection string, THE Platform SHALL yield zero matches.
7. THE Platform SHALL establish CLI database access with `supabase link` rather than a
   hand-built connection URI (`docs/KIRO_BUILD_INSTRUCTIONS.md §7`).

### Requirement 3: Six roles carried as a JWT claim

**User Story:** As the general manager, I want a user's role to be a signed token claim, so that
authorisation cannot be forged by editing browser storage — the defect admitted by the legacy
app in S8d.

#### Acceptance Criteria

1. THE Auth_Subsystem SHALL define the enum `app_role` with exactly the six values `gm`,
   `manager`, `admin`, `supervisor`, `operator`, `lab_tech`
   (`docs/STEP_1_2_BUILD_SPEC.md §1.2`).
2. THE Auth_Subsystem SHALL store one `public.profiles` row per `auth.users` row, carrying
   `display_name`, `role`, `shift` and `is_active`.
3. WHEN an access token is issued, THE Auth_Subsystem SHALL set the claim
   `app_metadata.app_role` from `profiles.role` using `custom_access_token_hook`
   (Step 1 check 2).
4. THE Auth_Subsystem SHALL grant execute on `custom_access_token_hook` to
   `supabase_auth_admin` only, and SHALL revoke it from `authenticated`, `anon` and `public`.
5. THE Auth_Subsystem SHALL expose `current_app_role()` and `has_role(variadic app_role[])` as
   the only role readers used by policies and guards.
6. THE App_Shell SHALL derive the current role from the session JWT claim and SHALL make no
   request for the role after sign-in.
7. WHEN a role value in browser storage is altered, THE Database SHALL return the same rows as
   before the alteration for the same access token (Step 1 check 4).
8. THE Platform SHALL exclude any locally stored credential table from the codebase
   (`docs/ARCHITECTURE_V2.md §12`).

### Requirement 4: Row-level security denies by default

**User Story:** As the general manager, I want every table closed until a policy opens it, so
that a forgotten policy fails safe.

#### Acceptance Criteria

1. THE Database SHALL enable row level security on every table in schema `public` in the same
   migration that creates that table (`docs/STEP_1_2_BUILD_SPEC.md §1.4`).
2. WHERE a table holds reference data, THE Database SHALL grant select to `authenticated` and
   SHALL restrict insert, update and delete to callers satisfying `has_role('admin')`.
3. THE Database SHALL revoke insert, update and delete on every process-state table from
   `authenticated` and `anon` (`docs/ARCHITECTURE_V2.md §3`).
4. WHEN PostgREST is called with a valid `operator` access token against a table readable only
   by `admin`, THE Database SHALL return an empty result set or HTTP 401
   (Step 1 check 3).
5. THE Platform SHALL provide one RLS test file per role under `tests/rls/`.

### Requirement 5: Immutable audit trail

**User Story:** As the general manager, I want the audit record to be impossible to alter, so
that the record of what happened is worth trusting.

#### Acceptance Criteria

1. THE Audit_Subsystem SHALL create `audit_event` with the columns specified in
   `docs/STEP_1_2_BUILD_SPEC.md §1.5`: `occurred_at`, `actor_id`, `actor_role`, `action`,
   `entity_table`, `entity_id`, `before_state`, `after_state`, `reason`, `request_id`.
2. THE Audit_Subsystem SHALL restrict select on `audit_event` to callers satisfying
   `has_role('gm','manager','admin','supervisor')`.
3. THE Audit_Subsystem SHALL revoke insert, update and delete on `audit_event` from
   `authenticated` and `anon`.
4. WHEN PostgREST receives a `PATCH` or `DELETE` on `audit_event` with an access token for any
   of the six roles, THE Database SHALL respond with HTTP 403 (Step 1 check 5).
5. THE Audit_Subsystem SHALL provide `fn_audit()` as a `SECURITY DEFINER` trigger function that
   writes actor, actor role, operation, table, entity id, before state and after state.
6. THE Audit_Subsystem SHALL make trigger execution the only write path into `audit_event`.

### Requirement 6: App shell, role routing and PWA

**User Story:** As each of the six roles, I want to sign in and arrive at my own home screen, so
that the application starts where my work is.

#### Acceptance Criteria

1. THE App_Shell SHALL provide one router with six role layouts
   (`docs/STEP_1_2_BUILD_SPEC.md §1.6`).
2. WHEN a user signs in, THE App_Shell SHALL navigate to the home route for the role in the JWT
   claim: `operator` → `/operator/my-work`, `lab_tech` → `/lab/queue`, `supervisor` →
   `/supervisor/control-room`, `admin` → `/admin/today`, `manager` → `/manager/resources`,
   `gm` → `/gm/command-center` (Step 1 check 1).
3. IF a signed-in user requests a route not permitted for the role in the JWT claim, THEN THE
   App_Shell SHALL redirect that user to the home route for that role.
4. THE App_Shell SHALL treat the route guard as defence in depth and SHALL rely on the Database
   as the authorisation boundary.
5. THE App_Shell SHALL ship a PWA manifest and a service worker, and SHALL cache reads through
   TanStack Query persistence backed by IndexedDB.
6. WHILE the device is offline, THE App_Shell SHALL keep an already-valid session usable and
   SHALL offer no offline sign-in path (`docs/ARCHITECTURE_V2.md §5`).

### Requirement 7: Design token system

**User Story:** As every role, I want one visual language across the product, so that the
application reads as a factory operating system rather than a prettier spreadsheet.

#### Acceptance Criteria

1. THE Design_System SHALL implement the neutral, accent and semantic token values fixed in
   `docs/UI_DESIGN_SPEC.md §1` as CSS custom properties.
2. THE Design_System SHALL define a complete dark-theme redefinition of every token
   (Step 1 check 7).
3. THE Design_System SHALL apply Archivo to headings, labels, buttons and chips, Public Sans to
   body copy, and IBM Plex Mono to every number, code, batch identifier, time, duration and
   quantity.
4. THE Design_System SHALL set `font-variant-numeric: tabular-nums` wherever digits align in a
   column.
5. THE Design_System SHALL expose the semantic tones `ok`, `warn`, `crit`, `inherit` and `lock`
   for meaning only.
6. THE Design_System SHALL provide the primitives `Chip`, `Stat`, `Field`, `Card`, `Bar` and
   `Countdown` under `src/components/primitives/`.
7. WHEN a component renders a colour, spacing or type value, THE Design_System SHALL supply it
   as a token reference rather than a literal.

### Requirement 8: The five-layer node component

**User Story:** As every role, I want the same five-layer information structure everywhere, so
that six role experiences cannot drift into six inconsistent products.

#### Acceptance Criteria

1. THE Five_Layer_Node SHALL implement the props contract in
   `docs/STEP_1_2_BUILD_SPEC.md §1.7`, including `title`, `subtitle`, `instanceLabel`, `state`,
   `blockedReason`, `unblocksAt`, the five `layers` entries and `density`.
2. THE Five_Layer_Node SHALL render layers in the fixed order SOP → Plan → Actual → Evidence →
   Decision with the fixed colour assignment in `docs/UI_DESIGN_SPEC.md §2.1` in every density.
3. WHERE a layer value is null, THE Five_Layer_Node SHALL render an em dash and SHALL render the
   layer's `sourceRef` when one is supplied.
4. WHILE `state` is non-actionable, THE Five_Layer_Node SHALL render `blockedReason` on the face
   of the node.
5. WHERE a layer carries a `conflictId`, THE Five_Layer_Node SHALL render an amber marker
   displaying that identifier and linking to its Conflict_Register entry.
6. WHERE `unblocksAt` is supplied, THE Five_Layer_Node SHALL render a live countdown.
7. THE Five_Layer_Node SHALL support the six densities `operator`, `lab`, `supervisor`, `admin`,
   `manager` and `gm` per the table in `docs/UI_DESIGN_SPEC.md §2.2`.
8. THE Five_Layer_Node SHALL enforce criteria 2 through 6 within the component rather than
   relying on its callers.
9. THE Component_Gallery SHALL render every activity state × every density at `/dev/gallery`,
   SHALL restrict access to `admin`, and SHALL be excluded from production builds
   (Step 1 check 8).

### Requirement 9: Materials, material roles and eligibility

**User Story:** As an admin, I want materials and the roles they may fill held as reference data,
so that a batch using mustard instead of bagasse is a configuration choice.

#### Acceptance Criteria

1. THE Database SHALL create `material`, `material_role_eligibility` and `material_spec` with
   the columns, enums and keys specified in `docs/STEP_1_2_BUILD_SPEC.md §2.1`.
2. THE Reference_Data SHALL seed the eleven materials named in
   `docs/STEP_1_2_BUILD_SPEC.md §2.1`: `PADDY_LOCAL`, `PADDY_PUNJAB`, `BAGASSE_NEW`,
   `BAGASSE_OLD`, `WHEAT_STRAW`, `MUSTARD_STRAW`, `CHICKEN_MANURE`, `GYPSUM`,
   `AMMONIUM_SULPHATE`, `LIME`, `UREA`.
3. THE Reference_Data SHALL seed `material_role_eligibility` with the eligibility and
   default-lead assignments in the table at `docs/STEP_1_2_BUILD_SPEC.md §2.1`.
4. THE Reference_Data SHALL seed `material_spec` from S4a Table 1 with all seven rows and SHALL
   record `source_ref` on every row.
5. THE Database SHALL define `material_role_code` with exactly the six values in
   `docs/ADMIN_CONFIGURABILITY_MODEL.md §2`.
6. THE Reference_Data SHALL record `tbd_marker` `TBD-40` against the `STRUCTURAL_STRAW`
   eligibility set, which allows a non-paddy material while every record uses paddy.

### Requirement 10: Locations and machines

**User Story:** As a manager, I want vessels and machines held as first-class contended
resources, so that the two-turner parallelism in the process is physically possible.

#### Acceptance Criteria

1. THE Database SHALL create `location` and `machine` with the columns and enums specified in
   `docs/STEP_1_2_BUILD_SPEC.md §2.2`.
2. THE Reference_Data SHALL seed bunkers 1 to 11 and tunnels 1 to 12 from S7a, one yard and one
   soak pit.
3. THE Reference_Data SHALL seed at least two machines of kind `TURNER`, so that `TR-T1` and
   `TR-T2` can run in parallel (TBD-33, Step 2 check 11):
   `select count(*) from machine where kind='TURNER';` → **≥ 2**.
4. THE Reference_Data SHALL seed `JCB-01`, `JCB-02`, `TURNER-01`, `TURNER-02`, `HOPPER-01`,
   `ROTAVATOR-01`, `CONVEYOR-01` and `TRUCK-01` through `TRUCK-04`.
5. THE Reference_Data SHALL record `tbd_marker` `TBD-33` against the machine seed, because the
   real fleet size is unconfirmed.

### Requirement 11: The process-definition schema

**User Story:** As a developer, I want the process expressed as tables, so that the process can
change without the application changing.

#### Acceptance Criteria

1. THE Process_Engine_Schema SHALL create `process_definition`, `process_activity`,
   `activity_variant`, `activity_field`, `evidence_requirement`, `gate_rule`, `movement_rule`
   and `resource_requirement` with the columns, enums, keys and defaults specified in
   `docs/STEP_1_2_BUILD_SPEC.md §2.3`.
2. THE Process_Engine_Schema SHALL define `process_status`, `activity_scope`, `stream_code` and
   `machine_kind` with exactly the values listed in `docs/STEP_1_2_BUILD_SPEC.md §2.2`–`§2.3`.
3. THE Process_Engine_Schema SHALL make `process_activity.cardinality_rule` `NOT NULL`
   (Step 2 check 3):
   `select count(*) from process_activity where cardinality_rule is null;` → **0**.
4. THE Process_Engine_Schema SHALL make `gate_rule.blocked_reason_template` `NOT NULL` and
   SHALL constrain `gate_rule.predecessor_binding` to `ALL_INSTANCES`, `ANY_INSTANCE` or
   `SAME_SCOPE_INSTANCE`.
5. THE Process_Engine_Schema SHALL constrain `gate_rule.mapping_confidence` to `dictated`,
   `sop_direct`, `sop_inferred` or `unmapped`.
6. THE Process_Engine_Schema SHALL provide the six-column definition columns on
   `activity_field`: `sop_value`, `day0_editable` / `day0_required`, `default_variance`,
   `operator_input`, `remarks_default` and `section`
   (`docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 5).
7. THE Process_Engine_Schema SHALL require `source_ref` on `process_definition` and
   `process_activity`.
8. THE Process_Engine_Schema SHALL model evidence as named requirements with `key`, `label`,
   `media_kinds`, `min_count`, `is_required` and `gates_submission`, per
   `docs/EVIDENCE_CONFIGURATION_MODEL.md §2`.

### Requirement 12: No material name in the process definition **[LOAD-BEARING]**

**User Story:** As an admin, I want the process definition to bind to material roles rather than
material names, so that changing what the factory buys is not a code change.
*Rationale: `docs/ADMIN_CONFIGURABILITY_MODEL.md §1`; `docs/KIRO_BUILD_INSTRUCTIONS.md §0.6 A`.*

#### Acceptance Criteria

1. THE Process_Engine_Schema SHALL enforce a `CHECK` constraint on `process_activity.code`
   rejecting the pattern `(bagasse|paddy|mustard|wheat|gypsum|manure|urea|lime)`
   case-insensitively (`docs/STEP_1_2_BUILD_SPEC.md §2.3`).
2. WHEN an insert or update supplies a `process_activity.code` containing a material name, THE
   Database SHALL reject the statement.
3. THE Process_Engine_Schema SHALL carry the material binding as
   `process_activity.material_role` referencing `material_role_code`, and SHALL carry the
   display name as `process_activity.label_template`.
4. THE Reference_Data SHALL seed the role-based activity codes from the mapping table in
   `docs/ADMIN_CONFIGURABILITY_MODEL.md §3` — `FIB1-WEIGH` rather than `BG-WEIGH`.
5. WHEN the verification query in Step 2 check 2 is run,
   `select code,label_template from process_activity where code ~* '(bagasse|paddy|mustard|wheat|gypsum|manure)';`
   THE Database SHALL return **0 rows**.
6. THE Label_Resolver SHALL substitute the Role_Lead material name for the `{role_lead}`
   placeholder, so that `'{role_lead} Weighment'` renders as "Bagasse Weighment" when
   `BAGASSE_NEW` leads `PRIMARY_FIBRE`.
7. FOR ALL seeded `label_template` values and FOR ALL role-lead bindings, THE Label_Resolver
   SHALL produce a string containing no unresolved `{` or `}` placeholder.
8. WHEN `is_default_lead` for `PRIMARY_FIBRE` is changed from `BAGASSE_NEW` to `MUSTARD_STRAW`
   in seed data, THE Label_Resolver SHALL render the same activity codes with titles reading
   "Mustard Weighment" and "Mustard Hopper Pass 1", and `git diff src/` SHALL be empty
   (Step 2 check 14).
9. WHEN `src/` is searched for the pattern `\b(bagasse|paddy|mustard|wheat|gypsum)\b`, THE
   Platform SHALL yield matches only in copy that resolves from a label template, and none in
   schema, seed activity codes or gate logic (`docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 1b).

### Requirement 13: Cardinality is a rule, never a count **[LOAD-BEARING]**

**User Story:** As an admin, I want every instance count derived from configuration, so that
eleven loads, two piles, three bunkers and three tunnels are answers rather than assumptions.
*Rationale: `docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 1; `docs/DOMAIN_MODEL.md §8.3`.*

#### Acceptance Criteria

1. THE Process_Engine_Schema SHALL express cardinality as the JSON contract in
   `docs/STEP_1_2_BUILD_SPEC.md §2.4` with exactly six kinds: `SINGLETON`,
   `DERIVED_FROM_QUANTITY`, `PER_SCOPE_INSTANCE`, `CREATES_SCOPE_INSTANCES`,
   `MERGES_SCOPE_INSTANCES` and `REPEAT`.
2. THE Reference_Data SHALL express every count in a `cardinality_rule` as a `*_field`
   reference resolved from Day-0 configuration rather than as a literal.
3. WHEN the verification query in Step 2 check 4 is run,
   `select code from process_activity where cardinality_rule::text ~ '"count"\s*:\s*[0-9]';`
   THE Database SHALL return **0 rows**.
4. WHEN `src/` is searched for literal instance counts per
   `docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 1, THE Platform SHALL yield zero matches.
5. THE Cardinality_Evaluator SHALL be a pure function of `(rule, config)` returning an ordered
   list of instances, with no read of the current date, no read of live state and no write.
6. WHEN the Cardinality_Evaluator is given a `DERIVED_FROM_QUANTITY` rule, THE
   Cardinality_Evaluator SHALL return `ceil(quantity / capacity)` instances — 21.0 MT at 2.0 MT
   returning 11, and 21.0 MT at 2.5 MT returning 9 (frozen decision 4,
   `docs/KIRO_BUILD_INSTRUCTIONS.md §0.5`).
7. FOR ALL positive quantities and positive capacities, THE Cardinality_Evaluator SHALL produce
   instances whose planned quantities sum to the requested quantity, with the remainder carried
   by the tail instance WHERE `tail_instance_takes_remainder` is true.
8. FOR ALL positive quantities and capacities, THE Cardinality_Evaluator SHALL return an
   instance count that does not increase when capacity increases.
9. IF a `cardinality_rule` references a configuration field that is absent, THEN THE
   Cardinality_Evaluator SHALL return an error naming the missing field.
10. THE Cardinality_Evaluator SHALL assign each returned instance a stable index and a scope
    label derived from the rule's `index_label`, `label_prefix` or `new_label` where present.

### Requirement 14: Gate rules and blocked reasons

**User Story:** As an operator, I want every blocked activity to state why on its face, so that
waiting is never unexplained.

#### Acceptance Criteria

1. THE Process_Engine_Schema SHALL support the gate kinds enumerated in
   `docs/STEP_1_2_BUILD_SPEC.md §2.5` as `gate_rule.kind` values with their JSON `config`
   shapes.
2. THE Reference_Data SHALL supply a non-empty `blocked_reason_template` on every seeded
   `gate_rule` (Step 2 check 8):
   `select count(*) from gate_rule where coalesce(blocked_reason_template,'')='';` → **0**.
3. FOR ALL seeded `gate_rule` rows and FOR ALL placeholder value sets drawn from the rule's
   `config`, THE Reason_Renderer SHALL produce a non-empty string containing no unresolved `{`
   or `}` placeholder.
4. THE Process_Engine_Schema SHALL record `phase` on every `gate_rule` as `entry` or `exit`.
5. THE Reference_Data SHALL record `conflict_id` on every `gate_rule` whose bound is disputed by
   an entry in `docs/SOURCE_CONFLICTS.md`.

### Requirement 15: T1 → T2 binds per scope instance **[LOAD-BEARING]**

**User Story:** As a supervisor, I want pile 2's turner pass T2 to wait only on pile 2's T1, so
that three piles progress independently rather than through a global barrier.
*Rationale: `docs/STEP_1_2_BUILD_SPEC.md §2.6` item 4 — "Getting this wrong fails the build";
`docs/DOMAIN_MODEL.md §8.4`.*

#### Acceptance Criteria

1. THE Reference_Data SHALL seed an `entry` `gate_rule` on `TR-T2` of kind `PREDECESSOR` with
   `config` `{"activity_codes":["TR-T1"]}` and `predecessor_binding` `SAME_SCOPE_INSTANCE`.
2. WHEN the verification query in Step 2 check 7 is run,
   `select predecessor_binding from gate_rule g join process_activity a on a.id=g.process_activity_id where a.code='TR-T2' and g.kind='PREDECESSOR';`
   THE Database SHALL return **`SAME_SCOPE_INSTANCE`**.
3. THE Reference_Data SHALL set the `TR-T2` gate's `blocked_reason_template` to
   `'Locked — T1 not complete on {scope_label}'`.
4. THE Reference_Data SHALL seed `TR-T1` and `TR-T2` with `scope` `PILE` and a
   `PER_SCOPE_INSTANCE` cardinality rule.
5. THE Reference_Data SHALL seed `resource_requirement` rows giving `TR-T1` and `TR-T2` distinct
   turner `role_hint` values, so that a single turner cannot satisfy both.

### Requirement 16: Seed `PROCESS-2026B`

**User Story:** As an admin, I want the confirmed factory process loaded as data, so that the
operational process is version-controlled rather than described.

#### Acceptance Criteria

1. THE Reference_Data SHALL seed `PROCESS-2026B` with `status` `published` and the 36 activity
   templates from `docs/PROCESS_V2_FACTORY_CONFIRMED.md §17`, translated to the role-based codes
   in `docs/ADMIN_CONFIGURABILITY_MODEL.md §3` (Step 2 check 1):
   `select count(*) from process_activity pa join process_definition pd on pd.id=pa.process_definition_id where pd.code='PROCESS-2026B';`
   → **36**.
2. THE Reference_Data SHALL record `stream`, `rel_day`, `seq`, `scope`, `cardinality_rule`,
   duration targets, `source_ref`, evidence requirements, movement rules and resource
   requirements on the seeded activities.
3. THE Reference_Data SHALL define the streams `PRIMARY_FIBRE`, `SECONDARY_FIBRE`,
   `STRUCTURAL_STRAW`, `NITROGEN_MINERAL`, `YARD`, `BUNKER` and `TUNNEL`, and SHALL seed no
   activity for `SECONDARY_FIBRE` while TBD-39 is open
   (`docs/KIRO_BUILD_INSTRUCTIONS.md §7`).
4. THE Reference_Data SHALL seed every time-gate activity with
   `duration_required_at_day0 = true`, no default duration and `tbd_marker` `TBD-21`
   (frozen decision 2; Step 2 check 5):
   `select code from process_activity where is_time_gate and not duration_required_at_day0;`
   → **0 rows**.
5. THE Reference_Data SHALL seed every `activity_variant` with `auto_select_enabled = false`
   (frozen decision 1; Step 2 check 6):
   `select code from activity_variant where auto_select_enabled;` → **0 rows**.
6. THE Reference_Data SHALL seed the hopper-pass variants `WATER` and `DRY` with `conflict_id`
   `C-29`, `requires_reason_on_override = true`, and a `selection_rule` carrying both candidate
   moisture bands with their source references (68–69 % from S1a 0A, 75–78 % from S4a Table 2).
7. THE Reference_Data SHALL seed three evidence requirements on `NMIX-ROTAVATE` — `before`,
   `after` and `as_hand_mixing` (Step 2 check 10):
   `select count(*) from evidence_requirement e join process_activity a on a.id=e.process_activity_id where a.code='NMIX-ROTAVATE';`
   → **3**.
8. THE Reference_Data SHALL seed `PROCESS-2026B` with exactly one Phase-1 reload on Day 12
   (frozen decision 3, conflict C-25).
9. THE Reference_Data SHALL record `golden_rule` text verbatim from
   `docs/PROCESS_V2_FACTORY_CONFIRMED.md` where the source states one.
10. THE Reference_Data SHALL set `movement_rule.requires_distinct_vessel = true` on the reload
    activities, so that a reload's destination differs from its source.

### Requirement 17: Seed `ROUTE-2026A` as archived reference

**User Story:** As a compost manager, I want the SOP's process-control limits queryable and
citable, so that the new process can be reconciled against the standard without merging them.

#### Acceptance Criteria

1. THE Reference_Data SHALL seed `ROUTE-2026A` with `status` `archived`, `source_ref`
   `'S1a flow diagrams + S1c + S4a'`, `anchor_day_label` `'Day 0 = Mixing'` and `total_days` 19
   (Step 2 check 12): `select status from process_definition where code='ROUTE-2026A';` →
   **`archived`**.
2. THE Reference_Data SHALL seed all 17 SOP stages from `docs/DOMAIN_MODEL.md §4` with their
   process-control limits as `activity_field` rows carrying `sop_min`, `sop_max`, `unit` and
   `sop_source_ref`.
3. THE Database SHALL make `ROUTE-2026A` non-executable, in that no batch may reference an
   archived Process_Definition.
4. THE Reference_Data SHALL keep `ROUTE-2026A` and `PROCESS-2026B` as separate
   `process_definition` rows (frozen decision 3 — never merged).

### Requirement 18: The C-28 SOP limit mapping review artefact

**User Story:** As a compost manager, I want every SOP limit's mapping onto the new process
listed with its confidence, so that an uncertain mapping is reviewed rather than silently
enforced.

#### Acceptance Criteria

1. THE Database SHALL create the view `v_sop_limit_mapping` as defined in
   `docs/STEP_1_2_BUILD_SPEC.md §2.8`, joining `ROUTE-2026A` activity fields to the
   `PROCESS-2026B` gate rules that reference them.
2. THE Reference_Data SHALL classify every mapped limit as `dictated`, `sop_direct`,
   `sop_inferred` or `unmapped` per the classification rule in
   `docs/STEP_1_2_BUILD_SPEC.md §2.8`.
3. THE Reference_Data SHALL set `is_enabled = true` only WHERE `mapping_confidence` is
   `dictated` or `sop_direct` (Step 2 check 9):
   `select count(*) from gate_rule where mapping_confidence in ('sop_inferred','unmapped') and is_enabled;`
   → **0**.
4. THE Reference_Data SHALL record `conflict_id` `C-28` on every `sop_inferred` and `unmapped`
   row.
5. THE Database SHALL allow `v_sop_limit_mapping` to be exported as CSV with a count per
   `mapping_confidence` value, as the deliverable named in
   `docs/STEP_1_2_BUILD_SPEC.md §3`.
6. THE Reference_Data SHALL enable the three `sop_direct` mappings named in
   `docs/STEP_1_2_BUILD_SPEC.md §2.8`: tunnel fill 1.8–2.2 m onto `TN-LOAD`, bunker fill
   2.6–2.7 m onto `P1-BUNK-LOAD`, and T2 moisture 73–75 % onto `TR-T2`.

### Requirement 19: Lab specifications, methods and control bands

**User Story:** As a lab technician, I want specifications and methods loaded with their sources,
so that I never follow a procedure that is presented as authoritative but known to be damaged.

#### Acceptance Criteria

1. THE Lab_Reference_Data SHALL seed `lab_spec` from S4a Tables 1 to 3 with `source_ref` on
   every row (Step 2 check 13): `select count(*) from lab_spec;` → **9 phase rows + 7 material
   rows + 9 water rows**.
2. THE Lab_Reference_Data SHALL seed the eight methods from
   `docs/LAB_MODEL.md §4` as `lab_method` rows.
3. THE Lab_Reference_Data SHALL record `conflict_id` `C-10` on the three damaged calculations —
   moisture, ash and Kjeldahl sample weight.
4. THE Lab_Reference_Data SHALL seed `phase2_control_band` with S1c's seven bands across three
   probes.
5. THE Lab_Reference_Data SHALL record `conflict_id` `C-04`, `C-05` or `C-17` on the disputed
   Phase-2 band rows (frozen decision 5 — retained, configuration-driven, visibly sourced).
6. WHERE no source gives a bound for a parameter, THE Lab_Reference_Data SHALL leave the minimum
   and maximum values null (`docs/LAB_MODEL.md §9`).

### Requirement 20: The process is data, not code **[LOAD-BEARING]**

**User Story:** As an admin, I want a process change to be a seed-SQL change, so that the
factory's process can evolve without a release.
*Rationale: `docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 2;
`docs/PROCESS_V2_FACTORY_CONFIRMED.md §18`.*

#### Acceptance Criteria

1. WHEN one `process_activity` row is added in seed SQL and the seed is re-run, THE App_Shell
   SHALL display the added activity in the activity list, and `git diff src/` SHALL be empty
   (Step 2 check 15).
2. WHEN a duration target, an `activity_field` or an `evidence_requirement` is changed in seed
   SQL and the seed is re-run, THE App_Shell SHALL reflect the change with `git diff src/`
   empty.
3. THE App_Shell SHALL derive every activity list, label, duration target, evidence requirement
   and gate reason from the Database rather than from application constants.
4. THE Platform SHALL contain no enumeration of activity codes in `src/` that would require
   editing when an activity is added.

### Requirement 21: Conflicts and TBDs are preserved as data

**User Story:** As the general manager, I want every unresolved question visible where it
matters, so that the product never presents a guess as factory truth.

#### Acceptance Criteria

1. THE Conflict_Register SHALL hold all 31 conflicts and all 41 TBDs catalogued in
   `docs/SOURCE_CONFLICTS.md`, each with its identifier, question, disputing sources and current
   ship-with default.
2. THE Reference_Data SHALL record the applicable `conflict_id` or `tbd_marker` on every
   `process_activity`, `activity_field`, `activity_variant`, `gate_rule` and
   `phase2_control_band` row affected by an entry in the Conflict_Register.
3. WHERE a rendered value carries a `conflict_id` or `tbd_marker`, THE App_Shell SHALL render an
   amber marker naming that identifier at the point of use, linking to its Conflict_Register
   entry (`docs/UI_DESIGN_SPEC.md §5`).
4. THE Reference_Data SHALL record the five frozen decisions in
   `docs/KIRO_BUILD_INSTRUCTIONS.md §0.5` as decided, and SHALL keep their underlying questions
   marked open where `docs/SOURCE_CONFLICTS.md` states the question remains open.
5. THE Reference_Data SHALL leave no Conflict_Register entry resolved by seed data that
   `docs/SOURCE_CONFLICTS.md` records as unresolved.
6. WHEN a seeded value cannot be traced to a source document, THE Reference_Data SHALL record a
   new TBD identifier against it and SHALL report it per
   `docs/STEP_1_2_BUILD_SPEC.md §3`.

### Requirement 22: Never invent a threshold

**User Story:** As a compost manager, I want an unspecified bound recorded as unspecified, so
that no number the factory never stated becomes a gate.

#### Acceptance Criteria

1. WHERE no source document gives a bound for an `activity_field`, THE Reference_Data SHALL
   leave `sop_min`, `sop_max` and `sop_value` null and SHALL record `sop_source_ref` as the
   citation for the absence.
2. WHEN the Five_Layer_Node renders a SOP layer with no bound, THE Five_Layer_Node SHALL render
   an em dash with the source reference rather than a substituted value
   (`docs/UI_DESIGN_SPEC.md §2.1`).
3. THE Reference_Data SHALL seed no default duration for any activity whose duration the source
   documents leave unstated (`docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 6).
4. WHERE two sources give different bounds for the same parameter, THE Reference_Data SHALL
   record both candidate bands with their source references and SHALL record the `conflict_id`
   rather than selecting one.

### Requirement 23: Terminology lock

**User Story:** As a supervisor, I want the application to use the factory's own words, so that
the record reads as the factory speaks.

#### Acceptance Criteria

1. THE Terminology_Lint SHALL check UI strings against the locked terminology table in
   `docs/PROCESS_V2_FACTORY_CONFIRMED.md §19`.
2. WHEN a UI string contains "weighing", "weighting" or "payment" in place of "Weighment", THE
   Terminology_Lint SHALL fail the build.
3. THE Terminology_Lint SHALL enforce the remaining locked terms: "Hopper Pass", "Dry Hopper
   Pass", "Water Hopper Pass", "Rotavator", "Bale cutting", "Flip", "Turner pass T0 / T1 / T2",
   "Reload", "Pile", "Paddy pile" and "Mixed pile".
4. THE Platform SHALL run the Terminology_Lint in CI.

---

## Traceability to the source verification standard

Every acceptance criterion above traces to a check in `docs/STEP_1_2_BUILD_SPEC.md`. The
reverse mapping:

| Source check | Requirement |
|---|---|
| Step 1 check 1 — six accounts, six routes | 6.2 |
| Step 1 check 2 — role is a JWT claim | 3.3, 3.6 |
| Step 1 check 3 — cross-role read refused | 4.4 |
| Step 1 check 4 — localStorage cannot change authorisation | 3.7 |
| Step 1 check 5 — `audit_event` immutable | 5.4 |
| Step 1 check 6 — type generation clean | 1.5 |
| Step 1 check 7 — both themes complete | 7.2 |
| Step 1 check 8 — node × every state × density | 8.9 |
| Step 2 check 1 — 36 activities | 16.1 |
| Step 2 check 2 — **no material name** | **12.5** |
| Step 2 check 3 — every activity has a cardinality rule | 11.3 |
| Step 2 check 4 — no literal counts | 13.3 |
| Step 2 check 5 — rest activities require a Day-0 duration | 16.4 |
| Step 2 check 6 — hopper auto-select disabled | 16.5 |
| Step 2 check 7 — **T1 → T2 per instance** | **15.2** |
| Step 2 check 8 — every gate has a reason template | 14.2 |
| Step 2 check 9 — ambiguous SOP limits disabled | 18.3 |
| Step 2 check 10 — `NMIX-ROTAVATE` has 3 evidence requirements | 16.7 |
| Step 2 check 11 — two turners | 10.3 |
| Step 2 check 12 — `ROUTE-2026A` archived | 17.1 |
| Step 2 check 13 — lab specs seeded | 19.1 |
| Step 2 check 14 — **mustard-for-bagasse relabels, zero code change** | **12.8** |
| Step 2 check 15 — **process is data** | **20.1** |
