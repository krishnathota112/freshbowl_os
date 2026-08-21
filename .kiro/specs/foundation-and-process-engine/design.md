# Design Document

## Overview

This design implements Steps 1 and 2 of `docs/KIRO_BUILD_INSTRUCTIONS.md §3`, to the detail
given in `docs/STEP_1_2_BUILD_SPEC.md`, against the requirements in `requirements.md`.

**The design lives in `docs/`.** Twenty documents already specify the schema, the DDL, the JSON
contracts, the tokens and the component props. This document does not restate them. It records
only the decisions `docs/` leaves open:

1. how the environment is set up, given the Docker state and credentials actually available
2. the concrete migration and seed file sequence
3. the contracts for the three pure functions Step 2 needs
4. **the demo surface** — what a person can look at and click, which Steps 1–2 do not otherwise
   produce
5. how the 15 verification checks are executed and reported

### Demo-first, without demo-only code

The stated priority is a demo before deployability. That does not relax
`docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 10 — no demo-only code paths, no mock state, no
`TIME_SCALE`. It changes *ordering*, not *substance*: work that produces something visible is
sequenced early, and everything shown is driven by the real schema and the real seed.

Steps 1–2 build definitions and mechanisms. They deliberately do not instantiate a batch, so
there is no operator task to demonstrate yet. What they *can* demonstrate is the thing the whole
build rests on, and the four load-bearing checks are exactly the demo:

| Load-bearing check | What the audience sees |
|---|---|
| 2 · no material name in the definition | the activity list, and the constraint rejecting `BG-WEIGH` |
| 14 · mustard swaps for bagasse | one dropdown; the whole stream relabels; no rebuild |
| 13 · cardinality is a rule | `21 ÷ 2 → 11 loads`, `21 ÷ 2.5 → 9`, recalculating live |
| 15 · `SAME_SCOPE_INSTANCE` | three piles, T1/T2 interleaved, against the global-barrier version |

Requirement 12 criterion 8 and Requirement 13 criterion 6 already demand these behaviours. The
demo surface makes them *visible* rather than only queryable. It is read-only: it renders the
process definition and runs the pure evaluators. It writes nothing and instantiates nothing.

---

## Architecture

### Layer boundaries

`docs/DOMAIN_MODEL.md §8.1` defines three layers. This spec builds **Layer 1 only** — the
process definition — plus the mechanisms that read it. Layer 2 (Day-0 baseline) and Layer 3
(execution) are Steps 3 onward and are not touched here.

```
┌── BROWSER ─────────────────────────────────────────────────────────┐
│  React 18 · Vite · TanStack Query v5 · Zustand · Tailwind · PWA    │
│                                                                    │
│  routes/           six role trees, RoleGuard per subtree            │
│  components/node/  FiveLayerNode ← the one shared vocabulary        │
│  domain/           resolveLabel · evaluateCardinality · renderReason│
│                    pure, no I/O, no clock, property-tested          │
│  api/              typed client, read-only in this spec             │
└────────────────────────────┬───────────────────────────────────────┘
                             │ HTTPS · JWT carrying app_metadata.app_role
