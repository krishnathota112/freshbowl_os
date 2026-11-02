# Assign daily tasks + Monthly task chart (6 Oct 2026)

Two new tabs in the Tasks sidebar (web and APK). Their layouts follow two workbooks the owner supplied:

- **`June'2026 Schedule.xlsx`** (sheet "AUG - SEP") — *how the factory's monthly schedule looks*: a row per **date** (with weekday),
  a column per **batch group** (097 098 099 …), and in each cell the **stage of that day** (Bagasse weighment → Bagasse pre-wet →
  Rest → Paddy soaking 1 → PS-2 → Mixing of minerals → PF-T0+T0 → T1+B/L → Rest → B-R/L-1 → T/L → …). A stage that lasts several days
  ("Rest") is written on every day. Its GR/L (grow-room load) columns are not Tasks-app data and are not reproduced.
- **`20260925 Batch 182 Progress (1).xlsx`** (sheet "Status as on 30th Sept") — *how the stakeholder wants to see it*: rows are
  **date + hour** (00 - 01, 01 - 02 …), columns are batches, and each task is **one merged block** over its hours, labelled with its name.
  Its "Process Flow of 182" sheet already exists in the app as the per-batch Excel report.

**Status: built and tested locally; not deployed and no APK built.** No database migration was needed (next number is still **0161**).
Nothing was written to the live database during development.

## What it does

| Tab | Who | What |
|---|---|---|
| **Monthly task chart** | Admin, Supervisor, Lab, GM (Manager has its own page) | The June schedule layout: **dates down, batches across, the day's stage(s) in each cell** (up to three lines, then "+N more"; process rows before Lab rows). A stage that runs for days appears on every day it covers, marked **↳** and greyed, exactly like "Rest" in the sheet. Weekends shaded, today outlined, date columns and batch header stay in view while scrolling; opens at today. Each task is a coloured line (see **Colours**). Tap a cell → drawer with its tasks; tap a date → that day on the hour board. |
| **Assign daily tasks** (Admin) / **Daily tasks** (others) | same | One day, or 2–3 days, as the Status-sheet **hour-by-hour board**: date + hour down, a column per batch, one block per task (parallel tasks of a batch get their own sub-column). Below it, each batch's tasks in time order, **Carried over** (planned earlier, unfinished) and **Not on a day yet**. Day arrows, date picker, 1/2/3 days, batch filter. |

**Blocks tell plan from fact** (the 1 Oct planning note: planned and actual must stay distinct): a task that has been started is drawn where it
was *actually* done (start → finish, or → now while running) as a **solid** block; every other task is drawn at its **planned** start for its planned
duration as a **dashed, hatched** block. Blocks snap to whole hours like the spreadsheet; hover for exact times. A red line marks the current time.
A task with no planned duration is drawn one hour tall (display only, nothing stored).

## Colours (owner's rule, 6 Oct)

**Orange = a task. White = rest. Red = missed.** Missed means the task's planned start has passed and nobody has started it (any type, including rest).
Recorded work is never red: a started or finished task keeps its own colour, with a mark in front — **✓ done · ▶ running · ⧖ waiting for GM**.
Lab rows count as tasks (orange, smaller type). Applied to chart lines, board blocks and the task list's left edge. A cell containing any missed task
gets a red outline.

## Editing (Admin only) — the screens behave like a table

- **Edit a row:** the **Edit** button on any task (daily list, or the cell drawer on the chart) opens one row of fields — task name, type (Work / Rest /
  Cleaning), date, start time, duration hours + minutes. Only fields you change are sent, so renaming a task does not turn a linked time into a fixed one.
  Switching to Rest drops the photo requirement (as in the batch editor); Lab tasks cannot be switched here.
