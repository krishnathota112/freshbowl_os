# Implementation Plan

## Overview

Steps 1 and 2 of `docs/KIRO_BUILD_INSTRUCTIONS.md §3`: the foundation and the process engine.

Ordered so that everything buildable without a database comes first, because the Docker daemon is
currently stopped. **Tasks 1–8 need no database. Task 9 is the one gate that does**, so if Docker
cannot be started the work does not stall — it stalls at 9.

Every task ends in something checkable. The 15 checks from `docs/STEP_1_2_BUILD_SPEC.md §1.8` and
`§2.10` are built as executable assertions in task 21, not left as prose. Four of them — 2, 7, 14
and 15 — decide whether the architecture is right; they are covered by tasks 13, 15, 21.3 and 20.

## Task Dependency Graph

```
1 ─┬─► 2 ─► 3 ─┬─► 6 ─► 7 ──────────────────────┐
   │            │                                │
   ├─► 4 ───────┴─► 5.1 ─┐                        │
   │                      ├─► 5.2 ────────────────┤
   ├─► 8                  │                        │
   │                      │                        ▼
   └─► 9 ─► 10.1 ─► 10.2 ─┴─► 10.3 ─► 11.1 ─► 11.2 ─► 11.3 ─► 11.4
                                                              │
        ┌─────────────────────────────────────────────────────┘
        ▼
       12 ─► 13 ─┬─► 14 ─┐
                 ├─► 15 ─┤
                 └─► 16 ─┼─► 17 ─► 18 ─► 19 ─► 20 ─► 21.1 ─┐
                         │                                  ├─► 21.2 ─► 21.3 ─► 21.4 ─► 22 ─► 23
                         └──────────────────────────────────┘
```

```json
{
  "waves": [
    { "wave": 1,  "tasks": ["1"],                  "note": "repo scaffold — everything depends on it" },
    { "wave": 2,  "tasks": ["2", "4", "8", "9"],   "note": "9 is externally blocked on Docker; 2/4/8 proceed regardless" },
    { "wave": 3,  "tasks": ["3", "5.1", "10.1"] },
    { "wave": 4,  "tasks": ["5.2", "6", "10.2"] },
    { "wave": 5,  "tasks": ["7", "10.3"] },
    { "wave": 6,  "tasks": ["11.1"] },
    { "wave": 7,  "tasks": ["11.2"],               "note": "material-name CHECK lands here — load-bearing check 2" },
    { "wave": 8,  "tasks": ["11.3"] },
    { "wave": 9,  "tasks": ["11.4"] },
    { "wave": 10, "tasks": ["12"] },
    { "wave": 11, "tasks": ["13"],                 "note": "the 36-activity seed — widest task, slow down here" },
    { "wave": 12, "tasks": ["14", "15", "16"],     "note": "15 carries SAME_SCOPE_INSTANCE — load-bearing check 7" },
    { "wave": 13, "tasks": ["17"] },
    { "wave": 14, "tasks": ["18"] },
    { "wave": 15, "tasks": ["19"] },
    { "wave": 16, "tasks": ["20"],                 "note": "demo surface — load-bearing checks 13 and 14 become visible" },
    { "wave": 17, "tasks": ["21.1", "21.2"] },
    { "wave": 18, "tasks": ["21.3", "21.4"],       "note": "21.3 is load-bearing checks 14 and 15" },
    { "wave": 19, "tasks": ["22"] },
    { "wave": 20, "tasks": ["23"] }
  ]
}
```

Critical path: `1 → 9 → 10.x → 11.x → 12 → 13 → 15 → 18 → 20 → 21.3 → 23`.

Task 13 (the 36-activity seed) is the widest single task and everything after 15 depends on it.
Tasks 2–8 can proceed in parallel with 9–11 once 1 is done, and should, since 9 is externally
blocked.

## Tasks

