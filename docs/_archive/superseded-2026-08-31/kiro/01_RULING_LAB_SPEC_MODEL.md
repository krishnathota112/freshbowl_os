# Ruling — the lab specification collision

**Addressed to the implementation agent.** This answers the BLOCKED report on Task 1 and replaces
`docs/03-mission/kiro/01_KIRO_LAB_SPEC_TABLES.md`, which was wrong.

**You were right to stop.** The brief specified a table without checking whether the name was taken,
and then forbade altering existing tables — two instructions that cannot both be satisfied. Do not
work around a contradiction like that again; stopping was correct and cost far less than a silent
`CREATE TABLE IF NOT EXISTS` would have.

---

## What the brief got wrong

| Brief said | Reality | Verdict |
|---|---|---|
| create `lab_checkpoint (code text primary key)` | `lab_checkpoint` exists, uuid PK, `checkpoint_map` provenance, FK'd from `lab_sample` and `lab_checkpoint_conflict` | **brief wrong** |
| `submit_lab_result` / `supersede_lab_result` / `approve_lab_result` | `record_lab_result(test_id,…)`, `order_retest(…)` and approval functions already exist | **brief wrong** — names invented |
| all thresholds are UNRESOLVED | `lab_spec` holds active numeric bands with tests asserting them | **conflict, unresolved — see R4** |
| all gate bindings ship disabled | four predecessor gates are already active and tested | **conflict — see R3** |
| additive only, no existing table altered | incompatible with the first row | **brief incoherent** |

The brief was written as a clean-sheet design and never checked against the deployed schema. That
is the same failure the audit was told to avoid — describing intent instead of reading the system —
committed one layer up, in the specification rather than in the code.

---

## R0 · Before anything: establish whether a second catalogue is needed at all

**Do not pick a new table name yet.** The prior question is whether the existing model already
carries this requirement.

What is known from your report: `lab_checkpoint` has a uuid PK, a `checkpoint_map` reference, and
`unique(checkpoint_map, code)`. That shape is a *versioned set of checkpoint definitions* — which is
exactly what Task 1 was trying to build, and it solves the per-batch freeze more cleanly than the
brief's `effective_from` date range did. If that reading is correct, the existing model is better
than the one specified and a second catalogue would be a duplicate authority for one fact —
forbidden by the standing rules.

**First deliverable, before any DDL:** a written comparison, `docs/02-architecture/LAB-SPEC-MODEL.md`,
answering only this:

1. What is `checkpoint_map`? A version of a checkpoint set, a mapping to something else, or
   something else again? Quote the DDL.
2. Does `lab_checkpoint` describe *definitions* or *occurrences*? What does `lab_sample.checkpoint_id`
   actually point at — a definition, or one instance of a checkpoint on one batch?
3. Which of the fields Task 1 needs already exist, which are missing, and which are named
   differently: `kind` (GATE/DECISION/RECORD) · `per_pile` · `sort_order` · parameter list ·
   evidence requirement · gate binding.
4. Does a batch already record which `checkpoint_map` it ran under? If yes, the freeze problem is
   already solved and the brief's `effective_from` should be dropped entirely.
5. What is `lab_spec`, what is in it, and where did its numbers come from?

Then one of two recommendations, with the reasoning:

- **EXTEND** — add missing columns to the existing family and a `lab_parameter` table keyed to it.
  Expected outcome if `checkpoint_map` is a version. Additive, no rename, no second authority.
- **PARALLEL** — a separate catalogue is genuinely required because the existing tables model a
  different concept. Only if you can name the concept and say why one table cannot serve both.

Stop after that document. It is short — a page — and it decides everything downstream.

If PARALLEL turns out to be right, the prefix is `labspec_` for the whole family
(`labspec_checkpoint`, `labspec_parameter`, …). Not `lab_checkpoint_spec`: three near-identical
names — `lab_spec`, `lab_checkpoint`, `lab_checkpoint_spec` — is how the next agent picks the wrong
one.

---

## R1 · The RPC names: keep what exists

`submit_lab_result`, `supersede_lab_result` and `approve_lab_result` were invented in the brief
without checking. **Do not rename a working function to match a document.**

- Keep `record_lab_result` and the existing approval and retest functions.
- Add the idempotency key to `record_lab_result` — that requirement stands and is the one thing in
  Task 3 that must not slip.
