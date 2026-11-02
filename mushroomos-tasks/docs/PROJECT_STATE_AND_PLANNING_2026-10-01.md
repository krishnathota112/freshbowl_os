# MushroomOS Tasks: work so far and planning baseline

**As of 1 October 2026. Planning document only.** No application code, database record, deployment, APK, or supplied workbook was changed to make this document. This records the product concept, the work already documented, what the owner's workbook reveals, and decisions still needed before further implementation. It is not a claim that every feature below was re-tested today.

## 1. The application we are trying to finish

Freshbowl needs one trustworthy way to plan and record button-mushroom compost production. The factory works on overlapping batches and parallel streams, not one linear checklist. Bagasse preparation, paddy soaking, chicken-manure/mineral mixing, Lab work and cleaning can overlap. Streams converge; Turner work happens on individual piles; material then moves through bunkers, tunnels and grow-room discharge.

The owner's immediate application is **MushroomOS Tasks**: an Admin writes an editable SOP as numbered rows, creates an editable batch-specific plan, and factory staff record the work actually done on their phones. The same records should let the owner see where each batch stands and download a useful progress report. A task is available to an eligible person; it is not assigned to one named worker. Serial number and suggested time guide the floor, but the Tasks app no longer blocks a task merely because an earlier row or Lab approval is unfinished.

Keep these concepts separate throughout the UI and data:

| Concept | Meaning |
| --- | --- |
| SOP version | Reusable, published process instructions and default timing. |
| Batch plan | Editable copy of a selected SOP, with its own row order, stream, description, suggested time and duration. |
| Actual work | Recorded start/end, actor, notes, machine/bunker/tunnel answer and task-specific photos. Never derived from the plan. |
| Lab / GM record | Separate Lab reading/submission and GM decision history. Submission is not approval. |
| Weighment | Material requirement and photo-backed receipt/slip ledger, stored separately from `tk_task`. |
| Batch status/report | A *view derived from those records*, with uncertainty shown when evidence is missing. |

This Tasks product is distinct from the larger main MushroomOS process engine and the separate Weighbridge station. They share authenticated factory infrastructure, but a similarly named batch in another subsystem is not the same database object. The main engine's stricter readiness, resources, gate and ticket rules must not be assumed to exist in Tasks.

## 2. What the Excel sent by the owner looks like

The reviewed file is `C:/Users/prath/20260925 Batch 182 Progress (1).xlsx`. It has three sheets:

| Sheet | Shape and purpose | What stands out |
| --- | --- | --- |
| `Process Flow of 182` | 76 rows, 13 columns. A vertically ordered Batch 182 process schedule with stage headings, expected hours, parallel-operation notes, date, start, end, time taken, remark and Actual/Planned. | Only four process rows are labelled **Actual**; 66 are labelled **Planned**. It is a detailed process *plan and partial record*, not a complete actual history. |
| `Sheet2` | 6,369 rows, four columns: Date, Time, a grouped 179–181 column and Batch 182. | Appears to be a narrower/helper hourly view. Its business meaning needs confirmation before the app models it. |
| `Status as on 30th Sept` | 6,371 rows and 114 used/formatted columns. Date and hourly window run down the left; row 2 names 23 batch-number columns, from 172 through 195 in the workbook's order. | This is the important **multi-batch control-room grid**. On 30 September, 00:00–12:00 is blank; 117 cells across ten batch columns are populated from 12:00–24:00. Repeated text describes resting/loading/soaking by hour. |

What is good about it: one glance can show many batches at once; the hourly grid captures parallel operations; the Batch 182 sheet preserves a stage sequence and factory notes. It expresses how the owner thinks about production much better than a generic task list.

What prevents us from using the file as an automatic source of truth without design work:

- **Plan and actual are mixed.** A coloured hour or text in a status cell may be a forecast, an observed state or an update entered later. The file does not encode that distinction consistently.
- **Clock notation is ambiguous.** Process cells such as `7.3` and `20.3` are not typed clock times; some midnight-crossing planned rows have negative `Time Taken` values (for example rows 26 and 32). We should not infer `7.3` means 07:30 or 7.3 decimal hours without confirmation.
- **The two workbook views can disagree.** In Batch 182's process flow, the 30 September morning plan describes “Soaking 3”; that afternoon's status grid describes “Paddy Soaking 1.” This is a planning/revision question, not an error to auto-correct.
- **Physical identity matters.** The status grid says Batch 182's paddy moved to bunker 2, while the Tasks report available on 30 September recorded a bunker 1 loading. These may be separate operations, a changed plan or a wrong label. The app must preserve the exact source and time of each assertion.
- **Free-text states cannot reliably answer all questions.** “Bagassee - 15 Rest,” “Bunker - 13 Resting,” a Turner pile, a Lab result and a photograph need structured identities if the app is to answer what happened, when, where and to which material.
- **The grid extends far beyond the filled period.** A huge hourly canvas is useful as an export/view, but entering production facts in thousands of empty cells is not a sensible primary mobile workflow.

**Recommended interpretation for planning:** the workbook is a valuable output/reference format and a source of factory vocabulary. The application should own typed planned and actual records, then generate a similar multi-batch hourly view. This is a proposal, not yet an owner-approved source-of-truth decision. Manual Admin annotations may still be needed, visibly labelled as such.

## 3. What has been built or recorded so far

These are the major documented milestones, with the reason behind each. The more detailed historical handoff remains in [COMPLETE_CONTEXT_AND_CHANGELOG.md](COMPLETE_CONTEXT_AND_CHANGELOG.md).

| Work | Why it was requested | Documented result |
| --- | --- | --- |
| Separate Tasks website and Android APK | The owner wanted a simpler SOP-to-phone task app, not the entire main process engine. | Authenticated Tasks UI and `tk_*` data model. |
| SOP editor and ready template | Starting from empty rows and H-hour equations was too hard. | Editable, versioned SOP with a prefilled Compost standard template; batch creation makes its own copy. The v2 reference has 104 master rows: 64 Process/rest and 40 Lab/gate rows. |
| Calendar suggestions and Admin timing | Suggested dates should shift from each batch's bagasse-wetting start; downstream plan times should move when a planned time changes. | Suggested dates, planned duration, linked timing/gaps and fixed anchors. Planning does not invent actual work or re-enable start gates. |
| Process/Lab tabs, shared serial numbers, descriptions | Lab checks needed real rows, not only notes inside work rows; admins needed context beside a task. | Process, Lab and All-task views use one master numbering; Description is separate from Lab/control and worker note. |
| Turner pile records | Each physical Turner pile needs its own pass, timing and before/after evidence. | Editable initial pile count (six by default), per-pile Turner rows and photos. Explicit owner scope: Turner only. |
| Editable batch rows after creation | The Admin must correct the running batch's future plan. | Batch-specific editor; recorded/evidenced rows are protected, with stale-save checks. Full-screen web editing and paging address the wide table. |
| Independent task starts | The owner asked to open tasks without the task-above dependency gate. | Serial order and Lab/GM remain recorded; they do not block ordinary task starts in Tasks. |
| Progress website and Excel export | The owner supplied a Batch 182-style output. | Batch report with plan versus actual, numbered tasks, Lab/pile details, photos counts, timestamps and Excel download. Missing actual times are not fabricated. |
| Weighbridge and Weighments | Random material arrivals need slip-backed balances and short/excess alerts. | Separate weighbridge entry plus Admin requirements and Supervisor slip entry through the same `wb_*` ledger; per-material kg/ton display preference. Canonical storage is kg, and 1 metric ton is 1,000 kg. |
| APK update and usability work | Phones were sluggish; releases and logout placement caused problems. | Public download site and visible Update button; paging, photo preparation and request/navigation improvements. Logout was removed after accidental taps and later restored with confirmation at the owner's request. Real-device validation remains necessary. |
| Data Orientation placeholder | The owner wants a place to specify future analysis. | Admin-only tab exists, but no ML model or analytics requirements were implemented there. |
| 30 September comparison workbook | The owner wanted the Batch 182 Excel compared with that day's app entries across all batch columns. | Separate comparison Excel with batch coverage, hourly workbook states, 18 timed app tasks visible through 19:27 IST, and labelled differences/uncertainties. It is a snapshot, not an automatic live sync. |