- [ ] 1. Scaffold the repository, toolchain and credential hygiene
  - Create the directory tree from `docs/STEP_1_2_BUILD_SPEC.md §1.1` under `mushroomos/`
  - Initialise Vite + React 18 + TypeScript in strict mode; add TanStack Query v5, Zustand,
    Tailwind, react-router v6, `vite-plugin-pwa`, `idb`, Vitest, Playwright, `fast-check`,
    ESLint, Prettier — pinned versions, no open ranges
  - Write `.gitignore` covering `.env.local`, `key.txt`, `node_modules`, `dist`,
    `supabase/.temp` **before any commit exists**
  - Create `.env.local` from the project URL and publishable key in `key.txt`; create
    `.env.example` with the key names and no values
  - Add `supabase/config.toml` with the `auth.hook.custom_access_token` block enabled
  - Verify: `npm run build` succeeds; `git status` shows neither `.env.local` nor `key.txt`
  - _Requirements: 1.1, 1.2, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 2. Build the design token layer and theme switching
  - Write `src/theme/tokens.css` with every neutral, accent and semantic value from
    `docs/UI_DESIGN_SPEC.md §1` as custom properties on `:root`, redeclared for
    `[data-theme='dark']`
  - Map Tailwind's colour, font and spacing scales onto `var(--token)` references in
    `tailwind.config.ts` so a class and a hand-written style resolve identically
  - Self-host Archivo, Public Sans and IBM Plex Mono as woff2 under `public/fonts/`; apply the
    three-family assignment and `font-variant-numeric: tabular-nums`
  - Add an ESLint rule rejecting literal hex colours in `src/components/**`
  - Verify: a scratch page renders every token swatch in both themes with no unstyled element
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

- [ ] 3. Build the primitive components
  - `Chip`, `Stat`, `Field`, `Card`, `Bar`, `Countdown` in `src/components/primitives/`
  - `Stat` renders value and unit in mono with tabular alignment and takes a comparison value,
    since `docs/UI_DESIGN_SPEC.md §5` makes a bare number a design failure
  - `Countdown` subscribes to one shared interval rather than owning a timer per instance
  - `Chip` supports the five semantic tones plus a conflict-marker variant that names its
    identifier
  - Verify: Vitest render tests per primitive, including the conflict-marker variant
  - _Requirements: 7.5, 7.6, 8.5_

- [ ] 4. Define the domain types and activity state union
  - Hand-write `src/domain/activity.ts` with the 14-state union from
    `docs/WORKFLOW_MODEL.md §2` and the `NON_ACTIONABLE_STATES` constant set
  - Declare `LayerValue` and `FiveLayerNodeProps` exactly per
    `docs/STEP_1_2_BUILD_SPEC.md §1.7`
  - Declare `MaterialRoleCode`, `StreamCode`, `ActivityScope`, `CardinalityRule` (six-kind
    discriminated union) and `GateRuleConfig` from `§2.4`–`§2.5`
  - Leave `database.types.ts` to generation in task 11.4; these are the hand-written unions only
  - Verify: `tsc --noEmit` clean; every `CardinalityRule` kind is exhaustively narrowable
  - _Requirements: 8.1, 13.1_

- [ ] 5. Implement the three pure functions with property tests

- [ ] 5.1 Implement `resolveLabel` and `renderReason`
  - `resolveLabel(template, bindings)` substituting `{role_lead}` and `{n}`
  - `renderReason(template, values)` interpolating a `blocked_reason_template`
  - Both throw on an unresolved placeholder rather than emitting a brace
  - Property test: for all templates and binding sets, output contains no `{` or `}`
  - _Requirements: 12.6, 12.7, 14.3_

- [ ] 5.2 Implement `evaluateCardinality`
  - All six kinds from `docs/STEP_1_2_BUILD_SPEC.md §2.4`; returns a result union
    `{ok:true,instances} | {ok:false,error}`, never throws
  - Each instance carries `index`, `scopeLabel` and, for quantity-derived rules,
    `plannedQuantityMt`
  - A missing config field returns an error naming that field — no default substituted
  - Property tests with `fast-check` over positive quantity and capacity: count equals
    `ceil(q / c)`; planned quantities sum to `q` with the tail carrying the remainder; count is
    non-increasing as capacity rises; indices are contiguous and stable
  - Unit assertions: `21 / 2 → 11` with tail `1.0 MT`; `21 / 2.5 → 9`
  - _Requirements: 13.1, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_

