# UI ACCEPTANCE CRITERIA

The bar for Track C. Every item is **checkable** — by a test, a grep, or a five-minute manual
pass. Prose is not an exit proof.

Additional to, not instead of, `UI_DESIGN_SPEC §6` (the ten-point checklist) and
`DEMO_PLAN §7` / `DEMO_PLAN_V2 §3` (the 23 product criteria).

---

## A. Automated — these are tests, not opinions

Run in `npm test`. A failure blocks the step.

| # | Assertion | How |
|---|---|---|
| **A1** | `552` and `23` appear nowhere in `src/` or `supabase/` outside seed data and fixtures | grep test — `TIME_CONTRACT §2` invariant 8 |
| **A2** | No `05:00`, `06:00` or a 5/6-hour literal offset appears in `src/` | grep test — H0 comes from `start_at` |
| **A3** | `TimeLabel` cannot render a batch hour without a wall clock | type test — props are `{startAt, hour}`, no single-field overload compiles |
| **A4** | `Bar` cannot be used for batch progress | type test — required `kind: 'material'`; a batch-progress call fails to compile |
| **A5** | The `Tone` union has exactly the seven existing members | snapshot test — five semantic + `accent` + `muted`; widening fails |
| **A6** | `FiveLayerNode` renders layers in fixed order at every density | render test across all six densities |
| **A7** | A non-actionable state with no reason renders the DEFECT banner | render test over all six `NON_ACTIONABLE_STATES` |
| **A8** | A `LayerValue` of `null` renders `—`, never an empty node | render test |
| **A9** | A value carrying `conflictId` renders `ConflictMarker` with that ID | render test |
| **A10** | No L1/L2/L3 component imports `api/` or `@supabase/supabase-js` | ESLint `no-restricted-imports`, per directory |
| **A11** | No component outside `useDensity` reads `useAuth().role` | ESLint rule |
| **A12** | Time fixtures derive from `docs/source/book1_hour_grid.json` | test asserts fixture provenance, not typed-in hours |
| **A13** | Every fixture typechecks against the interface in `UI_DATA_CONTRACTS.md` | `tsc` — fixtures are typed, not `any` |
| **A14** | `HumanDuration` never emits raw minutes or decimal hours | property test over ±10000 minutes; output matches `/\d+h( \d+m)?|\d+m/` |
| **A15** | Every route in `App.tsx` has a `RoleGuard` except `/` and `/sign-in` | route-table test |

---

## B. Manual — the five-minute pass, per screen

Run in **both themes** and at **375 / 768 / 1280 px**.

### S1 Control Tower
1. Exceptions appear **above** the calendar and above the counters' fold on mobile.
2. Each exception states **how long it has been waiting for a person**, not just a timestamp.
3. Exactly **four** counters. No fifth number, no chart, no trend arrow.
4. Bars are sorted by `startAt` and the diagonal is visible at ≥768 px.
5. Exactly **one** `now` line on the board.
6. Clicking a bar at a point opens that batch **at that hour** — the URL carries `?h=`.
7. At 375 px the staircase is a vertical list; the page does **not** scroll horizontally.
8. No batch shows a percentage.

### S2 Batch Page
9. Wall clock is visually larger than the batch hour, which is larger than `of <baseline>`.
10. Variance reads as speech (`3h 20m behind`), nowhere as `+200 min` or a decimal.
11. Plan and actual are **two rails**; the offset between them is visible without reading a number.
12. Forecast is drawn distinctly from actual (lighter, dashed) and is never mistakable for fact.
13. `WHERE THE TIME WENT` shows at most **three** contributors plus a remainder line.
14. Dragging the playhead moves the graph, the event stream and the narrative **together**.
15. The playhead is keyboard-operable: arrow = one hour, `Shift`+arrow = one batch-day.
16. Rest segments read as calm and deliberate, not as warnings.
17. A draft batch shows the plan rail only, and says why the actual rail is absent.

