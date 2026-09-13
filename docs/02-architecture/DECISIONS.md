# Decision log

**Read this before proposing to change something.** It usually already says why.

Full reasoning for each lives in `T:\obsidian\memory\decisions\`. This is the index.

**Nothing here is ever deleted. A decision that stops being true is superseded, and both stay.**

---

## Frozen — do not reopen without a stakeholder decision

| ID | Decision | Why, in one line |
|---|---|---|
| **DEC-001** | **Five registers**, one writer each: STANDARD → PLAN → (ACTUAL \| AUTHORIZATION) → FORECAST | Management must be able to ask what should have happened, what did, and who authorised the difference. Only answerable if the answers are stored separately. |
| **DEC-002** | **The plan freezes at activation.** Never changes, for anyone, by any path. H0 never moves. Activation is one-way. | A variance is meaningless if the plan it is measured against can be moved afterwards. Without this every number the product displays is deniable. |
| **DEC-003** | **Actuals are append-only.** A correction is a new superseding record with a reason. | The sibling of DEC-002. Freeze the plan and leave actuals editable and you have only moved the hole. *(Enforced — `trg_actual_is_append_only`. On 9 Sep it refused to clear an actual from a superuser connection.)* |
| **DEC-004** | **Supabase stays.** No move to another store. | Everything the product holds is relational, and the guarantees it depends on are database features. |
| **DEC-005** | **The process is data**, not code. Sequence, durations, gates, lab and evidence requirements are rows. | The factory process changes and will keep changing. A rule in code is a deployment every time the factory changes its mind. |
| **DEC-006** | **Ten domains, one dependency direction.** Others consume contracts, never tables. | With several people working at once, this is the only thing stopping them producing several incompatible systems. |
| **DEC-017** | **Extension workflow**: operator requests, manager approves, GM approves. An Authorization register, separate from PLAN and ACTUAL. | Workers need a legitimate path when work cannot finish on schedule. |
| **DEC-028** | **A write either happens or refuses. It never pretends.** A call that changes nothing is an explicit idempotent success — or a refusal that says why — and never writes an audit event saying something happened. | A trail that records a start, a submission or a baseline freeze that did not occur is evidence of something untrue. Found three times: `0071`, `0073`. |
| **DEC-029** | **A gate that opened can shut again — but work in progress is never demoted.** A later rejection returns a `READY` activity to `LOCKED`; an activity already `IN_PROGRESS` is left alone and becomes a matter for a deviation. | Leaving a rejected gate open is the one state that cannot be explained afterwards. Demoting work already begun would rewrite what happened. `0072`. |

---

## Confirmed by the process owner

| ID | Decision | Date |
|---|---|---|
| **DEC-018** | **H0 is bagasse wetting.** Pre-H0 weighment sits ~10–12 h before it, **advisory**, and never gates H0. | 29 Aug |
| **DEC-023** | **470 h is the target** · three bunkers one after another · **bunker fill is 2 h and normal** · both source spreadsheets are what the factory follows · M1/M2 are machines 1 and 2, the yellow columns 1–6 are the piles · MIN/MAX/AVG are all real, the standard plans on MAX. | 30 Aug |
| **DEC-024** | **The Foundation Freeze is the working method.** Red-team reports before any code changes; contracts freeze before screens. | 30 Aug |
| **DEC-025** | **The backend is frozen.** It changes only for a defect that real UI integration exposes, recorded in `FINDINGS.md` before it is fixed. The current work is the three workstations. *Basis: 195 adversarial attacks across two waves with no open code defect, the machine and vessel exclusion proven at model and RPC level, and the whole loop run on an Android device.* | 11 Sep |
| **DEC-026** | **Photo evidence is taken with the device camera, not chosen from a gallery.** Production capture uses a native camera flow; the file-input picker is not acceptable for evidence. *The handset run showed the file input opening the Photo Picker; one real handset still to confirm.* | 11 Sep |
| **DEC-027** | **Three workstations, one design system, different density.** Admin · Supervisor/Operator · Lab share one visual grammar and one set of states; each carries only the information its job needs. Admin gets complexity, operators do not. `docs/05-ui/`. | 11 Sep |

**DEC-018 carries a trap.** The earlier authoritative matrix made pre-H0 readiness a *derived gate*
that unlocked H0. The PRD removes that gate. Same hours, **different rule**.

**DEC-023 closed five open questions** and narrowed DEC-020: the Turner sheet's *allocation* is still
an example, but its *durations, rests and structure* are the standard.

**DEC-025 does not mean nothing may change.** It means a change needs a named defect found by using
the product, not an idea about what a backend should have. The backend items open today each wait
for that decision: `request_lab_test`'s missing guard (F37), a misleading regression check (F38),
idempotency keys (F39), extension requests left open on a cancelled batch (F46) — and one that
should not wait: **`0077`, the fix for a regression `0072` introduced**, which writes 30 untrue
audit events on every poll (F47). It is written and held for approval to apply.

---

## Proposed, and what became of them

| ID | Decision | Status |
|---|---|---|
| **DEC-019** | The envelope is a stated factory hour, stored on the definition. | **Superseded.** The standard is **calculated** from the definition's own activities — `v_process_catalogue.standard_hr`, `max(standard_end_hour)` excluding `PARALLEL_NO_WALLCLOCK`. `stated_envelope_hr` records what a document claims; `envelope_disagrees` flags a difference. A stored number can drift from the activities; a calculated one cannot. |
| **DEC-020** | The Turner sheet is a simulation for allocation; 1.5 h per pass, the 8-hour T1→T2 rest and two TURNER machines survive into the Standard. | Narrowed by DEC-023. The 8-hour rest is enforced per pile, from that pile's own T1 actual end. |
| **DEC-021** | 470 h is a new version, `PROCESS-2026C`, created as a copy; `PROCESS-2026B` is never edited. | **Done.** `PROCESS-2026C` published and current, standard 470. `PROCESS-2026B` published and untouched, standard 536. |
| **DEC-022** | Confidence class is a column, not a convention. | **Implemented** — `process_confidence`, `timing_confidence`. `PRD-001`'s full acceptance not re-verified. |

---

## Decisions worth understanding, not just knowing

### Why the extension is a third number

```
planned end 12:00 · approved +2h → authorised 14:00 · actual end 13:40
original variance +1h 40m   ← still visible
```

Applying the extension by moving `planned_end_at` to 14:00 would erase the +1h40m — the one thing
the register exists to keep. Proven on 9 Sep with a real 8-hour grant in force: variance stayed
−179 min, the plan and the actual did not move, and `authorised_end = planned_end + 8 h` exactly.

### Why a narrowing is not a retreat

Two fixes this cycle were written broader than the evidence for them, and the existing suite caught
both. `0073` refused any lab sample dated before H0 — including on batches whose H0 is in the future,
where "before H0" is just "now". `0072` required a checkpoint's binding across two checkpoint maps,
when whether cross-map sampling is legitimate is a factory question. `0075` and `0076` narrow each to
exactly what was demonstrated.

**A guard broader than its evidence is an invented factory rule wearing a security badge.** Narrow it
to the case you can prove, and report the rest as a question.

### Why confidence class is structural

Four separate findings turned out to be one mechanism: **a value moved up a confidence class with
nobody deciding it should.** Care does not prevent that. A not-null column does.

---

## The pattern this project keeps rediscovering

> **A document that was true when it was written, still sitting where current instructions live,
> quietly teaching a superseded model.**

Three times now: the seeds held the losing H0 model; ten thousand lines of root markdown held the
552-hour envelope; and on 11 September the audit board still said **RED**, `FINDINGS.md` still said
470 could not be stored, and `SCHEMA.md` — generated, trusted above everything — said every view
bypassed RLS. All three were a week or more out of date.

**Superseding is not finished until the old version has moved.** The archive step belongs in the
same change as the replacement, every time — and a generated document is only as true as the last
time somebody checked its generator.