┌────────────────────────────▼───────────────────────────────────────┐
│  SUPABASE — Postgres 15 is the authority                            │
│                                                                     │
│  GoTrue + custom_access_token_hook  → role is a signed claim        │
│  RLS: deny by default on every table                                │
│  reference tables: read-all-authenticated, write-admin              │
│  process-state tables: no write policy at all (Step 3 onward)       │
│  audit_event: insert by trigger only, update/delete revoked         │
└─────────────────────────────────────────────────────────────────────┘
```

The authorisation boundary is the database. The `RoleGuard` is defence in depth and its file
header says so, following the convention `docs/ARCHITECTURE_V2.md §9` sets for `workflow/`.

### Environment strategy

Development targets the **local Supabase stack** (`npx supabase start`), not the hosted project.

Rationale: migrations, seeds and the RLS suite all need to be applied, torn down and reapplied
many times. Doing that against the shared project would make the hosted database a scratch pad,
and check 15 ("re-run seed, assert the activity list grows") is a destructive loop. Local also
removes the credential dependency from the critical path entirely.

**Docker Desktop must be running.** It is installed (28.3.3) but its daemon is currently down.
This is the one external prerequisite.

| Environment | Purpose | Applied by |
|---|---|---|
| `local` | all development, all 15 checks, the demo | `supabase start` + `supabase db reset` |
| `remote` (`szwosmyqwvpaqugjtzcp`) | first hosted deploy, after the checks pass locally | `supabase link` then `supabase db push` |

**Fallback if Docker cannot run:** point the app at the hosted project and apply migrations with
`supabase db push`. This costs the reset loop, so checks 14 and 15 are then run against a
Supabase branch rather than a local reset. Same assertions, slower cycle. Recorded here so the
choice is explicit rather than discovered.

### Credentials

`key.txt` supplies the project URL and a `sb_publishable_…` key. That is the new-format
browser-safe key, the successor to the legacy anon JWT, and it is the only credential the client
bundle ever receives.

| Credential | Where it lives | Used by |
|---|---|---|
| project URL | `.env.local` as `VITE_SUPABASE_URL` | browser |
| publishable key | `.env.local` as `VITE_SUPABASE_ANON_KEY` | browser |
| access token | `supabase login`, CLI keychain | migrations |
| service-role / secret key | Supabase secret store, Step 6 onward | Edge Functions only |

`.gitignore` covers `.env.local` and `key.txt` **before the first commit**. The local stack's
keys are fixed development constants and are not secrets.

The pasted connection URI is not used. Beyond `supabase link` being the specified path
(`docs/KIRO_BUILD_INSTRUCTIONS.md §7`), that URI is malformed twice over: the password is wrapped
in `[...]` placeholder brackets, and its `#` characters begin a URI fragment, so the string
truncates mid-password.

---

## Components and Interfaces

### Token layer

`src/theme/tokens.css` declares every value from `docs/UI_DESIGN_SPEC.md §1` as a CSS custom
property under `:root`, redeclared under `[data-theme='dark']`. Tailwind's config maps its colour,
font and spacing scales onto `var(--token)` references, so a Tailwind class and a hand-written
style resolve to the same value and a literal hex in a component is a lint error.

Fonts self-host as woff2 under `public/fonts/` rather than loading from a CDN: the factory network
is unreliable and the PWA must render fully offline.

### Primitives

`Chip`, `Stat`, `Field`, `Card`, `Bar`, `Countdown` in `src/components/primitives/`.

`Stat` takes a value, a unit and a comparison value, because `docs/UI_DESIGN_SPEC.md §5` makes a
bare number a design failure in this product. `Countdown` subscribes to one shared interval rather
than owning a timer per instance, since a batch view renders many at once. `Chip` carries the five
semantic tones plus a conflict-marker variant that names its identifier.

### The five-layer node

`src/components/node/FiveLayerNode.tsx`, props exactly per `docs/STEP_1_2_BUILD_SPEC.md §1.7`.

The invariants are enforced *inside* the component (Requirement 8 criterion 8). Concretely:

- layer order is a module-level constant array, not a prop — callers cannot reorder
- each layer's tone-to-token mapping is a lookup table keyed by layer, not passed in
- `null` layer → `—`, with `sourceRef` appended when present; there is no branch emitting empty
- `NON_ACTIONABLE_STATES` is a constant set; if `state` is in it and `blockedReason` is missing,
  the component renders a visible defect marker rather than a silent blank. A missing reason is a
  seed bug and should be loud.
- `unblocksAt` drives a `<Countdown>` on the shared interval
- `density` selects a layout variant; it never removes an invariant

### Auth and app shell

`src/lib/auth.ts` exposes `useAppRole()`, reading `app_metadata.app_role` from the decoded
session token. No profile fetch (Requirement 3 criterion 6).

`<RoleGuard allow={[...]}>` wraps each route subtree and redirects to the role's home on mismatch.