### S3 Evidence / Decision Panel
18. Layers appear in the same order and colours as everywhere else.
19. `PROOF` shows the photograph, not a count — or, until A4, states plainly that files are
    stored from the evidence release onward.
20. The decision reason is quoted **verbatim**, in the actor's own words.
21. An absent SOP bound shows `—` with its source ref, never a blank.
22. The panel is deep-linkable and shareable via `?activity=`.
23. The panel offers **no action** — it answers.

### S4 Admin Today
24. Only items an Admin can actually unblock appear in band 1.
25. Every open TBD touching an active plan is listed with its ID.
26. Empty state names the next scheduled start, not "No data".

### S5 Monthly Schedule
27. The screen names **C-19, C-20, C-18 and C-35** explicitly.
28. **No token grid, no imported schedule, no mapped activity codes are rendered.**
29. The working path (`/admin/batch/new`) is offered as a link.

### S6 Batch Creation
30. `start_at` takes a **date and a time**, is mandatory, and shows the **TBD-47** marker.
31. `start_at` never pre-fills to midnight.
32. Rest durations have **no default** and carry the **TBD-21** marker.
33. Hopper mode shows Auto as **greyed and unselectable**, with the reason.
34. Load count renders with its formula: `ceil(21.0 / 2.0) = 11`.
35. The consequence rail shows the **computed** baseline, and shows a difference from
    `baselineHours` rather than hiding it.
36. The create button, when disabled, **names the missing answer**.
37. Changing a material role changes the resolved labels live, with no code path per material.

### S7 Batch Review / Activation
38. Blocking findings are listed before warnings, warnings before info.
39. Each blocking finding links to the row it concerns.
40. Activate is disabled while any blocking finding stands, and names the count.
41. The UI states that activation **freezes the baseline** before the click.
42. After activation the editor is read-only and explains why.
43. The activation failure message is rendered **verbatim** from the RPC.

### S8 My Work
44. One actionable task is visually dominant.
45. No production graph, no calendar, no other batch's activities appear.
46. A resting card shows a live countdown and, at zero, "window open — opening now" —
    **it never claims the gate is open on its own authority**.
47. Empty state names the specific thing being waited on and its remaining time.
48. Every tap target ≥48 px; body ≥15 px; numbers ≥18 px.
49. No horizontal scroll at 375 px, anywhere, in any state.

### S9 Current Activity
50. The value input is ≥28 px mono in a ≥56 px-tall target.
51. The golden rule renders **verbatim**, not paraphrased.
52. Submit stays **enabled** when evidence is outstanding; after submitting, the outstanding
    requirement is named by its label.
53. An out-of-range value is **recorded**, and the deviation is explained — the recording is
    never refused.
54. `RunningTotal` appears only on LOAD-scoped activities and describes **material**, not batch
    progress.
55. One primary action on the screen.

### S10 Evidence Capture
56. Requirements are listed **by name** with individual satisfaction — never "3 photos".
57. `capture_hint` is shown on the outstanding requirement.
58. Until A4: the list is read-only, the reason is stated, and **no affordance calls
    `mark_evidence`**.
59. A failed upload retains the local file and offers retry; it never marks the requirement met.

### S11 Control Room
60. Bands are ordered by **urgency**, not by batch.
61. Release / hold / return act **in place** in two taps, with a mandatory reason.
62. A band with no backend shows its header and a "released with B2/B5/A4" note —
    **never a zero count**.
63. One failing band does not blank the room.

### S12 Lab Queue
64. All master batches are visible, each at its own day and stage.
65. A submitted item shows `SUBMITTED` and **does not block** work on any other batch.
66. Overdue items state **what they are holding up**.
67. Bands: overdue, today, retest.