- **Drag on the chart:** drag a task line to another day of the **same batch**; the time of day is kept. **Drag on the board:** drag a dashed (planned) block to another
  hour of its own batch column; the minutes are kept. Recorded work is not draggable. A drop on another batch is refused with a message.
  A checkbox, off by default, makes a drag (or an edit form's option) also move the later tasks of the same stream by the same amount; linked tasks always follow.
- **Assign:** the *Assign a task to this day* form (daily tab) and the drawer form (chart) put an unstarted or undated task on a day and time.
- Touch screens have no drag, so use Edit. After every save a one-line confirmation shows ("Saved … N later tasks moved with it").

## Editing a whole batch, adding tasks, task types, Paddy (7 Oct)

- **Batch panel** — the **tune** button in each batch header on the chart (or **Edit batch** on the daily screen). Admin can edit the batch **name**, **note** and **start**.
  Changing the start **fills every task down**: every unstarted task that has a planned time moves by the same amount, so the first one lands on the new start —
  the same "change the batch start and all dates shift together" the New batch screen does. Recorded work never moves; linked tasks move with it; a preview line says
  how many tasks move and by how long. If work has already started the field becomes "Remaining tasks start (first unstarted task)".
  The header shows **first task** (the earliest planned time), not the batch's stored start (H0): the stored H0 shown elsewhere in the app (batch card, Excel report) is **not changed**
  by this — doing so needs a small database function (a possible migration 0161) and was not added without asking.
- **Task type** — Process (the app's *work*), Rest, Lab, Cleaning, everywhere: a **Show** filter (hide/show each type on the chart, the board and the lists), a type filter and type
  label in the task picker, a **Type** field in the edit row, and the type of a **new** task. Switching Process ↔ Rest ↔ Lab ↔ Cleaning is allowed on unstarted tasks (photos follow the
  batch editor's defaults); a Lab *gate* keeps its approval step and cannot be switched.
- **Edit row** now has: name, type, **stream**, **how it is timed** (fixed date/time · after the previous task in its stream · after the previous task in the batch) with **extra wait**,
  date, start time, duration, **description**, and **Remove task** (tap twice). Linked timing is calculated by the same scheduler as the batch editor.
- **Add a new task** — the card on the daily screen, the chart drawer and the batch panel have two tabs, *Move an existing task* and *Add a new task* (type, stream, name, day, time, duration).
  New tasks are appended to the plan (the batch editor's rule: new process tasks go after recorded work).
- **New batch** — a button on both screens opens the existing New batch screen (start, template, all tasks filled down).
- **Paddy → second convergence** — the existing planner (`paddy-convergence.js`) is now shown on both screens: a pill per batch header/chip ("Paddy on time", "Paddy ⚠ 2 h short",
  "Paddy ready early", "Paddy timing needs setup", shown only for batches that have a Paddy stream) and, in the batch panel, the full card: target, projected ready time, cause,
  suggested start/finish of every soak working backward. Admin can **set the target** (moves the "Second convergence" row) and **Put suggested Paddy starts into the plan**
  (recorded rows are skipped). Field roles see the forecast read-only. It is advisory: it does not prove bagasse/CM, platform, bunker/tunnel or Lab readiness
  (see `CONVERGENCE_AND_PHOTO_RELEASE_2_3.md`).

## Full screen

**Full screen** (top right of both screens) expands the whole pane — toolbar, chart or board, drawer and editor — to the screen (browser full screen when allowed,
otherwise the whole window). **Exit full screen** or **Esc** returns. Saving or changing month/day inside full screen keeps you in it; changing tab releases it.

## Rules kept

- "Assign" means **putting a task on a day/time in the batch plan**, not naming a worker (owner's earlier ruling, `NEXT_STEPS.md` §1).
  Any suitable logged-in worker still opens and performs the task. Starts are still independent (0155).
- A move is saved through the **batch plan editor's own guarded call**: `tk_batch_plan_get` → `plan-scheduler.js` rules →
  `tk_batch_plan_save` (stale-edit token, recorded rows protected, closed batches refused, audit before/after). So these screens
  cannot do anything Edit batch · rows could not. Recorded work, notes, photos and Lab results are never touched.
- A move that would leave a linked task with no start time is refused with a message (nothing saved).
- Field roles get both screens read-only (no controls rendered, no writes).

## Files

`app/www/day-plan.js` (pure logic: dates, states, tone, hour board with lanes, month matrix with multi-day spans, `edit`/`assign`) ·
`app/www/planning-views.js` (screens) · `app/www/planning.css` · wiring in `app.js` (`homeView` tabs, `planningCtx`) and `app.html` ·
`app/tests/planning.test.cjs` (39 tests) · `app/scripts/verify-release.mjs` lists the new files.

Queries use existing views only: `tk_v_task_v3` (with a 10-day look-back so a long stage that began earlier still shows) and `tk_v_batch`.

## Verification

- `npm test` in `app/`: **151 pass** (112 existing + 39 new: dates/states, board placement/snapping/lanes/clipping/recorded-vs-planned, month matrix incl.
  multi-day spans and month-edge clipping, assign with and without stream shift, refusals, per-role tabs, read-only roles, exact RPC sequence and payload,
  server refusal shown, chart drawer assign, date-header jump, tone colours, edit rules, editor form, chart and board drag, full screen enter/exit/Esc and release on tab change).
  Round 3 adds tests for batch-start fill-down, add/remove, linked timing, type filter, Paddy pill/card/apply/target and the read-only roles. A test caught a real bug: "keep the minutes" must use the local clock (IST is a half-hour zone), not epoch hours.
- Browser-checked in a throwaway fake-login harness (outside the project) with 6 batches shaped like the Excel: desktop and phone widths, Admin and Supervisor.
- **Not done:** a run against the live database with a real Admin login (the agent does not sign in), a phone install, deployment, and a side-by-side
  comparison with the stakeholder on real batch data.

## Judgment calls to confirm with the owner

1. Cells show the SOP **task titles**, not the short codes of the June sheet (PS-2, T/L, B-R/L-1). Short codes would need a per-row "schedule label" (a new
   column/migration) — not added; ask first.
2. Lab rows are shown below process rows in a cell (in smaller type) rather than hidden; the June sheet has no Lab rows.
3. GR/L (grow-room load) columns of the June sheet are not shown — that data is not in the Tasks app.
4. Colours follow the owner's rule (orange task / white rest / red missed) instead of the June sheet's per-stage colours (yellow paddy soaking, blue T/L). Lab rows are orange, and a Lab row past its planned time is red like any other task — say if Lab should be exempt.
5. Missed is judged on the planned start only; there is no grace period.

## Before release

1. Owner signs in as Admin on the local site (`python -m http.server 5190 --directory app/www`), opens both tabs, and moves one **test** task in a
   disposable batch; confirm it appears on the new day and in the batch's Edit rows.
2. Bump `build-info.js` / `versionCode`, build the APK, run `npm run release:prepare`, deploy (owner), then `scripts/verify-release.mjs`.

## Possible next steps (not built — ask first)

- Excel export of the monthly chart in the June layout and of the hour board in the Status layout (the batch report already exports Excel);
  drag a task between days; short schedule codes per SOP row; a capacity overlay (platform/bunker/tunnel occupancy) from
  `PROJECT_STATE_AND_PLANNING_2026-10-01.md` §5.
