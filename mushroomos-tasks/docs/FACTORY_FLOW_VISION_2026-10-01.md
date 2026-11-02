# Factory flow — vision, what the owner's workbook shows, and the plan

Prepared 1 October 2026 from `20260217 Compost new procedure_2 (1).xlsx` (read-only), the Operations page built by Codex, and the existing code.

## 1. How the owner thinks (verified from his workbook)
- **Batches move in groups** of 3–4 (e.g. 339,340,341). A new group starts every 2 days at first, then every 3 days once groups became 4 batches. 21 groups are laid out.
- **One template for every group.** All 21 groups use the identical pattern of platform windows, counted in hours from the start of bagasse wetting
  (hour 1 = 08:00 on the start day). The whole life is **544 hours (~22.7 days)**.
- **Platforms are the scarce resource.** Six physical platforms: 1A, 1B, 2, 3, 4, 5. Hours per group: 1A 17, 3 29, 5 51, 2 42, 1B 24, 4 3. Hours with no platform are the batch resting in a bunker or tunnel.
- **Different platforms behave differently** (counted across his 21 groups):
  | Platform | Planned hours | Hours shared by 2+ groups | Most groups at once |
  |---|---|---|---|
  | 1A | 357 | 0 | 1 |
  | 2 (Turner) | 882 | 0 | 1 |
  | 4 | 63 | 0 | 1 |
  | 1B | 468 | 36 | 2 |
  | 5 | 957 | 114 | 2 |
  | **3 (bunker area)** | 394 | **138** | **3** |
  So 1A, 2 and 4 are strictly one group at a time; **platform 3 is the bottleneck**; his real skill is staggering group starts around it.
- **The 2-day cadence is not arbitrary.** The Turner platform (2) holds one group for a 34-hour T0/T1 window plus an 8-hour T2 window, so two groups started less than ~34 h apart collide there (tested).
- **The process runs on triggers, not just clocks** (Process sheet): unload at ≥58 °C *or* ≥40 h (second bunker), ≥58 °C and ≥60 h (first); reload at 72–74 °C and 28–30 h; unload to tunnel at 70 °C and 44 h; moisture targets 68–69 %, 73–75 %; tunnel 145 h; unload at 24 °C. Plans slip when temperatures do.

## 2. Where the Operations page (Codex) fits
It is a good **rear-view mirror**: observed average task times, crews, machines and fuel, a task ledger, honest about missing data. It does not know about **groups, platforms, hour-by-hour overlap, or triggers**, so it cannot answer his working question:
*"If this group slips six hours, who collides with whom, and when can I safely start the next one?"* It also mixes observed and planned times, which Codex is now separating into the Process Time SOP.

## 3. Vision — his Excel, alive
Three layers, each answering one question, kept separate so planned, forecast and actual are never confused:
1. **Standards** — *how long should each process take?* The Process Time SOP (Codex): factory-wide planned durations.
2. **Flow** — *who needs which platform when, and what collides?* **Factory flow** (built now): his template placed from real group starts, moved by real slips, with conflicts and a "when can I start the next group?" planner.
3. **Reality** — *what actually happened?* Operations and the Director brief: actual times, crews, machines, materials, exceptions.

## 4. Built now (read-only, isolated, not linked, not released)
`app/www/flow.html · flow.css · flow.js · flow-model.js`, 14 unit tests (`tests/flow.test.cjs`).
- Six platform lanes on a timeline; each group's windows from its recorded start (`h0` = start of bagasse wetting = his hour 1).
- **Forecast**: windows move later by the group's current slip (median start delay of its last three finished tasks), and any group's slip can be overridden to ask "what if".
- **Conflicts**: where a platform holds more groups than its capacity. Capacities are *inferred from his own plan* (most groups ever on a platform) and editable.
- **Plan the next group**: earliest start (whole hours) at which no platform exceeds capacity, with a timeline preview of any chosen start and the exact collisions it would create.
- **Validated against his sheet**: replaying his 21 real group starts through the model reproduces his loads exactly (1A/2/4 never shared; 5 and 1B reach 2; platform 3 reaches 3) and shows zero conflicts at the inferred capacities.

## 5. Roadmap
| Phase | What | Needs |
|---|---|---|
| 1 ✔ | Factory flow board + planner on his template | nothing new (done) |
| 2 | **Platform register**: platforms and capacities in the database; each stage/task knows its platform, so occupancy becomes *recorded* not inferred | owner confirms capacities and the stage-to-platform mapping; one additive migration |
| 3 | **Standards drive the template**: window lengths come from the Process Time SOP instead of the fixed Excel hours; "plan next group" can pre-fill a draft batch start | Codex's Process Time SOP live |
| 4 | **Triggers**: record bunker/tunnel temperature, time and moisture at the decision points and show "unload due in 3 h / trigger met", with alerts to the floor | how/where readings are taken; a small capture form |
| 5 | **Bunker and tunnel register** (up to three of each per batch) and their occupancy; resource conflicts alongside platforms | real IDs and capacities |
| 6 | **Forecast learning**: per-stage slip from history, with ranges instead of a single shift | enough recorded history |

## 6. Questions only the owner can answer
1. What can each platform really hold at once? (We assumed what his plan did: 1A, 2, 4 = 1; 1B, 5 = 2; 3 = 3.)
2. The workbook uses six colours for the hour cells. What does each colour mean? (Not in the file.)
3. Are the stage names we matched to each window right? (Matched by order and duration from the Process sheet.)
4. Why 3 days between groups of 4 batches but 2 days for 3? Is cadence a rule or a choice?
5. Which readings decide a trigger today (who measures temperature, how often), and where should they be recorded?
6. How many bunkers and tunnels exist, and how are they named?

## 7. Honesty rules
Planned ≠ forecast ≠ actual. A platform window is *planned need*, never a detection. Unknown slip stays unknown. Nothing here writes data. Stage names and capacities are marked as inferred until confirmed.
