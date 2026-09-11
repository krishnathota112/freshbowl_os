# Kiro · standing context

**Paste this at the top of every Kiro session on MushroomOS.** It is the same block every time.
Everything else — the four task prompts in this folder — assumes it has already been read.

---

```text
You are working on MushroomOS, the production management system for button-mushroom compost at
Fresh Bowl Horticulture. One batch takes 470 hours.

═══════════════════════════════════════════════════════════════════════════════
BEFORE YOU DO ANYTHING — read these five files, in this order, in full
═══════════════════════════════════════════════════════════════════════════════

  1  T:\obsidian\memory\Now.md              what is true as of this morning
  2  T:\obsidian\memory\MushroomOS.md       the hub — findings, decisions, sessions
  3  CLAUDE.md                              the five non-negotiable rules
  4  docs\00-START-HERE.md                  the router — it tells you which files your task needs
  5  docs\03-mission\MISSION.md             the phased brief and the stop gate

Then read ONLY the files 00-START-HERE.md routes you to for the task in this session.

DO NOT read the repository broadly. docs\_archive\ holds roughly ten thousand lines of superseded
instruction describing a 552-hour process the factory no longer runs. It is history. Reading it
will lead you to rebuild the wrong system, confidently.

If you find yourself reading a file that says 552, stop and check whether it is under _archive\.
If it is, close it.

═══════════════════════════════════════════════════════════════════════════════
THE TWO PLACES, AND WHAT EACH ONE IS FOR
═══════════════════════════════════════════════════════════════════════════════

  T:\freshbowl_os        WHAT is implemented.  Code, migrations, contracts.
  T:\obsidian\memory     WHY we decided it.    Findings, decisions, session history.

They are not copies. If a fact lives in the repository, the vault links to it rather than
repeating it. Duplication is how two documents come to disagree without anybody noticing.

When you need to know why something is the way it is, the answer is in the vault, not in a
commit message. Read:

  T:\obsidian\memory\decisions\     DEC-001 … one file per decision, never edited, only superseded
  T:\obsidian\memory\findings\      F1 … one file per known defect, with its status
  T:\obsidian\memory\sessions\      what previous sessions did, and what they got wrong

═══════════════════════════════════════════════════════════════════════════════
THE FIVE RULES THAT ARE NOT NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════════

  1  The plan freezes at activation. Once a batch leaves draft its planned and baseline columns
     never change, for anyone, by any path.
  2  Actuals are append-only. A correction is a new superseding record with a reason, never an
     overwrite. (Decided; not yet enforced. Do not rely on the database to stop you.)
  3  An extension is a third number, never an edit.
     planned_end · approved_extension · authorised_end · actual_end. Four numbers, never collapsed.
  4  The process is data. No factory rule lives in code or in a screen. No material name appears
     in a process definition.
  5  Read from views, never base tables. Write through RPCs, never insert or update.

═══════════════════════════════════════════════════════════════════════════════
FOUR THINGS YOU MAY NEVER DECIDE
═══════════════════════════════════════════════════════════════════════════════

The loader as a modelled resource · Turner changeover time · the receiving bunker for each
reload · the moisture band between 67 % and 68 %.

They are UNRESOLVED. Build no gate on any of them. If your task needs one, record that it needs
one and stop. Do not default it. Do not infer it. A number that arrived by inference, wearing the
clothes of a decision, is the most expensive thing you can leave behind.

═══════════════════════════════════════════════════════════════════════════════
STATUS WORDS — use only these four, and mean them
═══════════════════════════════════════════════════════════════════════════════

  GREEN       a test asserts it against a real database
  AMBER       implemented but unproven
  RED         broken or bypassable
  UNRESOLVED  needs a factory decision

"The migrations exist", "the tests are green" and "the demo works" are NOT GREEN.

═══════════════════════════════════════════════════════════════════════════════
HOW YOU LOG — this is not optional and it is not the last five minutes
═══════════════════════════════════════════════════════════════════════════════

Write the session report as you go, not at the end. A report written at the end is a report
written from memory, and the most valuable line in it — the thing you believed at 10am and
disproved at 2pm — is exactly the line memory drops.

Create the file when you start:

  T:\obsidian\memory\sessions\YYYY-MM-DD-<slug>.md

Use the format in docs\_templates\SESSION-REPORT.md. Its sections are:

  WHAT BECAME TRUE          statements that were not true this morning, each with its proof
  WHAT CHANGED              behaviour that moved
  WHAT STOPPED BEING TRUE   a document now wrong · an assumption disproved · a finding closed
  WHAT IS STILL UNKNOWN     "probed X, did not probe Y" — silence reads as "checked and fine"
  FILES CHANGED
  MIGRATIONS CHANGED        number, one line each, and whether applied to the deployed database
  CONTRACTS CHANGED         any view or RPC shape a screen depends on. Empty is a fine answer.
  TEST STATUS               passed / failed / skipped, and WHY for every failure and every skip
  SECURITY STATUS           GREEN | AMBER | RED | UNRESOLVED per area touched
  OPEN DECISIONS            anything now blocked on a factory answer
  DO NOT TOUCH              what the next person must leave alone, and why
  EXACT NEXT TASK           one task, named files. Not "continue" — a sentence somebody can start from.
  ACCEPTANCE TEST           how the next person knows they finished it

Then, in the same session — not later:

  · update T:\obsidian\memory\Now.md so it describes this evening, not this morning
  · update the findings table and session list in T:\obsidian\memory\MushroomOS.md
  · new decision?  write T:\obsidian\memory\decisions\DEC-0NN-<slug>.md.
                   NEVER edit an old decision. Supersede it and keep both.
  · new defect?    write T:\obsidian\memory\findings\F<N>-<slug>.md
  · claim, complete or add tasks in docs\03-mission\TASK-BOARD.md

A decision that exists only in a commit message will be re-litigated within the month.

═══════════════════════════════════════════════════════════════════════════════
THREE HABITS
═══════════════════════════════════════════════════════════════════════════════

  · Probe the deployed database; do not read migration files. Three conclusions moved the moment
    the live database was actually queried. Migrations describe intent. pg_proc.proacl,
    pg_policies and role_table_grants describe the system.
  · Report bugs outside your boundary; do not fix them. A casual fix to a foundational table is
    how four parallel workstreams become one broken one.
  · A refusal must name what to do instead.

═══════════════════════════════════════════════════════════════════════════════
NEVER
═══════════════════════════════════════════════════════════════════════════════

  · Never add a markdown file to the repository root.
  · Never write a factory number you were not given.
  · Never compute in a component. A component receives variance_min — it does not subtract two
    timestamps. It receives blocked_reason as a finished sentence — it does not compose one.
  · Never hard-code a laboratory checkpoint, parameter, threshold or unit in a screen.
    Those are rows. See prompt 01 in this folder for why.
```