- [ ] 6. Build the five-layer node
  - `src/components/node/FiveLayerNode.tsx` per `docs/STEP_1_2_BUILD_SPEC.md §1.7` and
    `docs/UI_DESIGN_SPEC.md §2`
  - Layer order as a module constant and the layer-to-tone map as a lookup table, so callers
    cannot reorder or recolour
  - Null layer renders an em dash plus `sourceRef`; there is no code path emitting a blank
  - When `state` is in `NON_ACTIONABLE_STATES`, `blockedReason` renders on the node face; if it
    is missing, render a visible defect marker rather than nothing
  - `conflictId` renders the amber marker; `unblocksAt` renders a live `Countdown`
  - Six density variants that change layout only, never an invariant
  - Verify: Vitest tests asserting each invariant holds when a caller tries to violate it
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 22.2_

- [ ] 7. Build the component gallery
  - `/dev/gallery` rendering every activity state × every density, both themes
  - Excluded from production builds by a Vite conditional, not only by a route guard
  - Include the null-layer, conflict-marker and countdown cases explicitly
  - Verify: gallery renders all state × density combinations with no empty layer
  - _Requirements: 7.2, 8.9_

- [ ] 8. Add the terminology lint
  - Custom ESLint rule over string literals and JSX text enforcing
    `docs/PROCESS_V2_FACTORY_CONFIRMED.md §19`
  - Fail on "weighing", "weighting", "payment" for Weighment, plus the remaining locked pairs
  - Wire into `npm run lint` and CI
  - Verify: a fixture file using "weighing" fails lint; "Weighment" passes
  - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [ ] 9. Bring up the local Supabase stack
  - Confirm the Docker daemon is running; start it or report it as blocked
  - `npx supabase init` then `npx supabase start`; record the local URL and keys
  - `npx supabase login` and `npx supabase link --project-ref szwosmyqwvpaqugjtzcp` for later
    `db push`, without applying anything to the hosted project yet
  - Verify: `npx supabase status` reports all services running
  - _Requirements: 2.1, 2.7_

- [ ] 10. Write migrations 0001–0005: extensions, roles, auth hook, audit

- [ ] 10.1 Extensions, roles and profiles
  - `0001_extensions.sql`: `pgcrypto`, `btree_gist`
  - `0002_roles_profiles.sql`: `app_role` enum with the six values, `profiles`, RLS enabled
  - _Requirements: 1.6, 3.1, 3.2, 4.1_

- [ ] 10.2 The access-token hook and role readers
  - `0003_auth_hook.sql`: `custom_access_token_hook` setting `app_metadata.app_role` from
    `profiles.role`; grant to `supabase_auth_admin`; revoke from `authenticated`, `anon`,
    `public`
  - `0004_role_readers.sql`: `current_app_role()` and `has_role(variadic app_role[])`
  - _Requirements: 3.3, 3.4, 3.5_

- [ ] 10.3 The audit subsystem
  - `0005_audit.sql`: `audit_event` with the full column set, read policy restricted to
    `gm`/`manager`/`admin`/`supervisor`, insert/update/delete revoked from `authenticated` and
    `anon`, and `fn_audit()` as a `SECURITY DEFINER` trigger function
  - Verify: `PATCH` and `DELETE` against `audit_event` are refused for every role
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 11. Write migrations 0006–0014: reference data and the process engine

- [ ] 11.1 Materials, locations and machines
  - `0006_materials.sql`: `material_category`, `material_role_code`, `material`,
    `material_role_eligibility`, `material_spec`
  - `0007_locations_machines.sql`: `location_kind`, `location`, `machine_kind`, `machine`
  - _Requirements: 9.1, 9.5, 10.1_

- [ ] 11.2 The process definition, with the material-name constraint
  - `0008_process_definition.sql`: `process_status`, `activity_scope`, `stream_code`,
    `process_definition`, `process_activity`
  - Include `check (code !~* '(bagasse|paddy|mustard|wheat|gypsum|manure|urea|lime)')` on
    `process_activity.code`, and `cardinality_rule NOT NULL`
  - Verify: inserting `BG-WEIGH` is rejected by the database
  - _Requirements: 11.1, 11.3, 11.7, 12.1, 12.2, 12.3_

- [ ] 11.3 Activity children and rules
  - `0009_activity_children.sql`: `activity_variant`, `activity_field` with all six-column
    fields, `evidence_requirement`
  - `0010_rules.sql`: `gate_rule` with `blocked_reason_template NOT NULL`, the
    `predecessor_binding` and `mapping_confidence` check constraints; `movement_rule`;
    `resource_requirement`
  - _Requirements: 11.1, 11.4, 11.5, 11.6, 11.8, 14.1, 14.4_

