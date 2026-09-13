# Laboratory specification model — R0 schema comparison

**Status:** R0 complete · schema comparison only · no DDL proposed  
**Authority inspected:** deployed database snapshot in `docs/SCHEMA.md`, plus targeted read-only catalog queries on 31 Aug 2026.

## 1 · What `checkpoint_map` is

The deployed type and core table declaration are:

```sql
create type lab_checkpoint_map as enum ('LAB_DICTATION', 'S4B_COLUMNS');

create table public.lab_checkpoint (
  id                   uuid primary key default gen_random_uuid(),
  checkpoint_map       lab_checkpoint_map not null,
  code                 text not null,
  name                 text not null,
  rel_day              int,
  scope                text not null,
  parameters           text[] not null,
  spec_checkpoint_code text,
  source_ref           text not null,
  unique (checkpoint_map, code)
);
```

The deployed table also has `is_prebatch boolean not null default false`, added after the core declaration.

`checkpoint_map` identifies the **source vocabulary/catalogue** a definition came from. It is not a preference order and it is not currently a temporal version. The deployed values are:

| map | deployed definitions | meaning |
|---|---:|---|
| `LAB_DICTATION` | 27 | the laboratory dictation’s checkpoint catalogue |
| `S4B_COLUMNS` | 18 | the S4B spreadsheet-column catalogue |

Both coexist because C-33 is unresolved. The database does not select one as authoritative.

## 2 · Definitions versus occurrences

`lab_checkpoint` models **definitions**. Its rows describe a named checkpoint, its source map, scope and parameter-code list. It has no batch, activity, actor or capture timestamp.

`lab_sample` models the **physical occurrence**. It contains `master_batch_id`, optional `batch_activity_id`, collection metadata and:

```sql
lab_sample.checkpoint_id uuid not null references lab_checkpoint(id)
```

A recorded sample therefore preserves the exact checkpoint definition and map used for that sample. It does not establish which complete catalogue the batch was expected to follow.

## 3 · Field comparison

| Required specification fact | Deployed representation | Finding |
|---|---|---|
| checkpoint identity | `lab_checkpoint.id`, `(checkpoint_map, code)` unique | Exists |
| title | `lab_checkpoint.name` | Exists under a different name |
| stage | no field | Missing |
| kind: GATE / DECISION / RECORD | no field | Missing |
| per-pile flag | no field | Missing; must not be inferred from prose or `scope` |
| sort order | no field | Missing |
| parameters | `lab_checkpoint.parameters text[]` | Partly exists: codes only; no label, unit, value type, options, requiredness or parameter order |
| evidence requirements | no lab-checkpoint relation | Missing; general activity evidence tables do not bind requirements to `lab_checkpoint` |
| gate binding | no lab-checkpoint relation | Missing; current `gate_rule` rows bind process activities, not checkpoint definitions |
| source/conflict provenance | `source_ref` plus `lab_checkpoint_conflict` | Exists |
| pre-batch marker | `is_prebatch` | Exists |

The existing family contains the same concept Task A needs: checkpoint definitions. A parallel catalogue would duplicate that fact rather than model a different one.

## 4 · Per-batch freeze

A deployed-column probe found `checkpoint_map` only on `lab_checkpoint` and views derived from it. No batch-owned base table records a selected map or a frozen set of checkpoint IDs.

Therefore the per-batch freeze is **not solved**:

- recorded samples retain the definition used for each captured occurrence;
- a batch does not retain the complete set of definitions it was expected to satisfy;
- adding a checkpoint can still change the apparent missing-work set unless that expected set is snapshotted explicitly.

`effective_from` should not be introduced as a substitute. The later implementation must define an explicit batch-to-specification snapshot/association before changing schema. R0 does not choose its table shape.

## 5 · What `lab_spec` is and where its numbers came from

`lab_spec` is the deployed threshold catalogue, unique by `(checkpoint_code, parameter_code)`, with nullable `min_value`/`max_value`, `unit`, mandatory `source_ref`, and optional `conflict_id`. `lab_test` copies its resolved band and provenance at request time so later edits do not re-judge historical results.

Deployed contents:

- 37 rows across 19 checkpoint codes and 6 parameter codes;
- 35 rows carry at least one numeric bound;
- 2 compost-EC rows carry null bounds and `TBD-13`;
- numeric rows cite `S4a Table 2` or `S4a Table 3`;
- conflict-marked numeric rows include C-01, C-06, C-07, C-09 and C-16.

The table has source references and conflict markers, but no `FACTORY_CONFIRMED` / `SIMULATION` / `UNRESOLVED` classification. R0 therefore does **not** claim that any numeric band is factory-confirmed. Per the standing ruling, `lab_spec` remains the single threshold authority; no second threshold table should be added, and unclassified bands may not become new gates.

## Recommendation — EXTEND

**EXTEND the existing lab family. Do not create a `labspec_*` parallel family.**

Reasoning:

1. `lab_checkpoint` already models checkpoint definitions; `lab_sample` already models occurrences.
2. Existing samples, tests, results, views and conflict markers depend on those identities.
3. A parallel catalogue would create two authorities for checkpoint identity and require an unstated mapping between them.
4. Missing renderer metadata and child relationships are additive gaps around the existing definition model, not evidence of a separate concept.

Two cautions remain binding for the implementation that follows R0:

- Preserve C-33: `checkpoint_map` is source provenance today, not a silently chosen authoritative map or batch version.
- Add no DDL until the explicit per-batch expected-spec snapshot and the additive compatibility path for existing checkpoint rows have been specified and reviewed.
