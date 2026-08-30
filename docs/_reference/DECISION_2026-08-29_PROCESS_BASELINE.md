# Decision — the implementation baseline, and the process question left open

**29 August 2026.** Recorded at the point of decision, by the process owner.

---

## The decision

**The committed repository is the implementation baseline.** The seed files under
`mushroomos/supabase/seed/` define `PROCESS-2026B`, and the database is restored from them.

**This is a working baseline, not a ruling on factory truth.** It was chosen so that the test suite,
the build and the web demo have one definition to agree on. It does **not** settle where H0 sits.
That question is open and belongs to the process owner — see §3.

**Explicitly not done:** the live database's divergent hour model was *not* ported into the repo.
It is preserved verbatim (§4) so the question can be reopened without re-deriving anything.

---

## 1 · What was found

The live Supabase database and the committed seeds disagreed about `PROCESS-2026B`. Restoring the
repo definition was blocked by a check constraint, which is what surfaced the disagreement:

```
new row for relation "process_activity"
  violates check constraint "process_activity_rel_day_derived"
```

That constraint (`0011_hour_axis.sql`) holds `rel_day = standard_start_hour / 24`. The seeds restore
`rel_day`; the live database held hours that implied a different `rel_day`. Both sides were
internally consistent. They were consistent with **different models**.

## 2 · The disagreement, exactly

Eight rows out of fifty-one. Forty-three agreed.

| Activity | Repo seed | Live database | Live hours |
|---|---|---|---|
| `FIB1-HOP-1` | Day 1 | Day 0 | H0 → H3 |
| `FIB1-HOP-2` | Day 1 | Day 0 | H3 → H6 |
| `FIB1-BUNK-LOAD` | Day 1 | Day 0 | H6 → H8 |
| `LAB-FIB-WET` | Day 1 | Day 0 | H1 |
| `LAB-FIB-MOISTURE-1` | Day 1 | Day 0 | H3 |
| `LAB-FIB-PREBUNK` | Day 1 | Day 0 | H6 |
| `P1-BUNK-LOAD` | Day 8 | Day 9 | H217 |
| `LAB-BUNK-FILL` | Day 8 | Day 9 | H217 |

Beyond the eight, the live database also carried:

- **50 rows** marked `standard_hour_source = 'factory_stated'` — real hour spans rather than
  `rel_day × 24`. **Nothing in the repository ever writes `factory_stated`.**
- **`is_pre_h0` / `pre_h0_offset`** set on `LAB-PRE-INTAKE` (−12 h) and `FIB1-WEIGH` (−10 h),
  putting weighment outside the production rail.
- Those two columns **exist in no migration**. `0032_prebatch_material.sql` adds `is_prebatch`, a
  different column. The schema itself had drifted.

## 3 · Why this is a process-owner question, not a bug

**The repository contains two frozen specifications that contradict each other.** The live database
was not wrong — it implemented one of them.

| Source | Says | Status in repo |
|---|---|---|
| `docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md` | H0 **is** Bagasse Wetting. `FIB1-HOP-1` H0→H3, `LAB-FIB-WET` H1→H2, `LAB-FIB-MOISTURE-1` H3. Pre-H0 zone at ≈ −10/−12 h, advisory, outside the clock. | *"FROZEN — Final Approved Baseline"* |
| `docs/IMPLEMENTATION_CHECKLIST.md` §2 | *"Day 1 lab is four checkpoints (already seeded — keep)"* | *"Frozen corrections (do not reopen)"* |
| `mushroomos/supabase/seed/s03`, `s08` | Day 1 | committed, and what the tests assert |
| `docs/KIRO_HANDOVER.md` §2 | H0 is Bagasse Wetting; `is_pre_h0` with 12 h / 10 h offsets | dated 26 Aug 2026 |

The live database matched the **authoritative matrix**. The seeds never caught up with it. So the
divergence is the *implementation of a frozen spec that the seed files were never updated to match* —
not a stray edit by someone working directly on the database.

`ins2.md` Phase 1 required that this land as migration and seed changes, with the exact changes
reported, before anything else proceeded. That step did not complete in this repository.
`docs/KIRO_HANDOVER.md` §3 refers to a second working tree, `mushroomos-alpha`, holding migrations
through `0034` and a planned `0035_authoritative_process_2026b.sql`. **This repository has `0033`
and no `0035`.** That working tree was not present on this machine and could not be inspected.