The local Tasks build manifest records **v2.2 / versionCode 13** with the Data Orientation placeholder. That is evidence of a local release artifact, not proof of what is installed on every factory phone today. The documented websites are the Tasks site `https://mushroomos-tasks.pages.dev/` and the public APK site `https://freshbowl-tasks-downloads.pages.dev/`.

## 4. Data-loss incident and non-negotiable safety boundary

Live Tasks batch/task/photo records were bulk-deleted during this project. This was a real data loss, not a hidden list. Four old batches (173–175, 176–178, 179–181 and 182), 151 task rows and 34 missing photo links were reconstructed from surviving audit and Storage evidence. The old 183–185 plan and some photo files were only partly recoverable; a newly created batch with the same label is **not** the original one. Exact Lab reading values and GM decision rows were not restored from the surviving audit. The recovery record is [RECOVERY-2026-09-30.md](../database/recovery/RECOVERY-2026-09-30.md).

This changes the design standard for finishing the app:

1. No production-wide clear/flush action. Hide, close or archive only with an exact scope, a visible preview and a recovery route.
2. Before data repair or migration: fresh read-only backup, exact IDs, row counts, dry-run/transactional checks and post-change verification. New worker entries must be preserved.
3. Never attach photos to a new task merely by row order or matching batch name. Preserve original task UUIDs where known.
4. Show “missing evidence,” “recovered from audit,” “manually entered,” “planned” and “actual” distinctly. Do not silently fill missing times, readings, actors or approvals.
5. Regular backup and tested restore must be an acceptance requirement before claiming the system is operationally finished.

## 5. Proposed shape of the finished Tasks application

The following is for discussion, not an implementation instruction.

### Capacity planning before a new batch

**New owner requirement, 1 October:** a batch's bagasse-wetting start cannot be chosen in isolation. Only one batch can occupy the relevant platform at a time, and bunkers and tunnels are limited. Before an Admin starts or schedules another batch, show current occupancy, existing future reservations and the earliest feasible start windows. This scheduling/alert feature is **proposed, not built in Tasks**. The larger main MushroomOS specification already discusses exact resource identity and readiness, but that does not make the feature live in this separate Tasks app.

- Maintain a register of **named physical resources**: the platform (exclusive capacity of one batch, subject to confirming which platform/stages are meant), each bunker and each tunnel. Machines may also be schedulable if scarcity matters. Never treat “bunker” as a single generic pool when a task needs a numbered bunker.
- A resource booking is an **interval with a lifecycle**, not just a task title: planned need/start/release, actual occupy/release, cleaning or changeover, readiness, batch/stream and exact resource ID. A bunker can be unavailable after unload until cleaning is confirmed; an unstarted task should not make it appear occupied.
- The new-batch screen takes a proposed bagasse-wetting start, projects each stream's resource intervals from the selected SOP and batch plan, and compares them with existing batches. It should show **why** a time conflicts: which resource, which batch holds it, from when until when, and whether that end is planned or actually verified.
- Offer the **next feasible start time or several alternatives**, with a timeline of platform, bunkers and tunnels. Recalculate proposals if an existing batch runs late or a plan changes, without rewriting its old baseline or actual events. If release/cleaning data are missing, show **availability uncertain**, not an invented green slot.
- Distinguish a *draft proposal*, an *approved reservation* and *actual occupation*. Do not silently reserve a resource simply because someone previewed a candidate batch. The owner has asked for an alert; whether a conflicting batch may be saved as a draft or whether starting must be blocked requires an explicit policy decision. This is separate from the earlier decision that ordinary Tasks rows can be opened independently of predecessor rows.