Five of the six role homes have no screen until later steps. They render an empty state saying
what will fill them and when, per `docs/UI_DESIGN_SPEC.md §5` — never "No data".

### Pure functions

Three, in `src/domain/`. No I/O, no clock, no state. They are the seam between the process
definition and everything later, and they carry the property tests.

```ts
resolveLabel(template: string, bindings: LabelBindings): string
// substitutes {role_lead} and {n}; throws on an unresolved placeholder

evaluateCardinality(rule: CardinalityRule, config: BatchConfigView):
  { ok: true; instances: Instance[] } | { ok: false; error: CardinalityError }
// the six kinds of docs/STEP_1_2_BUILD_SPEC.md §2.4
// Instance = { index: number; scopeLabel: string; plannedQuantityMt?: number }

renderReason(template: string, values: Record<string, string>): string
// interpolates blocked_reason_template; throws on an unresolved placeholder
```

`evaluateCardinality` returns a result union rather than throwing, deliberately: Step 6's
`generate_activity_plan` must collect *all* configuration errors for the validation report
(`docs/BATCH_CREATION_SPEC.md §11`), not stop at the first.

### Reading the process definition

`src/api/processDefinition.ts` loads a definition and its children in one nested PostgREST select
and shapes it into a `ProcessDefinitionTree`. Read-only. Reference tables are readable by all
authenticated roles (Requirement 4 criterion 2), so no role-specific variants are needed.

### The demo surface

Two routes. Both read-only, both driven entirely by the seeded database.

**`/dev/gallery`** — admin only, excluded from production builds by a Vite conditional rather than
only a route guard. Every activity state × every density, both themes. Required by Requirement 8
criterion 9; this is the regression surface for `docs/UI_DESIGN_SPEC.md §6`'s ten-point checklist.

**`/admin/process-explorer`** — renders `PROCESS-2026B` as streams × days, each activity a
`FiveLayerNode` in `admin` density, with three live controls:

| Control | Behaviour | Proves |
|---|---|---|
| Role-lead selector | rebinds which material leads `PRIMARY_FIBRE`; every title in the stream relabels through `resolveLabel` | check 14 |
| Load-plan calculator | quantity and capacity inputs; derived instance list below; `21/2 → 11`, `21/2.5 → 9`, tail shows `1.0 MT` | check 13, frozen decision 4 |
| Dependency inspector | `TR-T1`/`TR-T2` across three piles under `SAME_SCOPE_INSTANCE` beside what `ALL_INSTANCES` would give — ~24 h against ~42 h | check 15 |

The role-lead selector rebinds in the client only; it does not write. The persistent form of the
same change is one seed row. Conflict and TBD markers render inline throughout, from
`conflict_register`, per `docs/UI_DESIGN_SPEC.md §5`.

**Why this belongs in this spec.** It is a scope addition beyond
`docs/STEP_1_2_BUILD_SPEC.md`, made because a task list ending at "15 queries return the right
values" satisfies the spec while showing nothing. It adds no schema, no write path and no
demo-only branch — it is a reader over the seed and the evaluators. If it were removed, every
requirement would still be met.

---

## Data Models

Schema and DDL are fully specified in `docs/STEP_1_2_BUILD_SPEC.md §1.2`–`§1.5` and `§2.1`–`§2.9`
and are not restated. What this design fixes is the file sequence.

### Migration sequence

Forward-only, numbered, never edited after being applied to a shared environment. One concern per
file, so a failure names its own cause.

