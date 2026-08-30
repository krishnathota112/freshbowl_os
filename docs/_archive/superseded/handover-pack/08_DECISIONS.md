> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 08 · Decision log

**Read this before proposing to change something.** It usually already says why.

Full reasoning for each lives in `T:\obsidian\memory\decisions\`. This is the index.

**Nothing here is ever deleted. A decision that stops being true is superseded, and both stay.**

---

## Frozen — do not reopen without a stakeholder decision

| ID | Decision | Why, in one line |
|---|---|---|
| **DEC-001** | **Five registers**, one writer each: STANDARD → PLAN → (ACTUAL \| AUTHORIZATION) → FORECAST | Management must be able to ask what should have happened, what did, and who authorised the difference. Only answerable if the answers are stored separately. |
| **DEC-002** | **The plan freezes at activation.** Never changes, for anyone, by any path. H0 never moves. Activation is one-way. | A variance is meaningless if the plan it is measured against can be moved afterwards. Without this every number the product displays is deniable. |
| **DEC-003** | **Actuals are append-only.** A correction is a new superseding record with a reason. | The sibling of DEC-002. Freeze the plan and leave actuals editable and you have only moved the hole. *(Decided; enforcement is the current priority.)* |
| **DEC-004** | **Supabase stays.** No move to another store. | Everything the product holds is relational, and the guarantees it depends on — plan freeze, append-only audit, deny-by-default RLS, server-enforced transitions — are database features. The problem was never the database; it was that domain boundaries were not explicit. |
| **DEC-005** | **The process is data**, not code. Sequence, durations, gates, lab and evidence requirements are rows. | The factory process changes and will keep changing. A rule in code is a deployment every time the factory changes its mind. |
| **DEC-006** | **Ten domains, one dependency direction.** Others consume contracts, never tables. | With several people working at once, this is the only thing stopping them producing several incompatible systems. |
| **DEC-017** | **Extension workflow**: operator requests, manager approves, GM approves. An Authorization register, separate from PLAN and ACTUAL. | Workers need a legitimate path when work cannot finish on schedule. Without one they either stop recording honestly, or a supervisor edits the plan — both destroy the evidence trail. |

---

## Confirmed by the process owner

| ID | Decision | Date |
|---|---|---|
| **DEC-018** | **H0 is bagasse wetting.** Pre-H0 weighment sits ~10–12 h before it, **advisory**, and never gates H0. | 29 Aug |
| **DEC-023** | **470 h is the target** · three bunkers one after another · **bunker fill is 2 h and normal** · both source spreadsheets are what the factory follows · M1/M2 are machines 1 and 2, the yellow columns 1–6 are the piles · MIN/MAX/AVG are all real, the standard plans on MAX. | 30 Aug |
| **DEC-024** | **The Foundation Freeze is the working method.** Red-team reports before any code changes; contracts freeze before screens. | 30 Aug |

**DEC-018 carries a trap.** The earlier authoritative matrix made pre-H0 readiness a *derived gate*
that unlocked H0. The PRD removes that gate. Same hours, **different rule** — whoever implements
`is_pre_h0` must not carry the gate across with the hours.

**DEC-023 closed five open questions** and narrowed DEC-020: the Turner sheet's *allocation* is still
an example, but its *durations, rests and structure* are the standard.

---

## Proposed — sound, not yet ratified

| ID | Decision | Status |
|---|---|---|
| **DEC-019** | **The envelope is a stated factory hour, not a day count × 24.** `envelope_hours` on `process_definition`, with a source and a confidence class. | Blocking. Migration `0041` drafted. |
| **DEC-020** | **The Turner sheet is a simulation for allocation**; three constraints survive into the Standard — 1.5 h per pass, the 8-hour T1→T2 rest, two machines of class TURNER. | Narrowed by DEC-023. |
| **DEC-021** | **470 h is a new process version**, `PROCESS-2026C`, created as a **copy** with `supersedes_id`. `PROCESS-2026B` is never edited — an active batch was generated from it. | Blocked on the publish/freeze step, which does not exist. |
| **DEC-022** | **Confidence class is a column, not a convention.** Seven classes as an enum, everything backfilled `UNRESOLVED`. | Migration `0040` drafted. Cheapest high-leverage item on the board. |

---

## Two decisions worth understanding, not just knowing

### Why the extension is a third number

```
planned end 12:00 · approved +2h → authorised 14:00 · actual end 13:40
original variance +1h 40m   ← still visible
```

Applying the extension by moving `planned_end_at` to 14:00 would erase the +1h40m — the one thing
the register exists to keep. Three sub-rules follow: approval only **narrows**; the window runs from
the **planned** end, not the approval; a request **after completion** is refused.

### Why confidence class is structural

Four separate findings turned out to be one mechanism: **a value moved up a confidence class with
nobody deciding it should.** A simulation span became the confirmed envelope; a machine-utilisation
property became a material gate; an unresolved proposal was written as a hard derived rule; three
durations for one operation circulated with no marker for which was stated.

Care does not prevent that. A not-null column does. And it is an afternoon of work.

---

## The pattern this project keeps rediscovering

> **A document that was true when it was written, still sitting where current instructions live,
> quietly teaching a superseded model.**

Twice now: the seeds held the losing H0 model after the matrix superseded it; then ten thousand
lines of root markdown held the 552-hour envelope after 470 was confirmed.

**Superseding is not finished until the old version has moved.** The archive step belongs in the
same commit as the replacement, every time.