The first useful display is a resource calendar beside the Excel-like multi-batch board: each row is the platform or a numbered bunker/tunnel, each bar is a batch's planned or actual occupancy, and conflict/cleaning/unknown intervals are visually distinct. A simple deterministic scheduling calculation should come before any ML model.

### Convergence warning and suggested paddy-soaking times

**Additional owner requirement, 1 October:** Admin must be warned when the present plan is likely to miss convergence. Whenever a batch is proposed or its timing changes, the planner should suggest when paddy preparation and each required soaking step should begin so paddy is ready when the conditioned bagasse/CM path and the necessary physical resource are ready. This is a planning proposal, **not an existing Tasks notification**.

- Determine the intended **second convergence** target from the batch plan, the bagasse/CM forecast and platform/resource availability. Work backward through the selected paddy variant's preparation, soaking, rest and handling durations. Show suggested start and finish for **each** paddy step, not only one unexplained soak time. Do not assume a third soak for a local two-soak variant.
- Show the target, projected paddy-ready time, remaining margin and cause of risk. For example: “Paddy projected ready 17:00; convergence target 15:00; 2 hours late because Soak 2 began later than planned.” An earlier-ready paddy stream is **waiting**, not automatically late.
- Recompute after a new batch proposal, an Admin plan edit, a Supervisor's actual task start/finish, or a resource delay. Alert Admin when the forecast enters a configurable risk window and when the target is no longer feasible. Acknowledgement and an updated forecast should prevent repetitive notifications for the same unchanged risk.
- Offer choices with consequences: start the next paddy step by a stated time if still physically possible; choose another valid resource/time; or move the **forecast** convergence time and downstream affected tasks. Never rewrite the frozen baseline or completed actuals. Do not recommend shortening a required soak/rest or skipping Lab work to manufacture an on-time result.
- If required duration, resource readiness or an actual task time is unknown, say **cannot calculate a reliable recommendation** and identify the missing input. A warning derived from assumptions must not be presented as a certainty that the factory will miss convergence.
- Keep this as a planning/notification rule unless the owner separately decides to enforce a hard process gate. The existing Tasks decision that ordinary tasks can be opened independently remains in force.

The rule is the latest readiness of the required incoming streams and resource, not one blanket delay applied to the entire batch. The first convergence on the CM path and the second convergence with prepared paddy should have separate definitions and alert policies.

### Admin planning

- Versioned SOP templates for process variants (including local versus Punjab paddy where appropriate), with clear required and optional rows.
- One editable row grid with serial number, stream, task type, title, description, suggested start, planned duration, gap/relationship, Lab checkpoint, photo/answer requirements and report section.
- Batch creation anchored to bagasse wetting; batch-specific editing and plan revision history. Recorded rows and evidence remain immutable even when the plan changes.
- Explicit treatment of parallel streams, convergence and per-pile Turner rows without forcing every task into a global dependency chain.

### Factory execution

- Mobile-first task cards with clear planned time versus logged start/end; before/after photo prompts tied to the exact task and pile; machine/bunker/tunnel answer when configured.
- Work remains independently open under the current owner decision. Required evidence/role checks and closed-batch protection still apply.
- Lab readings and GM decisions get their own identity, timestamps and rounds. A Lab submission does not become an approval by display shorthand.
- Supervisor weighment entry remains a separate ledger with explicit unit conversion, slip photo, receipt balance and variation alerts.

### Labour, machine and fuel on Supervisor tasks

**New owner requirement, 1 October:** in **Supervisor → All tasks**, capture the number of labourers and machine/heavy machine used, with measured fuel information. The additive database migration is live and the local UI is available; the public website/APK have not been released. Implementation and safety checks are in [TASK_RESOURCES_2026-10-01.md](TASK_RESOURCES_2026-10-01.md). Fuel is currently measured as machine-level litres added at refuelling, not fabricated litres per task.

