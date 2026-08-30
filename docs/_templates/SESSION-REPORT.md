# Session report — the template

**Every substantive session ends with one of these.** No exceptions, including sessions that
achieved nothing — *especially* those, because "we tried X and it did not work" is the most
expensive thing to rediscover.

The test: **could someone continue tomorrow from the repository, the Obsidian vault and this report
alone — without the conversation that produced it?** If not, the report is not finished.

---

## Copy from here

```markdown
# Session — YYYY-MM-DD — <one line: what this session was for>

## WHAT BECAME TRUE
Statements that were not true this morning and are now, each with its proof.
"Migration 0038 applied; actual_start is write-once; 11 tests in tests/actualImmutability.test.ts."
Not "worked on actual immutability."

## WHAT CHANGED
Behaviour that moved. Someone who knew the old behaviour needs to read this and know to relearn.

## WHAT STOPPED BEING TRUE
The one people skip, and the one that costs most when missing. A document that is now wrong.
An assumption that was disproved. A workaround that is no longer needed. A finding that closed.

## WHAT IS STILL UNKNOWN
Questions the session raised and did not answer. Anything you looked at and did not verify.
"Probed X, did not probe Y" belongs here — silence reads as "checked and fine".

## FILES CHANGED
## MIGRATIONS CHANGED          number, one line each, and whether applied to the deployed DB
## CONTRACTS CHANGED           any view or RPC shape a screen depends on. Empty is a fine answer.

## TEST STATUS
passed / failed / skipped, and WHY for every failure and every skip.
A skip with no reason is a lie of omission.

## SECURITY STATUS
GREEN | AMBER | RED | UNRESOLVED per area touched. Every RED gets its exploit path in one sentence.

## OPEN DECISIONS
Anything now blocked on a factory or stakeholder answer. Add to 10_OPEN_QUESTIONS.md.

## DO NOT TOUCH
What the next person must leave alone, and why. Frozen boundaries, in-flight work, a table
mid-migration.

## EXACT NEXT TASK
One task. Named files. Not "continue the audit" — "fill rows 12–16 of WRITE_PATH_MATRIX.md by
probing pg_policies for lab_result and lab_sample."

## ACCEPTANCE TEST
How the next person knows they finished it. Observable, checkable, no fake values.
```

---

## Three rules for writing one honestly

**1 · "Traced" must mean traced, not sampled.**
When claiming no regression, find the *mechanical* check. Example that earned it: new guards can
only fail loudly and in their own words, so grepping the entire test run for each new refusal
message proves no failure came from them. Reading four of thirty-two failures and generalising does
not.

**2 · Assert the outcome, not the mechanism.**
A self-promotion test once "passed" by not raising — it affected zero rows, because RLS
`USING (false)` filters and only `WITH CHECK` raises. The test was asserting the wrong thing.
Asserting the outcome is both correct and stronger.

**3 · Record where you were wrong.**
The most valuable lines in past session notes are the ones admitting a conclusion moved. Three
conclusions changed the moment the deployed database was probed rather than read from migration
files — and that single note is why the current mission says *verify, do not rediscover*.

---

## Where it goes

1. `T:\obsidian\memory\sessions\YYYY-MM-DD-<slug>.md` — the report itself.
2. Update `T:\obsidian\memory\MushroomOS.md` — the hub. Findings table, decision list, session list.
3. Update `docs/03-mission/TASK-BOARD.md` — claim, complete, or add tasks.
4. New decision? Write `T:\obsidian\memory\decisions\DEC-0NN-<slug>.md` and index it in
   `08_DECISIONS.md`. **Never edit an old decision — supersede it, and keep both.**
5. New finding? `T:\obsidian\memory\findings\F<N>-<slug>.md`, indexed in `09_FINDINGS.md`.

**Do it in the same session.** A decision that exists only in a commit message is a decision that
will be re-litigated.

---

## And the rule this project keeps relearning

> **Superseding is not finished until the old version has moved.**

If this session made a document wrong, move it to `docs/_archive/` with its header **in this
session's commit**. Not later. Later is how ten thousand lines of superseded instruction ended up
sitting where current instructions live.