- `DATA-CONTRACTS.md` currently documents a third signature, `record_lab_result(checkpoint_id, values)`,
  which matches neither. Correct the document to the deployed signature. The document is wrong; the
  function is right.

Append-only remains non-negotiable however it is named: a correction is a superseding row with a
reason, never an update.

---

## R2 · The idempotency key stands

One user action generates one uuid on the device; every retry sends the same value; stored with a
unique constraint; a replay produces one logical submission.

Agree the column name and semantics with the foundation workstream before writing it — both sides
of the wire must match. This is the one item in Task 1 that is not blocked by R0 and can be
specified in parallel.

---

## R3 · Gates: nothing that currently works gets disabled

The brief's "all gates ship off" was about *new* lab-spec-driven bindings. It was never a licence to
switch off four gates that already function and have tests.

**Ruling:** existing predecessor gates stay exactly as they are. If a new binding mechanism is
introduced later, it ships disabled — and under no circumstances do two gating mechanisms run at
once. Two things that can both block an activity is how an operator ends up stuck with no reason
that any screen can explain.

Establish in the R0 document whether the four existing gates are the same four the standard names
(BNK-PRE, CM-USE, BNK-LOAD, TUN-LOAD) or a different mechanism entirely. Do not assume they match
because the count is the same.

---

## R4 · Thresholds: one authority, and its numbers need provenance

Two claims are in conflict and both cannot stand: the standard says no threshold is confirmed;
`lab_spec` holds active numeric bands that tests assert.

**Ruling:** `lab_spec` is the single threshold authority. Do not create a second, and do not add
thresholds from the JSON — it now carries none, deliberately.

But `lab_spec`'s numbers need provenance before anything gates on them. Each band is one of:

```
FACTORY_CONFIRMED   the factory stated it. Quote where.
SIMULATION          it came from a model, a sample dataset, or a plausible guess.
UNRESOLVED          nobody knows where it came from.
```

Until a band is classified, it may inform a warning and must not drive a gate. A band that arrived
as a placeholder and is now defended as a factory rule is the exact failure this project keeps
rediscovering, and an untraced number sitting in a table called `lab_spec` is how it happens.

Classifying them is a factory conversation, not a code change. Report what is in there; do not
assign the classes yourself.

---

## R5 · The JSON now carries the machine-readable facts

You were right that `per_pile`, multiplicity and the conditional rules existed only in prose.
`docs/01-process/lab_checkpoints.json` has been regenerated. Every checkpoint now has:

```json
"per_pile": true,
"multiplicity": { "basis": "PILE", "expected_count_expr": "pile_count",
                  "expected_count_default": 6 },
"confidence": "CONFIRMED | CONFIGURABLE | ADVISORY | UNRESOLVED_BAND",
"sort_order": 160,
"thresholds": [],
"effective_from": null,
"gate_binding": { "blocks_activity_code": null, "is_enforced": false,
                  "source": "NOT_SUPPLIED — read real codes from process_activity" }
```

`LAB-CM-USE` carries a structured `conditional` block; `LAB-MOIST-DEC` carries structured
`decision` branches with the 67–68 % band marked `UNRESOLVED` rather than rounded away.

Three things are still deliberately absent, and each `null` means *not supplied*, never *zero*:

- **`effective_from` is null.** Version identity belongs to the schema — very likely
  `checkpoint_map`. Do not synthesise dates from this file.
- **`thresholds` is empty everywhere.** See R4.
- **`blocks_activity_code` is null on all four gates.** Read the real codes from `process_activity`.
  Do not invent one, and do not guess from a checkpoint name that looks like an activity name.

---

## What to do now, in order

1. Write `docs/02-architecture/LAB-SPEC-MODEL.md` per R0. **Then stop and report.**
2. On the ruling that follows, implement EXTEND or PARALLEL.
3. The importer reads the regenerated JSON. Idempotent — running it twice changes nothing.
4. Views and RPCs per whichever model was chosen, with R1's names.

Tasks 2 and 3 — the two capture screens — are **not blocked by this**. They read
`v_lab_checkpoint_spec` (or whatever R0 names it), and against fixtures they do not need it to
exist yet. If you have capacity, start them in parallel against fixtures generated from the JSON.

---

## Preserved, unresolved, and not yours to decide

M-1 approval authority · N-3 gate override · K-2 the chicken-manure measurement point · the
67–68 % band · and now the provenance of every band in `lab_spec`.

Your conflict and TBD registers stay open. Nothing in this ruling closes one.