- [ ] 11.4 Lab reference, conflict register, mapping view, reference RLS
  - `0011_lab_reference.sql`: `lab_spec`, `lab_method`, `phase2_control_band`
  - `0012_conflict_register.sql`: `conflict_register`, with `conflict_id` foreign keys from the
    rows that carry markers
  - `0013_sop_mapping_view.sql`: `v_sop_limit_mapping` per `docs/STEP_1_2_BUILD_SPEC.md §2.8`
  - `0014_rls_reference.sql`: the read-all / write-admin policy pair on every reference table
  - Verify: every table in `public` has RLS enabled; generate `database.types.ts` and commit it
  - _Requirements: 1.3, 4.1, 4.2, 4.3, 18.1, 19.1, 21.1_

- [ ] 12. Seed the conflict register, materials, locations and machines
  - `s01_conflicts.sql`: all 31 conflicts and 41 TBDs from `docs/SOURCE_CONFLICTS.md` with
    question, disputing sources and ship-with default; the five frozen decisions marked decided
    while their underlying questions stay open
  - `s02_materials.sql`: the 11 materials, eligibility and default leads from the table in
    `docs/STEP_1_2_BUILD_SPEC.md §2.1`, `material_spec` from S4a Table 1 with `source_ref`,
    `TBD-40` on `STRUCTURAL_STRAW`
  - `s03_locations_machines.sql`: bunkers 1–11, tunnels 1–12, yard, soak pit; `JCB-01/02`,
    `TURNER-01/02`, `HOPPER-01`, `ROTAVATOR-01`, `CONVEYOR-01`, `TRUCK-01`–`04`, with `TBD-33`
  - All seeds idempotent via `ON CONFLICT DO UPDATE`
  - Verify: re-running each seed leaves the database unchanged; two turners exist
  - _Requirements: 1.7, 9.2, 9.3, 9.4, 9.6, 10.2, 10.3, 10.4, 10.5, 21.1, 21.4, 21.5_

- [ ] 13. Seed `PROCESS-2026B` — the 36 activity templates
  - `s04_process_2026b.sql`: the definition row plus all 36 activities from
    `docs/PROCESS_V2_FACTORY_CONFIRMED.md §17`, translated to the role-based codes in
    `docs/ADMIN_CONFIGURABILITY_MODEL.md §3`
  - Every row carries `label_template`, `material_role` where applicable, `stream`, `rel_day`,
    `seq`, `scope`, `cardinality_rule` with no literal count, duration targets, `golden_rule`
    where a source states one, and `source_ref`
  - Time-gate activities: `duration_required_at_day0 = true`, no default duration,
    `tbd_marker = 'TBD-21'`
  - One Phase-1 reload on Day 12; `SECONDARY_FIBRE` stream defined but no activity seeded
  - Verify: count is 36; the material-name query returns 0 rows; no `cardinality_rule` contains
    a literal count; no time gate lacks `duration_required_at_day0`
  - _Requirements: 12.4, 12.5, 13.2, 13.3, 16.1, 16.2, 16.3, 16.4, 16.8, 16.9, 22.3_

- [ ] 14. Seed activity fields, evidence and variants
  - `s05_activity_fields.sql`: six-column definitions; `conflict_id` on disputed bounds; null
    `sop_min`/`sop_max` with `sop_source_ref` citing the absence where no source gives a bound
  - `s06_evidence.sql`: the before/after catalogue from
    `docs/EVIDENCE_CONFIGURATION_MODEL.md §3`, the three requirements on `NMIX-ROTAVATE`, and
    video permitted on `FIB1-HOP-3`
  - `s07_variants.sql`: hopper `WATER` and `DRY` with `auto_select_enabled = false`,
    `conflict_id = 'C-29'`, `requires_reason_on_override = true`, and a `selection_rule`
    carrying both candidate bands with their sources
  - Verify: `NMIX-ROTAVATE` has 3 requirements; no variant has auto-select enabled
  - _Requirements: 11.6, 11.8, 14.5, 16.5, 16.6, 16.7, 22.1, 22.4_