> **The open question, for the process owner:**
> Does H0 start at Bagasse Wetting (authoritative matrix, and what the factory was last understood
> to do), or at Fibre Weighment with the lab checks on Day 1 (current seeds and tests)?
>
> Until this is answered, the seed definition is a convenience, not a finding. **Do not cite the
> current baseline back to the factory as what the system believes.**

## 4 · What was preserved

The full live model — all 52 rows carrying `factory_stated` hours and/or the pre-H0 flags — was
exported as replayable SQL **before** anything was overwritten, together with a complete snapshot of
`process_activity`, `process_day`, `gate_rule`, `activity_field`, `master_batch`,
`location_occupancy` and all 276 function bodies.

Nothing is lost. If the matrix is confirmed, the model is replayed and written into the seeds as a
proper migration rather than reconstructed from scratch.

## 5 · What was restored, and how

Every step ran through the repository's own tooling. No table was hand-written.

| Step | Command | Effect |
|---|---|---|
| Schema and functions | `npm run db:migrate` | 33 migrations re-applied. The database had been running **superseded function bodies** — `advance_batch` was still the `0008` version, which `0018` replaces. |
| Process definition and gates | `npm run db:seed` | Gate rules went from 3 kinds to 10; `GM_APPROVAL` and `SENSOR_THRESHOLD` — which hold the tunnel — were absent entirely. |
| Demo batches | `s11_demo_batches.sql` | The three staggered `MB-DEMO-*` batches had been deleted. Regenerated so their plans derive from the restored definition. |
| Vessels | `scripts/allocate-vessels.mjs` | `batch_vessel_allocation` was empty while occupancy rows still claimed three tunnels — orphans the engine cannot produce, since `release_vessel` refuses to release an occupied vessel. |
| Work history | `scripts/stage-history.mjs` | Staged over HTTP as the real demo accounts, through the real RPCs. |

## 6 · One repository change this forced

`mushroomos/supabase/seed/s03_process_2026b.sql`

The seeds are documented idempotent — `scripts/db.mjs`: *"Seeds are idempotent, so re-running is
safe."* They were not. Re-running against a database whose `rel_day` had moved tripped the derived-hour
constraint and stopped the entire seed set at `s03`, which is precisely the situation a re-seed exists
to repair.

`s03` now clears **derived** hours before its upsert; `s10_hour_axis.sql` re-derives them immediately
after. `factory_stated` hours are deliberately left alone, so a real factory reading still fails
loudly against a contradicting `rel_day` rather than being silently discarded — the same predicate
and the same reasoning `0011` already uses. On a healthy database it is a no-op.

## 7 · Consequences to carry forward

1. **The seeds are now the only definition of `PROCESS-2026B`.** Anything the matrix specifies that
   they do not say is not in the system.
2. **`docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md` and `docs/KIRO_HANDOVER.md` describe a model the
   code does not currently implement.** Both are flagged at the top. Read them as the open proposal,
   not as the running system.
3. **`is_pre_h0` and `pre_h0_offset` remain in the schema, unset and unused.** They were not dropped —
   dropping is destructive and they cost nothing. No migration creates them; a rebuild from
   `supabase/migrations/` will not have them.
4. **Three cancelled pre-A2 batches (`batch`, `MB-2026-08-20`, `MB-2026-09-20`) are gone** — deleted
   in an earlier session by a script that runs `delete from master_batch`. `demoBatches.test.ts`
   asserts they survive as cancelled records. **They were not recreated:** inventing cancelled
   history to satisfy a test would be exactly the fabrication the standing brief forbids. Those
   assertions fail honestly.
5. **Eight leftover draft batches** from earlier sessions remain, carrying stale `rel_day` rows. They
   are not referenced by any test and were left rather than deleted.

## 8 · Testing strategy, as directed

**Web first.** The web demo is validated and signed off by the process owner before any packaging work.

**Android/APK is Phase 2 and deferred.** No Capacitor, JDK or SDK work is undertaken until the web
demo is approved. The web build is kept Capacitor-compatible in the meantime — `npx cap sync android`
is run so the Android project carries the current bundle — but no APK is produced.

For the record, this machine cannot build one regardless: no Android SDK, no `android/local.properties`,
and Java is **1.8** where Capacitor 6 needs JDK 17+.