- On a work task, show compact **planned versus actual** fields. Admin can optionally set expected crew and machine needs in the SOP/batch plan; Supervisor records the actual labour count, one or more selected machine IDs/types (including heavy equipment), and fuel used. Rest and Lab rows should not be forced to invent crew/fuel values.
- Fuel should have an explicit unit (normally litres), fuel type when relevant, and a **machine/task attribution**. If two machines worked on one task, their fuel amounts should be separate so totals do not double-count. Record the person/time of entry and edits; preserve the original value in an audit trail.
- Blank means **not recorded**; zero means a Supervisor explicitly recorded none. Do not turn an unanswered field into zero. A chosen machine should be a real asset from an Admin-maintained list where possible, with a reviewed “Other” path for unexpected equipment.
- A single labour count plus task duration can yield only an **estimated labour-hours** figure if the crew stayed constant. If crews change during a long task, either record separate crew intervals or label the simple estimate honestly. Machine runtime, if collected, is distinct from task duration.
- Decide how fuel is actually measured. If operators know litres by task, capture that directly. If they only know refuelling/shift totals or hour-meter readings, store those real measurements first and allocate fuel to tasks transparently later; do not fabricate per-task precision.
- Reports should show per-task and per-batch labour, machine use and fuel totals/variance, with missing entries visible. The owner can then compare planned resource demand against what the team actually used.

### Owner's view and output

- A **batch board** answers: which batch is in which physical/process stage, what was most recently verified, what is only planned, and what has missing evidence. It should also show concurrent streams, not force a single stage when paddy and bagasse differ.
- An **hourly multi-batch board** reflects the useful shape of the supplied status Excel. Colour/text must distinguish planned, actual, inferred from events and manual Admin annotation. Empty cells are unknown, not automatically idle.
- Per-batch progress report and Excel export preserve serial order, streams, planned/actual timing, Lab, Turner piles, notes, evidence counts and source timestamps. The current comparison workbook is a one-time reconciliation example, not the long-term data model.
- Data Orientation can start with normal coded filters and visuals—batch-by-stage, planned-versus-actual variance, queue of missing photos/readings, bunker/tunnel occupancy if reliable inputs exist. ML should wait for a specific prediction question, sufficient historical data and a way to measure whether it helps.

### Reliability and release

- Fast, stable editing on the actual factory phones under weak network and camera use; retain unsaved input through upload/error paths and make retry outcomes clear.
- Safe app updates with signed in-place APK installation, version checks and a user-visible Update button; web and APK releases tracked separately.
- Automated checks plus real-role, real-phone walkthroughs for Admin, Supervisor, Lab and GM. Include upload, midnight timing, concurrent edits, network interruption and recovery/restore tests.

## 6. Decisions to settle before code changes

1. **Source of truth:** Should the Tasks database be authoritative for actuals and the editable batch plan for forecasts, with the Excel generated from them? If the hourly spreadsheet remains manually editable, how should an override be labelled and reconciled?
2. **Meaning of an hourly cell:** Does “resting” mean a planned instruction, an observed physical state, or both depending on who entered it? Should a state persist to the next hour automatically, or must each hour be confirmed?
3. **Physical mapping:** How should one task specify batch number, stream, pile, bunker, tunnel and material movement so Batch 182's bunker 1 versus bunker 2 discrepancy can be resolved without guesswork? Which grouped batches need individual identities?
4. **Timing notation and precision:** Confirm how `7.3`, `20.3` and similar source numbers should be read, and whether the owner's board should show hourly blocks while actual task records retain minute precision.
5. **What “finished” means:** Agree on a short acceptance checklist: must-have screens/roles, exact reports, offline or weak-signal expectations, phone models, backup/restore, and a factory walkthrough. This avoids building every feature from the much larger main MushroomOS specification into Tasks.
6. **Platform boundary:** Which exact stage first occupies the one-batch platform, and what physical event releases it? Are there distinct paddy/Turner platforms, or one shared platform?
7. **Inventory and changeover:** How many numbered bunkers and tunnels exist, what are their usable capacities, and what cleaning/readiness time or evidence is required between batches? Do not make up counts from the example workbook.
8. **Conflict policy:** At new-batch creation, is a conflict a warning with draft allowed, or must actual starting/allocation be refused until the resource is free? Who may approve an exception, if any?
9. **Fuel measurement:** Is fuel known per machine per task, or only per refuelling event/shift? Should Supervisor enter fuel while finishing the task or later against a machine log?
10. **Labour measurement:** Is one crew count per task sufficient, or do long tasks need shift/crew changes? Are machine runtime and operator identity required now or later?
11. **Convergence target:** Which physical event is “paddy ready,” what is the intended second-convergence target for each process variant, and how much early-ready margin is useful or harmful?
12. **Notification policy:** Who receives at-risk versus already-missed warnings, how far ahead should a warning fire, and may Admin acknowledge or revise a target? The warning must show its underlying durations and resource assumptions.