| File | Contents | Requirements |
|---|---|---|
| `0001_extensions.sql` | `pgcrypto`, `btree_gist` (needed by the Step 3 exclusion constraints) | 1.6 |
| `0002_roles_profiles.sql` | `app_role`, `profiles`, RLS on `profiles` | 3.1, 3.2 |
| `0003_auth_hook.sql` | `custom_access_token_hook`, its grant and revokes | 3.3, 3.4 |
| `0004_role_readers.sql` | `current_app_role()`, `has_role()` | 3.5 |
| `0005_audit.sql` | `audit_event`, read policy, revokes, `fn_audit()` | 5.1–5.6 |
| `0006_materials.sql` | `material_category`, `material_role_code`, `material`, `material_role_eligibility`, `material_spec` | 9.1, 9.5 |
| `0007_locations_machines.sql` | `location_kind`, `location`, `machine_kind`, `machine` | 10.1 |
| `0008_process_definition.sql` | `process_status`, `activity_scope`, `stream_code`, `process_definition`, `process_activity` **incl. the material-name CHECK** | 11.1, 12.1 |
| `0009_activity_children.sql` | `activity_variant`, `activity_field`, `evidence_requirement` | 11.1, 11.6, 11.8 |
| `0010_rules.sql` | `gate_rule`, `movement_rule`, `resource_requirement` | 11.1, 11.4, 11.5 |
| `0011_lab_reference.sql` | `lab_spec`, `lab_method`, `phase2_control_band` | 19.1 |
| `0012_conflict_register.sql` | `conflict_register` — the 31 conflicts and 41 TBDs as queryable rows | 21.1 |
| `0013_sop_mapping_view.sql` | `v_sop_limit_mapping` | 18.1 |
| `0014_rls_reference.sql` | the read-all / write-admin policy pair on every reference table | 4.1, 4.2 |

`0012` is treated as schema rather than seed because the UI links to conflict entries by
`conflict_id`; a dangling marker should be a foreign-key failure, not a broken link.

### Seed sequence

Idempotent, `ON CONFLICT DO UPDATE`, re-runnable. Applied by `supabase db reset` after migrations.

| File | Contents | Requirements |
|---|---|---|
| `s01_conflicts.sql` | conflict and TBD register rows, from `docs/SOURCE_CONFLICTS.md` | 21.1, 21.4 |
| `s02_materials.sql` | 11 materials, eligibility with default leads, `material_spec` from S4a T1 | 9.2–9.4, 9.6 |
| `s03_locations_machines.sql` | bunkers 1–11, tunnels 1–12, yard, soak pit; the fleet incl. two turners | 10.2–10.5 |
| `s04_process_2026b.sql` | `PROCESS-2026B` + all 36 `process_activity` rows | 16.1–16.4 |
| `s05_activity_fields.sql` | `activity_field` six-column definitions, `conflict_id` on disputed bounds | 11.6, 14.5, 22.1 |
| `s06_evidence.sql` | evidence requirements, incl. the three on `NMIX-ROTAVATE` | 16.7 |
| `s07_variants.sql` | hopper `WATER` / `DRY`, `auto_select_enabled = false`, `C-29` | 16.5, 16.6 |
| `s08_gates.sql` | gate rules, reason templates, **`TR-T2` `SAME_SCOPE_INSTANCE`** | 14.2, 15.1–15.3 |
| `s09_movement_resources.sql` | movement rules, `resource_requirement` incl. distinct turner hints | 15.5, 16.10 |
| `s10_route_2026a.sql` | `ROUTE-2026A` archived, 17 stages, ~110 SOP limits | 17.1–17.4 |
| `s11_sop_mapping.sql` | `sop_field_ref` links + `mapping_confidence` classification | 18.2–18.6 |
| `s12_lab_reference.sql` | `lab_spec`, `lab_method` with `C-10` flags, `phase2_control_band` | 19.1–19.6 |
| `s13_demo_accounts.sql` | six accounts from `docs/DEMO_PLAN.md §5`, one per role | 6.2 |

**Seed ordering matters twice.** `s08_gates.sql` resolves activity ids by `code`, so it must
follow `s04`. `s11_sop_mapping.sql` needs both definitions present, so it follows `s10`.

### Generated types

`src/domain/database.types.ts` is produced by `supabase gen types typescript` and committed.
Hand-written database types are a build failure (Requirement 1 criterion 5). The hand-written
domain file alongside it carries only what the schema cannot express: the activity-state union,
the `CardinalityRule` discriminated union and the `FiveLayerNodeProps` contract.

---

## Correctness Properties

These are the invariants worth stating as properties rather than examples, because they are the
ones later steps will lean on. All seven are tested with `fast-check`.

