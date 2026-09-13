# Ruling R1 — the three decisions blocking Task A

**Addressed to any coding agent.** Read after `docs/AGENT-BRIEF.md` §4.
R0 is accepted: **EXTEND**. `docs/02-architecture/LAB-SPEC-MODEL.md` stands as the finding.

Two things in the brief you were given were wrong, and R0 caught both. Recorded here so nobody
re-inherits them:

- **`checkpoint_map` is not a batch version.** It is a source-vocabulary enum —
  `LAB_DICTATION` (27) and `S4B_COLUMNS` (18). The brief predicted it would solve the per-batch
  freeze. It does not. The freeze is genuinely unsolved and D1 below specifies it.
- **`lab_spec` holds 35 numeric bands with mandatory `source_ref` citing S4a Table 2 / Table 3.**
  The brief said no threshold exists. That was too strong. What is true is narrower: the bands
  exist and carry a source, but carry no confidence classification. See D4.

---

## D1 · The per-batch expected-checkpoint snapshot

Additive. No existing table altered. One new table, written once, never updated.

```sql
create table batch_lab_expectation (
  id              uuid primary key default gen_random_uuid(),
  master_batch_id uuid not null references master_batch(id),
  checkpoint_id   uuid not null references lab_checkpoint(id),
  checkpoint_map  lab_checkpoint_map not null,   -- denormalised deliberately, see below
  sequence_no     int  not null,
  pile_no         int,                            -- null = batch-level; 1..n for per-pile
  expected_count  int  not null default 1,
  resolved_at     timestamptz not null default now(),
  unique nulls not distinct (master_batch_id, checkpoint_id, pile_no)
);
```

**Written inside `activate_batch`, in the same transaction.** Not before, not after, not by a
separate call. If activation succeeds and the snapshot does not exist, the batch has no answer to
"what should have happened" — which is the product's entire purpose.

**Never updated, never deleted.** This is the plan freeze applied to laboratory work, for the same
reason: adding a checkpoint next month must not make last month's batch retroactively incomplete.

**Why `checkpoint_map` is stored again here.** The snapshot's job is to survive the catalogue
changing underneath it. Holding only `checkpoint_id` leaves the record's meaning dependent on rows
someone may later add, edit or resolve away. Storing the map makes the row self-describing.

**Per-pile expands to one row per pile, not one row with a count of six.** Six rows for
`LAB-T1-PRE` on a six-pile batch. `expected_count` stays for the batch-level case. This is what
lets the system say *"pile 4 is missing"* rather than *"4 of 6 present"* — and per-pile
traceability is the only reason those checkpoints are per-pile at all.

**Dependency to check before writing this:** activation must know the pile count. If the pile count
is set after activation rather than at it, say so and stop — do not default it to six. Six is the
current working figure, not a rule.

**No backfill.** Batches that already exist get no snapshot. Writing one now would be inventing
what they were expected to do. The view returns "no expectation recorded", which is the truth.

---

## D2 · Compatibility with the 45 existing definitions

The existing catalogue is not merged, mapped, reconciled or chosen between. C-33 stays open.

1. **Add a third value to the enum.** `alter type lab_checkpoint_map add value 'LAB_2026A'`.
   Additive; touches no existing row.
2. **Insert the 25 LAB-2026A checkpoints under that map**, from
   `docs/01-process/lab_checkpoints.json`, idempotently. `LAB_DICTATION`'s 27 and `S4B_COLUMNS`'s
   18 are untouched and stay exactly as they are.
3. **Add the missing fields as nullable columns** on `lab_checkpoint`: `kind`, `per_pile`,
   `sort_order`, `stage`. Existing 45 rows get NULL, which honestly means *not specified for this
   map*. **Do not backfill a guess into them** — inferring `per_pile` from `scope` or a name is
   exactly the invented rule the constraints forbid.
4. **Which map new batches snapshot against is a configuration row, not code.** One setting, read
   by `activate_batch`. Flipping it is a reversible decision the process owner makes; it is not a
   migration and it does not require agreement on C-33.

This uses the versioning primitive that already exists rather than inventing a second one, forces
no answer to C-33, and modifies not one deployed row.

`lab_parameter` becomes a child of `lab_checkpoint` carrying label, unit, value type, options,
requiredness and order — the metadata `parameters text[]` cannot hold. The array stays for the
existing 45; new rows use the child table. Do not migrate the array.

---

## D3 · The idempotency key

Settled, so nobody waits on it again:

```
column   idempotency_key uuid
index    unique, per target table
client   generate uuid v4 once, at the moment of the user action, before the first send.
         Persist it in the offline queue. Every retry sends the same value.
```

**The behaviour that matters more than the name:** on conflict the RPC returns the existing row.
It does not raise.

```sql
insert into … on conflict (idempotency_key) do nothing;
-- then select the row for that key and return it, with was_replay = true
```

A unique violation surfacing to an offline queue is worse than no key at all: the client sees an
error for a capture that actually succeeded, and either retries forever or tells a technician their
reading was lost when it was not. Return `was_replay` so the client can settle the queue item
quietly.

---

## D4 · The 35 bands — classification, not deletion

`lab_spec` stays the single threshold authority. Add none, remove none.

Add one nullable column, `confidence`, with the classes already used across this project:
`FACTORY_CONFIRMED` · `SIMULATION` · `UNRESOLVED`. Leave every existing row NULL.

**Do not assign the classes.** `S4a Table 2` and `S4a Table 3` are cited as sources; whether those
tables are a factory statement or a working model is a question for the process owner, not an
inference from a `source_ref` string. Until a row is classified it may inform a warning and must
not drive a gate — that rule is unchanged.

`lab_test` already copies the resolved band and its provenance at request time, so historical
results are not re-judged when a band changes. That is the right design and it is already there;
do not duplicate it.

---

## Order of work

```
1  D2 steps 1–3   enum value · the 25 rows · nullable columns          additive, no risk
2  D1             batch_lab_expectation + the write inside activate_batch
3  D2 step 4      the configuration row
4  D3             idempotency key on the lab RPCs
5  D4             the confidence column, left NULL
```

Tasks B and C — the two capture screens — are not blocked by any of this and can run in parallel
against fixtures.

Stop and report after step 2. That is the one with a behavioural change in it.

## Still not yours to decide

C-33 · who approves a laboratory result · whether a gate can be overridden · the chicken-manure
measurement point · the 67–68 % band · what `S4a Table 2` and `Table 3` actually are.