**Recommended next planning step:** walk through one real batch from bagasse wetting to current status using the supplied workbook and the app, annotate every place where plan, observed state and actual task record differ, then approve the source-of-truth rules above. No data migration or UI code should start until those rules are clear.

## 7. References and evidence boundaries

- [Complete context and change history](COMPLETE_CONTEXT_AND_CHANGELOG.md): detailed chronology, roles, superseded decisions and release notes.
- [Owner's SOP reference](../reference/owner_sop_reference_table.md), [factory provenance](../reference/factory-sources/PROVENANCE.md) and [main-app product context](../reference/main-app-product-docs/00_READ_ME_FIRST.md): factory process references, not proof that every rule is implemented in Tasks.
- [Batch report implementation record](BATCH_PROGRESS_REPORT.md), [timing and unit record](AUTO_TIMING_AND_WEIGHT_UNITS.md), [weighment record](WEIGHBRIDGE.md): documented implementation intent and verification at their dates.
- [Recovery record](../database/recovery/RECOVERY-2026-09-30.md): exact surviving and missing evidence.
- Owner-supplied workbook: `C:/Users/prath/20260925 Batch 182 Progress (1).xlsx`; left unchanged.
- 30 September comparison snapshot: `outputs/2026-09-30-factory-comparison/30-Sep-2026-factory-batch-comparison.xlsx`; its website source cutoff was 19:26–19:27 IST on that date.

The document states what was documented or directly inspected. Current production records, deployments and device behaviour need a fresh check before any implementation or operational claim.

## 8. Ideas raised on 1 October 2026 (single checklist)

This checklist captures the owner's additions in today's discussion, without treating them as implemented features:

1. Plan **multiple batches together**, not one batch in isolation.
2. Respect the **one-batch platform limit** and the finite, individually identified bunkers and tunnels.
3. At new-batch planning, show **which batches exist now**, what resources they occupy or are expected to occupy, and when each resource may next be free.
4. Warn about a proposed batch's resource clashes and **suggest feasible start times** rather than merely accepting the typed bagasse-wetting time.
5. Use parallel-stream **convergence** in the plan: a downstream combined operation waits for all required streams and resource readiness; an unrelated branch does not inherit the delay.
6. Give Admin a clear **at-risk / will-miss-convergence notification**, with the reason and the size of the predicted timing gap.
7. Whenever the plan or actual progress changes, **suggest when to start paddy preparation and each soaking step** so paddy reaches the intended convergence in time, using the selected two- or three-soak process rather than guessed timings.
8. In Supervisor → All tasks, record the **actual number of labourers** on each applicable task.
9. Record the **specific machine or heavy machine used** on each applicable task; allow more than one machine when real work requires it.
10. Record **fuel consumed** with an explicit unit and machine/task attribution, or record the real refuelling/shift measurement first if per-task litres are not directly known.
11. Keep **plan, forecast, actual work and manual observations distinct** in the app and in the Excel-like multi-batch view.
12. Remain in the **planning phase**; no app, database or APK change is authorized by this discussion yet.