- [ ] 15. Seed gate rules, movement rules and resource requirements
  - `s08_gates.sql`: entry and exit gates with a non-empty `blocked_reason_template` on every
    row; the convergence gates from `docs/WORKFLOW_MODEL.md §9.2`; the `DAY0_DURATION` gates on
    the rest activities
  - **`TR-T2` entry gate: kind `PREDECESSOR`, config `{"activity_codes":["TR-T1"]}`,
    `predecessor_binding = 'SAME_SCOPE_INSTANCE'`, reason
    `'Locked — T1 not complete on {scope_label}'`** — this is the check that decides the build
  - The remaining bindings from `docs/WORKFLOW_MODEL.md §9.4`, including `TN-LOAD` as
    `ALL_INSTANCES`
  - `s09_movement_resources.sql`: `requires_distinct_vessel = true` on both reloads; distinct
    turner `role_hint` on `TR-T1` and `TR-T2`
  - Verify: the `TR-T2` binding query returns `SAME_SCOPE_INSTANCE`; no gate has an empty reason
    template
  - _Requirements: 14.2, 14.4, 15.1, 15.2, 15.3, 15.4, 15.5, 16.10_

- [ ] 16. Seed `ROUTE-2026A` as archived reference and the C-28 mapping
  - `s10_route_2026a.sql`: the definition with `status = 'archived'`, all 17 stages from
    `docs/DOMAIN_MODEL.md §4`, and their ~110 process-control limits as `activity_field` rows
    with `sop_min`, `sop_max`, `unit`, `sop_source_ref`
  - `s11_sop_mapping.sql`: `sop_field_ref` links with `mapping_confidence` classified per
    `docs/STEP_1_2_BUILD_SPEC.md §2.8`; the three `sop_direct` mappings enabled;
    `sop_inferred` and `unmapped` disabled and carrying `conflict_id = 'C-28'`
  - Add `npm run report:sop-mapping` exporting `v_sop_limit_mapping` to CSV with counts per
    confidence level
  - Verify: `ROUTE-2026A` is archived; no `sop_inferred` or `unmapped` gate is enabled
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 17. Seed lab reference data and the demo accounts
  - `s12_lab_reference.sql`: `lab_spec` from S4a Tables 1–3 with `source_ref` on every row;
    the 8 methods with `conflict_id = 'C-10'` on the three damaged calculations;
    `phase2_control_band` with S1c's 7 bands × 3 probes and `C-04`/`C-05`/`C-17` on disputed
    rows; null bounds where no source gives one
  - `s13_demo_accounts.sql`: the six accounts from `docs/DEMO_PLAN.md §5`, one per role, with
    matching `profiles` rows
  - Verify: `lab_spec` row counts match; six accounts exist with six distinct roles
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 22.1_

- [ ] 18. Wire authentication and the app shell
  - Typed Supabase client in `src/api/client.ts` from the `.env.local` values
  - `src/lib/auth.ts` with `useAppRole()` reading `app_metadata.app_role` from the decoded
    session token, with no post-sign-in profile fetch
  - Sign-in screen; `<RoleGuard>` with a header stating it is defence in depth and RLS is the
    boundary; six role layouts and the six home routes
  - Placeholder home routes for the five roles whose screens belong to later steps, each stating
    what will fill it and when rather than "No data"
  - Verify: six accounts sign in and land on six distinct routes; the decoded token carries the
    role claim; editing `localStorage` changes nothing
  - _Requirements: 3.6, 3.7, 3.8, 6.1, 6.2, 6.3, 6.4_

- [ ] 19. Add the PWA shell and offline read cache
  - `vite-plugin-pwa` manifest and service worker; TanStack Query persistence to IndexedDB
  - Persistent offline chip, never a modal; no offline sign-in path
  - Verify: the app installs, loads offline with a valid session, and offers no offline sign-in
  - _Requirements: 6.5, 6.6_