### Property 1: Derived load count equals the ceiling of quantity over capacity

For all positive `quantity` and positive `capacity`, `evaluateCardinality` on a
`DERIVED_FROM_QUANTITY` rule returns exactly `ceil(quantity / capacity)` instances.

**Validates: Requirements 13.6** — and frozen decision 4 of `docs/KIRO_BUILD_INSTRUCTIONS.md §0.5`.

### Property 2: Planned quantities are conserved

For all positive `quantity` and `capacity`, the `plannedQuantityMt` values of the returned
instances sum to `quantity`, with any remainder carried by the tail instance where
`tail_instance_takes_remainder` is true. No instance carries a negative or zero quantity.

**Validates: Requirements 13.7** — this is what makes `21 − 10 × 2.0 = 1.0 MT` on load 11 fall out
of the rule rather than being special-cased.

### Property 3: Instance count is monotonically non-increasing in capacity

For all positive `quantity` and all `c1 < c2`, the count at `c2` is less than or equal to the
count at `c1`.

**Validates: Requirements 13.8** — catches an off-by-one in the ceiling that example-based tests at
2.0 and 2.5 MT would both pass.

### Property 4: Evaluation is total — instances or a named error, never a default

For all rules and all configurations, `evaluateCardinality` returns either
`{ok: true, instances}` or `{ok: false, error}` where the error names the missing configuration
field. It never throws, and it never substitutes a default for an absent field.