### S13 Current Sample
68. Only the parameters required by the current activity are shown.
69. Numeric and observational inputs are visually distinct; observations use enumerated controls.
70. Derived values (C:N, TDS) render in `lock` with a `derived` chip and **no input**.
71. A parameter with no spec records `no_spec` and is **never auto-failed**.
72. Where two specs disagree, **both** render side by side with the conflict ID and neither
    judges the value.
73. The submit button reads **"Submit for approval"** and **names no approver** (C-32 open).
74. A failed submit never loses entered values.

### S14 Resource View
75. No editable machine-hours field exists anywhere on the screen.
76. Straw occupancy is visually distinct from compost and equally blocking.
77. A conflict names **both** contending batches.
78. Until A5: the screen states that the current double-booking check is a ±2-day heuristic, not
    an occupancy record.

---

## C. Cross-cutting — checked once, across the whole app

79. **Five semantic colours.** Grep the codebase for colour literals: zero outside
    `theme/tokens.css`. Every semantic use maps to one of the five meanings of
    `UI_CONTROL_TOWER_SPEC §8.5`.
80. **Both themes complete.** No element inherits the wrong ground in dark. Contrast ≥4.5:1 in
    both.
81. **State never carried by colour alone** — every state has a distinct border, fill, glyph or
    label.
82. **Every number is tabular mono with a unit and a comparison.**
83. **Every empty state says what will fill it and when.** Zero occurrences of "No data".
84. **Every blocked or waiting item states its reason on its face**, never behind a hover.
85. **Every unresolved conflict affecting what is on screen is visible with its ID.**
86. **No lorem, no "Card Title", no placeholder copy** anywhere, including the gallery.
87. **Every table or wide region scrolls inside its own container**; the page body never scrolls
    horizontally at any breakpoint.
88. **`prefers-reduced-motion`** stops the in-progress pulse and makes playhead scrubbing snap.
89. **Visible keyboard focus** on every interactive element, including staircase bars and the
    playhead.
90. **One shared ticker** drives every countdown on a page — `Countdown`'s existing subscription
    model, not an interval per component.

---

## D. The end-to-end pass

The product's own target sentence, executed by a reviewer in one sitting, with no narration:

> Open MushroomOS → see the factory → click a batch → watch its 552-hour journey → see where it
> is now → understand why it is late → open the evidence → see who did it → see the lab result →
> see the deviation → see who approved continuation.

| Step | Passes when | Needs |
|---|---|---|
| see the factory | the staircase renders 3+ staggered batches from real rows | A2 |
| click a batch | `/batch/:id?h=` opens at the clicked hour | A2 |
| watch its journey | scrubbing moves graph, stream and narrative together | A2, B1 |
| where it is now | wall clock, batch hour and variance, all spoken | A2 |
| why it is late | the paragraph names the top contributors | B4 |
| open the evidence | one click from any noun reaches the photograph | A4 |
| who did it | a person and a machine are named | NOW |
| the lab result | value, spec (or `no_spec`), technician, time | B5 |
| the deviation | what triggered it, against what, still open or not | B2 |
| who approved | actor, time, reason **quoted verbatim** | B2 |

**Two of these ten steps are honest-blocked at the 48-hour mark** — the photograph (A4 must land)
and the lab result (B5). If either has not landed, the reviewer sees the stated blocked copy,
**not a substitute**. A demo that shows a placeholder image where a photograph belongs has
failed this document, not passed it.

---

## E. What automatically fails the workstream

Any one of these is a stop, regardless of everything else:

1. A batch percentage-complete anywhere in the management layer.
2. A sixth semantic colour.
3. A capture affordance that increments a counter without storing a file.
4. A zero count that means "not built".
5. An invented number, threshold, duration, approver or schedule mapping.
6. A named approver on the lab submit button while C-32 is open.
7. A time literal (`552`, `23`, `05:00`) in application code.
8. A second design system, a second application, or a role-specific fork of a shared screen.
9. A fixture containing a state the engine cannot produce.
10. Horizontal page scroll at 375 px.
