# Data visualization plan

Proposed roadmap for MushroomOS Tasks, 3 November 2026. This plan builds on the deployed records and preserves the distinction between planned work, forecasts and recorded facts.

## Audience and first questions

| User | Decision the view should support |
| --- | --- |
| Admin | What should run today, what needs replanning, and which changes affect other streams? |
| Supervisor | Which task can I record, what evidence is still required, and what is already running? |
| Lab / GM | Which results or decisions need my action, and how long have they been waiting? |
| Manager / Director | Which batches need attention, why, and what evidence supports that conclusion? |

Use the existing green/cream product styling. Keep dates in IST, display exact minutes on detail, and keep orange=task, white=rest, red=missed on the scheduling views. Use solid marks for actual work and dashed marks for plans. Show unavailable data as unavailable, never as zero.

## Phase 1 — Operational schedule and trustworthy coverage

1. **Monthly batch matrix:** dates down, batch groups across. Continue long tasks across days. Show at most three task labels in a cell, with a drawer for the complete list. Clicking a date opens the hourly board.
2. **Daily hour board:** one batch per column, parallel tasks in separate lanes. Recorded start-to-finish intervals are solid; planned intervals are dashed. Running intervals end at the snapshot time, not an invented finish. Preserve exact timestamps even when blocks snap to hours.
3. **Evidence coverage strip:** for the selected period show counts of measurable actual durations, completed tasks missing timestamps, required-photo gaps, and tasks with/without recorded crew. Clicking a count opens the affected task list.
4. **Exception list:** overdue starts, running overruns, returned Lab results, waiting GM decisions and material alerts, each linked to its underlying task/batch. Define thresholds visibly; don't turn a display warning into a production-start gate.

Sources: `tk_v_task_v3`, `tk_v_batch`, `tk_photo`, `tk_reading`, `tk_decision`, `tk_v_task_resources`, and `wb_v_requirement`. Existing daily/monthly and Director views supply much of this phase. Complete pagination and request-generation guards are part of the v2.8 release.

Acceptance: a 20-day rest crossing a month boundary is visible; overlapping streams remain separate; all records load beyond server row caps; rapidly changing the date cannot show an older selection; each summary reconciles to its task drill-down. Test role visibility with Admin, Supervisor, Lab, GM and Manager accounts.

## Phase 2 — Plan versus actual and laboratory turnaround

| View | Encoding | Definition / limits |
| --- | --- | --- |
| Standard versus actual duration | Dot/interval plot per task or Turner pass | Process Time SOP planned standard alongside median, p10/p90 actual duration and sample count. Show individual observations for small samples. |
| Start-delay distribution | Histogram and per-stage dot plot | Actual start minus the batch task's saved suggested start; missing planned/actual timestamps excluded and counted. |
| Lab turnaround | Timeline per submission round | Lab submission to GM decision, with returned rounds separately visible. Pending decisions end at snapshot time. |
| Throughput by day | Daily bars | Completed tasks by India calendar day. Separate process/Lab; exclude `done_before` from work throughput. |
| Batch progress | Planned and recorded progress side by side | Task-count completion is not material tonnage or percentage of compost ready. Label its denominator. |

Use `tk_batch_progress` for batch report drill-down and existing Operations/Director paginated reads for aggregate views. Keep measured averages separate from editable planned standards. Do not automatically change standards from historical averages.

Acceptance: zero-minute observations remain zero; missing times remain missing; returned Lab rounds are not overwritten; displayed sample counts match the underlying filtered records; filters apply consistently to chart, ledger and export.

## Phase 3 — Materials, labour and machinery

- **Material receipts:** required versus cumulative received kg by batch/material, with the allowance band and slip events. Voided slips remain visible in the audit list and are excluded from balances. Allow kg/ton display without changing storage units.
- **Crew observations:** observed labour-hours by task/stage, calculated only where crew count and valid elapsed time both exist. Show coverage beside totals. These are task-assignment slots, not deduplicated headcount or employee attendance.
- **Machine use:** task counts and measured odometer distance, with incomplete reading pairs clearly identified. Keep each machine's snapshot identity in historical records.
- **Refuelling:** litres added over time by machine, with voided entries excluded. Do not label this as task-level fuel consumption, fuel efficiency or cost without the additional measurements those metrics require.

Sources: `wb_v_requirement`, `wb_v_slip`, `wb_alert`, `tk_v_task_resources`, `tk_v_machine_refuel`, and machine catalog views. The current Operations page already supplies a baseline for these views.

## Phase 4 — Confirmed resource-capacity planning

The current Factory Flow page is a read-only what-if model based on the supplied workbook. Its platform capacities are inferred and its windows use a fixed reference template. Publish it as an advisory; it is not a physical occupancy register.

Before introducing authoritative capacity decisions, confirm:

1. The names and capacities of platforms, bunkers and tunnels, including whether capacity is per physical batch or grouped batch.
2. Which task occupies each resource, what event releases it, and whether cleaning/changeover is required.
3. Whether conflicts are warnings or hard refusals, and who may approve an exception.
4. Which Lab/material conditions are required for readiness and where the evidence is recorded.

Then introduce explicit planned reservations and actual occupancy/release events. Visualize each resource as a timeline lane: planned need, actual occupancy, cleaning, unavailable periods, and conflict intervals. Connect the existing start-window proposal to the selected SOP and saved standards instead of hardcoded reference hours. Each forecast must list its assumptions and show unknown readiness.

## Shared interaction and delivery rules

- Global filters: date range, batch group, stream, task type and machine where relevant. Preserve filters when opening details and returning.
- Drill down from every chart to the underlying records; keep the batch/task UUID as identity rather than joining on a display name.
- CSV/Excel exports must match the active filters, preserve units and IST dates, and escape spreadsheet formula-like text.
- Charts need keyboard access, readable labels, a table alternative and useful empty/error states. Do not rely on colour alone.
- Show the snapshot time and loading/refresh state. After a failed partial load, show an error rather than incomplete totals.
- Prefer the existing vanilla JS structure and shared pure models. Vendor any future chart dependency with a pinned version for APK compatibility.
- Validate with fixture tests for missing data and boundaries, then compare a real batch's charts with its report and source records. A browser test with fixtures is not production data acceptance.

Suggested delivery order: finish Phase 1 with real factory review, add the duration/Lab views in Phase 2, refine resource measurements in Phase 3, then implement Phase 4 after physical-resource rules are confirmed. No database migration is authorized merely by writing this roadmap.