- [ ] 20. Build the process explorer — the demo surface
  - `src/api/processDefinition.ts` loading a definition and its children in one nested select
    into a `ProcessDefinitionTree`
  - `/admin/process-explorer` rendering `PROCESS-2026B` as streams × days, each activity a
    `FiveLayerNode` in `admin` density, titles resolved through `resolveLabel`
  - Role-lead selector rebinding `PRIMARY_FIBRE`; the whole stream relabels client-side
  - Load-plan calculator over `evaluateCardinality`, showing 11 instances at 2.0 MT and 9 at
    2.5 MT with the tail remainder
  - Dependency inspector contrasting `SAME_SCOPE_INSTANCE` with `ALL_INSTANCES` across three
    piles, stating which the factory does
  - Conflict and TBD markers inline from `conflict_register`
  - Nothing on this route writes, and no activity code is enumerated in `src/`
  - Verify: switching the role lead relabels every title; the load count recalculates; the
    activity list comes entirely from the database
  - _Requirements: 12.6, 12.8, 13.6, 20.1, 20.3, 20.4, 21.3_

- [ ] 21. Build the verification harness for all 15 checks

- [ ] 21.1 RLS and audit tests
  - `tests/rls/` with one file per role, raw `fetch` against PostgREST with real tokens
  - Cross-role read refusal; `localStorage` tampering changes nothing; `audit_event` `PATCH` and
    `DELETE` refused for all six roles
  - _Requirements: 3.7, 4.4, 4.5, 5.4_

- [ ] 21.2 Schema and seed assertions
  - `tests/verify/` running checks 1–13 of `docs/STEP_1_2_BUILD_SPEC.md §2.10`, each using that
    document's query verbatim
  - _Requirements: 10.3, 11.3, 12.5, 13.3, 14.2, 15.2, 16.1, 16.4, 16.5, 16.7, 17.1, 18.3, 19.1_

- [ ] 21.3 The two zero-code-change checks
  - Check 14: swap `is_default_lead` to `MUSTARD_STRAW` in a transaction, assert titles read
    "Mustard Weighment" and "Mustard Hopper Pass 1", assert `git diff --exit-code src/`, roll
    back
  - Check 15: append one activity to `s04`, `db reset`, assert the count is 37 and the activity
    appears in the explorer, assert `git diff --exit-code src/`, revert
  - _Requirements: 12.8, 20.1, 20.2_

- [ ] 21.4 End-to-end and visual checks
  - Playwright: six sign-ins to six routes; gallery screenshots in both themes
  - `npm run verify` aggregating every check into one table, exiting non-zero on any failure
  - _Requirements: 6.2, 7.2, 8.9_

- [ ] 22. Wire CI
  - Typecheck, lint including the terminology rule, migrations applied to a clean database,
    seeds applied twice to prove idempotency, `supabase gen types` diff check, Vitest, RLS
    suite, Playwright
  - Verify: CI fails when the generated types drift and when a locked term is misused
  - _Requirements: 1.4, 1.5, 1.7, 23.4_

- [ ] 23. Run the full verification and write the report
  - Run `npm run verify` and capture output
  - Produce the four load-bearing outputs verbatim — checks 2, 7, 14, 15
  - Export the `v_sop_limit_mapping` CSV with counts per `mapping_confidence`
  - List every `docs/KIRO_BUILD_INSTRUCTIONS.md §7` item that had to be defaulted, and how
  - List every seeded value not traceable to a source document, each assigned a new TBD
    identifier from `TBD-42` onward and added to `conflict_register`
  - _Requirements: 18.5, 21.6, 22.1_

## Notes

**One external prerequisite.** Task 9 needs the Docker daemon running. Everything before it does
not. If Docker cannot be started, the fallback in `design.md` § Environment strategy applies:
migrations go to the hosted project via `db push`, and checks 14 and 15 run against a Supabase
branch instead of a local reset.

**Task 13 is the one to slow down on.** Thirty-six activities, each with a stream, scope,
cardinality rule, durations, source reference and TBD markers. It is where a guess would be
easiest to make and hardest to spot. Anything not traceable to a document becomes a new TBD
identifier, per `docs/STEP_1_2_BUILD_SPEC.md §3` — never a plausible number.

**What is deliberately absent.** No batch, no Day-0 wizard, no activity instances, no
`evaluate_gates`, no Edge Functions. Steps 1–2 build the definitions and the mechanisms that read
them. A reviewer expecting to click through an operator task will not find one yet; what they can
see is the process definition, the four load-bearing behaviours, and six roles landing on six
screens.

**Five of the six role homes are empty on purpose.** They render what will fill them and when,
per `docs/UI_DESIGN_SPEC.md §5`. Filling them with placeholder cards would breach
`docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 10 and `docs/UI_DESIGN_SPEC.md §6` item 6.