**Validates: Requirements 13.9** — and `docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 6, never invent a
threshold.

### Property 5: Instance indices are contiguous and stable

For all rules and configurations yielding `n` instances, indices are exactly `1..n` with no gap
or repeat, and repeated evaluation of identical input yields identical indices and scope labels.

**Validates: Requirements 13.10** — stability matters because Step 6 materialises these as
`batch_activity.instance_no` and Step 7 resolves `SAME_SCOPE_INSTANCE` against them.

### Property 6: No label leaks a placeholder

For all seeded `label_template` values and all role-lead bindings drawn from
`material_role_eligibility`, `resolveLabel` returns a non-empty string containing no `{` or `}`.

**Validates: Requirements 12.7**

### Property 7: No blocked reason leaks a placeholder

For all seeded `blocked_reason_template` values and all placeholder value sets drawn from the
rule's own `config`, `renderReason` returns a non-empty string containing no `{` or `}`.

**Validates: Requirements 14.3**

Properties 6 and 7 range over *seed data* rather than arbitrary strings, which is what makes them
worth having: they assert that the seed and the renderers agree, so a template referencing a
placeholder the config never supplies fails in CI rather than on an operator's screen.

### Schema invariants enforced by the database, not by tests

- `process_activity.code` cannot contain a material name — `CHECK` constraint
- `process_activity.cardinality_rule` cannot be null — `NOT NULL`
- `gate_rule.blocked_reason_template` cannot be empty — `NOT NULL` plus a length check
- `gate_rule.predecessor_binding` and `mapping_confidence` are closed sets — `CHECK`
- `audit_event` cannot be updated or deleted by any role — revoked grants

Putting these in the schema rather than a test is the point of Requirement 12 criterion 1: a
constraint cannot be forgotten, a review habit can.

---

## Error Handling

| Situation | Behaviour | Why |
|---|---|---|
| Missing config field in a cardinality rule | return `CardinalityError` naming the field | Step 5's validation report needs every error, not the first |
| Unresolved placeholder in a label or reason | throw | a brace on screen is worse than a failed test; this is always a seed defect |
| Non-actionable state with no `blockedReason` | render a visible defect marker | `docs/WORKFLOW_MODEL.md §2.1` — the UI never shows an unexplained grey card |
| No source bound for a field | store null and render `—` with the source reference | `docs/KIRO_BUILD_INSTRUCTIONS.md §1` item 6 — never invent a threshold |
| Two sources disagree | store both bands with sources plus the `conflict_id`; render both | `docs/UI_DESIGN_SPEC.md §5` — never silently resolve |
| Seed value untraceable to a document | new TBD identifier in `conflict_register`, reported | `docs/STEP_1_2_BUILD_SPEC.md §3` — IDs, not guesses |
| Cross-role read attempt | empty result or 401 from PostgREST | RLS is the boundary; the guard is cosmetic |
| Offline with no valid session | no sign-in path offered | `docs/ARCHITECTURE_V2.md §5` — no offline auth |

Every user-facing error states what went wrong and what to do, with no bare codes, per
`docs/UI_DESIGN_SPEC.md §5`.

---

## Testing Strategy

The 15 checks are executable, not prose. They live in `tests/verify/` and `tests/rls/` and run as
one command, `npm run verify`, which prints a table and exits non-zero on any failure.

| Check | Mechanism |
|---|---|
| Step 1 · 1 | Playwright: six sign-ins, six landing routes |
| Step 1 · 2 | Vitest: decode the access token, assert `app_metadata.app_role` |
| Step 1 · 3, 4 | `tests/rls/` — raw `fetch` against PostgREST per role; check 4 mutates `localStorage` first and asserts the response is unchanged |
| Step 1 · 5 | raw `PATCH` and `DELETE` on `audit_event` per role, expect 403 |
| Step 1 · 6 | CI: regenerate types, `git diff --exit-code` |
| Step 1 · 7, 8 | Playwright screenshots of the gallery, light and dark |
| Step 2 · 1–13 | SQL assertions, each the query from `docs/STEP_1_2_BUILD_SPEC.md §2.10` verbatim |
| Step 2 · 14 | swap the default lead in a transaction, assert titles, `git diff --exit-code src/`, roll back |
| Step 2 · 15 | append an activity to `s04`, `db reset`, assert count 37, `git diff --exit-code src/`, revert |

Checks 14 and 15 assert `git diff --exit-code src/` because their whole claim is *zero
application-code change*. Asserting the output without asserting the absence of a code change
would prove nothing.

Layers of test, and what each is for:

- **Property tests** (`fast-check`) — the pure functions, per Correctness Properties above
- **Unit tests** (Vitest) — primitive rendering, and `FiveLayerNode` invariants asserted by
  having a caller *try* to violate each one
- **Integration tests** — raw `fetch` against PostgREST with real tokens, one file per role, so
  RLS is verified where it actually runs rather than through the client library
- **End-to-end** (Playwright) — the six sign-ins and the gallery screenshots
- **Idempotency** — CI applies the seeds twice and asserts the second application is a no-op

RLS is tested against PostgREST rather than through `supabase-js` deliberately: the client library
is not the threat model. `docs/STEP_1_2_BUILD_SPEC.md §1.8` check 3 says "not by clicking", and a
library call is a nicer form of clicking.

---

## Decisions and their consequences

**Local Supabase over hosted for development.** Costs a Docker dependency; buys a destructive
reset loop, which checks 14 and 15 need.

**`conflict_register` as schema, not seed.** Costs a migration; buys referential integrity on
`conflict_id`, so a marker cannot point at nothing.

**Invariants inside `FiveLayerNode`.** Costs some flexibility for callers; buys the guarantee that
six roles cannot drift, which is the reason `docs/KIRO_BUILD_INSTRUCTIONS.md §3` Step 1 puts this
component before any screen that uses it.

**`evaluateCardinality` returns a union, not throws.** Costs slightly noisier call sites; buys
complete error collection for the Step 5 validation report.

**Unsourced values become TBDs with IDs.** Per `docs/STEP_1_2_BUILD_SPEC.md §3`. Anything in the
seed not traceable to a document is added to `conflict_register` as a new TBD and reported, not
guessed. `TBD-42` onward, continuing the existing numbering.

## Deferred to later steps

`batch_process_config` and every table that instantiates a batch (Step 3); the exclusion
constraints on `location_occupancy` and `machine_usage`, which is why `0001` installs
`btree_gist` now (Step 3); `generate_activity_plan` and `activate_batch` (Step 6);
`evaluate_gates` (Step 7); the offline write queue (Step 7); every Edge Function (Step 6 onward).
