# 03 · The standard process (PROCESS-2026J) — H0 to H476

Generated from the live process definition on 15 Sep 2026. 113 tasks: 64 supervisor tasks, 8 holds, 41 Lab checks.

Hours are the **day plan**: planned start → end counted from H0 (upper SOP durations). A running batch that is
onboarded plans forward from the moment of onboarding instead.

## Stages at a glance

| Hours | Stage | What happens |
|---|---|---|
| H0–H136 | Bagasse | Weighment, 1st hopper pass (3 h) → rest 8 h → 2nd pass 3 h → heap 12 h → bunker filling 2 h → rest ≥58 °C AND 60 h → unload/reload 5 h → rest ≥58 °C OR 40 h → unload with moisture decision 3 h |
| H70–H160 | Paddy (in parallel) | Weighment/cutting 12 h → soaking 22 / 28 / 24 h → 2 equal piles 4 h |
| H130–H136 | Chicken manure | CM + gypsum + AS weighment 2 h → dry mix 4 h |
| H136–H170 | Mixing and yard | Add CM mix 8 h → water hopper pass 3 h → new hopper pass 3 h (bunker preparation + cleaning) → rest 10 h → add onto paddy piles 2 h → flipping 8 h |
| H170–H194.5 | Turner | 6 piles: T0 → 6 h rest → T1 → 8 h rest → T2 → T3 (1.5 h each, machine M1/M2) |
| H190–H320 | Bunkers | 3 bunkers: fill 2 h → Holding 1 (≥73 °C AND 63 h) → unload & reload 2 h → Holding 2 (≥70 °C AND 60 h) |
| H308–H476 | Tunnel | Preparation 8 h → filling from bunkers 1–3 → levelling 14 h → heating 12 h → pasteurization 8 h → cooling 14 h → conditioning 85 h → cooling 14 h → unloading to grow rooms 1–3 |

## Rules applied to every task

- **Order** — a task opens only when the tasks in "Opens when" are done.
- **Time** — on a real batch the after photo and Finish wait for the SOP time from Start; the before photo must be taken within 30 min of Start.
- **Late** — due at the day-plan end + granted ticket hours + 30 min grace; after that the after photo and Finish are blocked until Admin approves a late ticket. Granted hours move every later step.
- **Holds** — nobody starts them; they begin when the step before finishes and are confirmed on their condition.
- **Lab checks** — open with their field step (after it finished / before it starts / when it starts). A locked check takes no sample or photo.
- **DEMO / TEST batches** — same rules except time: no time gates, rests or late blocks.

## Every task

| Planned | Day | Who | Task | Code | Opens when | Can be finished when | Records |
|---|---|---|---|---|---|---|---|
| H0 | 0 | Supervisor | New bagasse weighment | `FIB-WEIGH` | At start (no step before it) | no SOP duration | 📷 Before photo + After photo |
| H0–3 | 0 | Supervisor | Wetting — 1st hopper pass | `FIB-WET-1` | At start (no step before it) | after photo + Finish from 3 h after Start | 📷 Before photo + After photo<br>Moisture [69–71 %] |
| H0 | 0 | Lab | Raw material / bagasse weighment | `LAB-RM-01` | At start (no step before it) | All readings + photos, then submit (GM decides) | 📷 Lot photograph + Weighment slip<br>Readings: moisture_pct, ph, dry_weight |
| H3–11 | 0 | Hold | Rest | `FIB-REST-1` | Wetting — 1st hopper pass finished | after 8 h | — |
| H3 | 0 | Lab | Bagasse wetting — first hopper pass | `LAB-WET-01` | Wetting — 1st hopper pass finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, ec |
| H11–14 | 0 | Supervisor | 2nd hopper pass | `FIB-HOP-2` | Rest finished | after photo + Finish from 3 h after Start | 📷 Before photo + After photo<br>Moisture [reach target moisture %] |
| H14–26 | 0 | Supervisor | Heap formation + resting | `FIB-HEAP` | 2nd hopper pass finished | after photo + Finish from 12 h after Start | 📷 Before photo + After photo<br>Heap formation (height ≤1.5mts); resting; Heap height [≤1.5 m] |
| H14 | 0 | Lab | Second hopper pass | `LAB-WET-02` | 2nd hopper pass finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, ec |
| H26–28 | 1 | Supervisor | Flipping + bunker filling | `FIB-BUNK-LOAD` | Heap formation + resting finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo<br>Flipping; bunker filling (ht 2.6-2.7mts) without water; Fill height [2.6–2.7 m] |
| H26 | 1 | Lab | Before first bunker loading | `LAB-BNK-PRE` | Heap formation + resting finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, ec |
| H28–88 | 1 | Hold | Resting period — unloading trigger | `FIB-COND-1` | Flipping + bunker filling finished | 60 h AND temperature ≥ 58 °C | Temperature at confirmation [unload trigger ≥58 °C AND ≥60 h °C] |
| H70–82 | 2 | Supervisor | Paddy bales weighment + cutting + threads removal | `STR-WEIGH` | At start (no step before it) | after photo + Finish from 12 h after Start | 📷 Before photo + After photo<br>paddy bales weighment; cutting; threads removal |
| H70 | 2 | Lab | Paddy weighment | `LAB-PDY-WGH` | Paddy bales weighment + cutting + threads removal has started | All readings + photos, then submit (GM decides) | 📷 Weighment slip<br>Readings: moisture_pct, dry_weight |
| H82–104 | 3 | Supervisor | Soaking 1 | `STR-SOAK-1` | Paddy bales weighment + cutting + threads removal finished | after photo + Finish from 22 h after Start | 📷 Before photo + After photo<br>Pushing in; Tilting 1; Tilting 2; Pushing out(8-10 hours); Resting in bunkers(10-12hrs) |
| H82 | 3 | Lab | Paddy soak 1 — pit water | `LAB-PDY-S1` | Soaking 1 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: ph, ec, tds |
| H88–93 | 3 | Supervisor | Unloading, flipping, reloading to new bunker | `FIB-RELOAD-1` | Resting period — unloading trigger finished | after photo + Finish from 5 h after Start | 📷 Before photo + After photo<br>Temperature [45–58 °C]; Fill height [2.2–2.4 m] |
| H88 | 3 | Lab | Before hopper pass | `LAB-HOP-PRE` | Resting period — unloading trigger finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, ec |
| H88 | 3 | Lab | Reloading to new bunker | `LAB-RLD-01` | Unloading, flipping, reloading to new bunker has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, ec |
| H88 | 3 | Lab | Bunker unloading | `LAB-UNL-01` | Unloading, flipping, reloading to new bunker has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, ec |
| H93–133 | 3 | Hold | Rest — start unloading at trigger | `FIB-COND-2` | Unloading, flipping, reloading to new bunker finished | temperature ≥ 58 °C OR 40 h | Temperature at confirmation [trigger ≥58 °C OR ≥40 h °C] |
| H104–132 | 4 | Supervisor | Soaking 2 | `STR-SOAK-2` | Soaking 1 finished | after photo + Finish from 28 h after Start | 📷 Before photo + After photo<br>Pushing in; Tilting 1; Tilting 2; Pushing out(8-10 hours); Resting in bunkers(18hrs) |
| H104 | 4 | Lab | Paddy soak 2 — pit water | `LAB-PDY-S2` | Soaking 2 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: ph, ec, tds |
| H130–132 | 5 | Supervisor | CM + gypsum + AS weighment | `CM-WEIGH` | At start (no step before it) | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H130 | 5 | Lab | Chicken manure — on arrival | `LAB-CM-ARR` | CM + gypsum + AS weighment has started | All readings + photos, then submit (GM decides) | 📷 Lot photograph<br>Readings: moisture_pct, ph, n_pct, ash_pct |
| H132–136 | 5 | Supervisor | Dry mix + rotavator | `CM-DRYMIX` | CM + gypsum + AS weighment finished | after photo + Finish from 4 h after Start | 📷 Before photo + After photo<br>Dry mix; use Rotovator for breaking manure lumps |
| H132–156 | 5 | Supervisor | Soaking 3 | `STR-SOAK-3` | Soaking 2 finished | after photo + Finish from 24 h after Start | 📷 Before photo + After photo<br>Pushing in; Tilting 1; Tilting 2; Pushing out(8-10 hours); Resting in bunkers(12-14hrs) |
| H132 | 5 | Lab | Paddy soak 3 — pit water | `LAB-PDY-S3` | Soaking 3 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: ph, ec, tds |
| H133–136 | 5 | Supervisor | Unload with moisture decision | `FIB-MOIST-DEC` | Rest — start unloading at trigger finished | after photo + Finish from 3 h after Start | 📷 Before photo + After photo<br>Moisture [≥68 proceed / <67 controlled mist with hopper %] |
| H133 | 5 | Lab | Moisture decision point | `LAB-MOIST-DEC` | Unload with moisture decision has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H136–144 | 5 | Supervisor | Add CM mix + loader mixing + flipping 1 + flipping 2 | `MIX-CM-ADD` | Dry mix + rotavator + Unload with moisture decision finished; GM approved its Lab check | after photo + Finish from 8 h after Start | 📷 Before photo + After photo<br>Add Chicken Manure(CM) Mix on conditioned bagasse; Loader mixing; Flipping 1; Flipping 2 BACK TO BACK |
| H136 | 5 | Lab | Chicken manure — before use in mixing | `LAB-CM-USE` | Dry mix + rotavator + Unload with moisture decision finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph, n_pct, ash_pct |
| H144–147 | 6 | Supervisor | Water hopper pass | `MIX-HOP-WATER` | Add CM mix + loader mixing + flipping 1 + flipping 2 finished | after photo + Finish from 3 h after Start | 📷 Before photo + After photo<br>Moisture [73 %]; Temperature [<45–50 °C] |
| H147–150 | 6 | Supervisor | New hopper pass | `MIX-HOP-NEW` | Water hopper pass finished | after photo + Finish from 3 h after Start | 📷 Before photo + After photo<br>Bunker preparation; Bunker cleaning |
| H150–160 | 6 | Hold | Rest — 10 hours | `MIX-HOP-REST` | New hopper pass finished | after 10 h | — |
| H156–160 | 6 | Supervisor | Preparation of 2 equal piles on platform | `STR-PILES` | Soaking 3 finished | after photo + Finish from 4 h after Start | 📷 Before photo + After photo |
| H160–162 | 6 | Supervisor | Add bagasse + CM mix onto 2 paddy piles | `YARD-ADD` | Rest — 10 hours + Preparation of 2 equal piles on platform finished | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H162–170 | 6 | Supervisor | Flipping 1 + flipping 2 back to back | `YARD-FLIP` | Add bagasse + CM mix onto 2 paddy piles finished | after photo + Finish from 8 h after Start | 📷 Before photo + After photo<br>Flipping 1; Flipping 2 BACK TO BACK |
| H170–171.5 | 7 | Supervisor | Turner T0 — pile 1 | `TRN-P1-T0` | Flipping 1 + flipping 2 back to back finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H170–171.5 | 7 | Supervisor | Turner T0 — pile 3 | `TRN-P3-T0` | Flipping 1 + flipping 2 back to back finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H170 | 7 | Lab | Pre-Turner check | `LAB-PRE-T` | Flipping 1 + flipping 2 back to back finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct, ph |
| H171.5–173 | 7 | Supervisor | Turner T0 — pile 2 | `TRN-P2-T0` | Flipping 1 + flipping 2 back to back finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H171.5–173 | 7 | Supervisor | Turner T0 — pile 4 | `TRN-P4-T0` | Flipping 1 + flipping 2 back to back finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H173–174.5 | 7 | Supervisor | Turner T0 — pile 5 | `TRN-P5-T0` | Flipping 1 + flipping 2 back to back finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H174.5–176 | 7 | Supervisor | Turner T0 — pile 6 | `TRN-P6-T0` | Flipping 1 + flipping 2 back to back finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H177.5–179 | 7 | Supervisor | Turner T1 — pile 1 | `TRN-P1-T1` | Turner T0 — pile 1 finished, then 6 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H177.5–179 | 7 | Supervisor | Turner T1 — pile 3 | `TRN-P3-T1` | Turner T0 — pile 3 finished, then 6 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H177.5 | 7 | Lab | Moisture before T1 — pile 1 | `LAB-T1-PRE-P1` | Turner T0 — pile 1 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H177.5 | 7 | Lab | Moisture before T1 — pile 3 | `LAB-T1-PRE-P3` | Turner T0 — pile 3 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H179–180.5 | 7 | Supervisor | Turner T1 — pile 2 | `TRN-P2-T1` | Turner T0 — pile 2 finished, then 6 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H179–180.5 | 7 | Supervisor | Turner T1 — pile 4 | `TRN-P4-T1` | Turner T0 — pile 4 finished, then 6 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H179 | 7 | Lab | Moisture after T1 — pile 1 | `LAB-T1-POST-P1` | Turner T1 — pile 1 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H179 | 7 | Lab | Moisture after T1 — pile 3 | `LAB-T1-POST-P3` | Turner T1 — pile 3 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H179 | 7 | Lab | Moisture before T1 — pile 2 | `LAB-T1-PRE-P2` | Turner T0 — pile 2 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H179 | 7 | Lab | Moisture before T1 — pile 4 | `LAB-T1-PRE-P4` | Turner T0 — pile 4 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H180.5–182 | 7 | Supervisor | Turner T1 — pile 5 | `TRN-P5-T1` | Turner T0 — pile 5 finished, then 6 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H180.5 | 7 | Lab | Moisture after T1 — pile 2 | `LAB-T1-POST-P2` | Turner T1 — pile 2 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H180.5 | 7 | Lab | Moisture after T1 — pile 4 | `LAB-T1-POST-P4` | Turner T1 — pile 4 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H180.5 | 7 | Lab | Moisture before T1 — pile 5 | `LAB-T1-PRE-P5` | Turner T0 — pile 5 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H182–183.5 | 7 | Supervisor | Turner T1 — pile 6 | `TRN-P6-T1` | Turner T0 — pile 6 finished, then 6 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H182 | 7 | Lab | Moisture after T1 — pile 5 | `LAB-T1-POST-P5` | Turner T1 — pile 5 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H182 | 7 | Lab | Moisture before T1 — pile 6 | `LAB-T1-PRE-P6` | Turner T0 — pile 6 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H183.5 | 7 | Lab | Moisture after T1 — pile 6 | `LAB-T1-POST-P6` | Turner T1 — pile 6 finished | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: moisture_pct |
| H187–188.5 | 7 | Supervisor | Turner T2 — pile 1 | `TRN-P1-T2` | Turner T1 — pile 1 finished, then 8 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H187–188.5 | 7 | Supervisor | Turner T2 — pile 3 | `TRN-P3-T2` | Turner T1 — pile 3 finished, then 8 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H188.5–190 | 7 | Supervisor | Turner T3 — pile 1 | `TRN-P1-T3` | Turner T2 — pile 1 finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H188.5–190 | 7 | Supervisor | Turner T2 — pile 2 | `TRN-P2-T2` | Turner T1 — pile 2 finished, then 8 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H188.5–190 | 7 | Supervisor | Turner T3 — pile 3 | `TRN-P3-T3` | Turner T2 — pile 3 finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H188.5–190 | 7 | Supervisor | Turner T2 — pile 4 | `TRN-P4-T2` | Turner T1 — pile 4 finished, then 8 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H190–192 | 7 | Supervisor | Bunker filling — bunker 1 | `BNK-B1-FILL` | Turner T3 — pile 1 finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo<br>Fill height [2.6–2.7 m] |
| H190–192 | 7 | Supervisor | Bunker filling — bunker 2 | `BNK-B2-FILL` | Turner T3 — pile 3 finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo<br>Fill height [2.6–2.7 m] |
| H190–191.5 | 7 | Supervisor | Turner T3 — pile 2 | `TRN-P2-T3` | Turner T2 — pile 2 finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H190–191.5 | 7 | Supervisor | Turner T3 — pile 4 | `TRN-P4-T3` | Turner T2 — pile 4 finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H190–191.5 | 7 | Supervisor | Turner T2 — pile 5 | `TRN-P5-T2` | Turner T1 — pile 5 finished, then 8 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H190 | 7 | Lab | Bunker loading — bunker 1 | `LAB-BNK-LOAD-B1` | Turner T3 — pile 1 finished | All readings + photos, then submit (GM decides) | 📷 Before photograph + Height photograph<br>Readings: bunker_height, ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H190 | 7 | Lab | Bunker loading — bunker 2 | `LAB-BNK-LOAD-B2` | Turner T3 — pile 3 finished | All readings + photos, then submit (GM decides) | 📷 Before photograph + Height photograph<br>Readings: bunker_height, ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H191.5–193 | 7 | Supervisor | Turner T3 — pile 5 | `TRN-P5-T3` | Turner T2 — pile 5 finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H191.5–193 | 7 | Supervisor | Turner T2 — pile 6 | `TRN-P6-T2` | Turner T1 — pile 6 finished, then 8 h rest | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H192–255 | 8 | Hold | Holding 1 — reload trigger — bunker 1 | `BNK-B1-HOLD-1` | Bunker filling — bunker 1 finished | 63 h AND temperature ≥ 73 °C | Temperature at confirmation [reload trigger 73–74 °C + 48+ h °C] |
| H192–255 | 8 | Hold | Holding 1 — reload trigger — bunker 2 | `BNK-B2-HOLD-1` | Bunker filling — bunker 2 finished | 63 h AND temperature ≥ 73 °C | Temperature at confirmation [reload trigger 73–74 °C + 48+ h °C] |
| H193–195 | 8 | Supervisor | Bunker filling — bunker 3 | `BNK-B3-FILL` | Turner T3 — pile 5 finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo<br>Fill height [2.6–2.7 m] |
| H193–194.5 | 8 | Supervisor | Turner T3 — pile 6 | `TRN-P6-T3` | Turner T2 — pile 6 finished | after photo + Finish from 1.5 h after Start | 📷 Before photo + After photo<br>Turner machine used [M1/M2] |
| H193 | 8 | Lab | Bunker loading — bunker 3 | `LAB-BNK-LOAD-B3` | Turner T3 — pile 5 finished | All readings + photos, then submit (GM decides) | 📷 Before photograph + Height photograph<br>Readings: bunker_height, ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H195–258 | 8 | Hold | Holding 1 — reload trigger — bunker 3 | `BNK-B3-HOLD-1` | Bunker filling — bunker 3 finished | 63 h AND temperature ≥ 73 °C | Temperature at confirmation [reload trigger 73–74 °C + 48+ h °C] |
| H255–257 | 10 | Supervisor | Unload & reload 1 — bunker 1 | `BNK-B1-RELOAD` | Holding 1 — reload trigger — bunker 1 finished | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H255–257 | 10 | Supervisor | Unload & reload 1 — bunker 2 | `BNK-B2-RELOAD` | Holding 1 — reload trigger — bunker 2 finished | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H255 | 10 | Lab | Bunker reloading — reload 1 — bunker 1 | `LAB-RLD-RE-B1` | Unload & reload 1 — bunker 1 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H255 | 10 | Lab | Bunker reloading — reload 1 — bunker 2 | `LAB-RLD-RE-B2` | Unload & reload 1 — bunker 2 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H255 | 10 | Lab | Bunker unloading — reload 1 — bunker 1 | `LAB-RLD-UNL-B1` | Unload & reload 1 — bunker 1 has started | All readings + photos, then submit (GM decides) | 📷 Height photograph<br>Readings: shrunken_height, moisture_pct |
| H255 | 10 | Lab | Bunker unloading — reload 1 — bunker 2 | `LAB-RLD-UNL-B2` | Unload & reload 1 — bunker 2 has started | All readings + photos, then submit (GM decides) | 📷 Height photograph<br>Readings: shrunken_height, moisture_pct |
| H257–317 | 10 | Hold | Holding 2 — unload trigger — bunker 1 | `BNK-B1-HOLD-2` | Unload & reload 1 — bunker 1 finished | 60 h AND temperature ≥ 70 °C | Temperature at confirmation [unload trigger 70 °C + 36+ h °C] |
| H257–317 | 10 | Hold | Holding 2 — unload trigger — bunker 2 | `BNK-B2-HOLD-2` | Unload & reload 1 — bunker 2 finished | 60 h AND temperature ≥ 70 °C | Temperature at confirmation [unload trigger 70 °C + 36+ h °C] |
| H258–260 | 10 | Supervisor | Unload & reload 1 — bunker 3 | `BNK-B3-RELOAD` | Holding 1 — reload trigger — bunker 3 finished | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H258 | 10 | Lab | Bunker reloading — reload 1 — bunker 3 | `LAB-RLD-RE-B3` | Unload & reload 1 — bunker 3 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H258 | 10 | Lab | Bunker unloading — reload 1 — bunker 3 | `LAB-RLD-UNL-B3` | Unload & reload 1 — bunker 3 has started | All readings + photos, then submit (GM decides) | 📷 Height photograph<br>Readings: shrunken_height, moisture_pct |
| H260–320 | 10 | Hold | Holding 2 — unload trigger — bunker 3 | `BNK-B3-HOLD-2` | Unload & reload 1 — bunker 3 finished | 60 h AND temperature ≥ 70 °C | Temperature at confirmation [unload trigger 70 °C + 36+ h °C] |
| H308–316 | 12 | Supervisor | Tunnel preparation | `TN-PREP` | At start (no step before it) | after photo + Finish from 8 h after Start | 📷 Before photo + After photo<br>After tunnel wash; gliding net should be tight fix to the total grid area; Clean and dry probes & hang probably |
| H317–319 | 13 | Supervisor | Tunnel filling — bunker 1 | `BNK-B1-TUN-LOAD` | Holding 2 — unload trigger — bunker 1 + Tunnel preparation finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H317 | 13 | Lab | Tunnel loading — bunker 1 | `LAB-TUN-LOAD-B1` | Holding 2 — unload trigger — bunker 1 + Tunnel preparation finished | All readings + photos, then submit (GM decides) | 📷 Before photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H317 | 13 | Lab | Tunnel readiness | `LAB-TUN-PRE` | Holding 2 — unload trigger — bunker 1 + Tunnel preparation finished | All readings + photos, then submit (GM decides) | 📷 Tunnel photograph<br>Readings: tunnel_height |
| H319–321 | 13 | Supervisor | Tunnel filling — bunker 2 | `BNK-B2-TUN-LOAD` | Holding 2 — unload trigger — bunker 2 + Tunnel preparation + Tunnel filling — bunker 1 finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H319 | 13 | Lab | Tunnel loading — bunker 2 | `LAB-TUN-LOAD-B2` | Holding 2 — unload trigger — bunker 2 + Tunnel preparation + Tunnel filling — bunker 1 finished | All readings + photos, then submit (GM decides) | 📷 Before photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H321–323 | 13 | Supervisor | Tunnel filling — bunker 3 | `BNK-B3-TUN-LOAD` | Holding 2 — unload trigger — bunker 3 + Tunnel preparation + Tunnel filling — bunker 2 finished; GM approved its Lab check | after photo + Finish from 2 h after Start | 📷 Before photo + After photo |
| H321 | 13 | Lab | Tunnel loading — bunker 3 | `LAB-TUN-LOAD-B3` | Holding 2 — unload trigger — bunker 3 + Tunnel preparation + Tunnel filling — bunker 2 finished | All readings + photos, then submit (GM decides) | 📷 Before photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, smell, colour, spring |
| H323–337 | 13 | Supervisor | Levelling & conditioning | `TN-LEVEL` | Tunnel filling — bunker 3 finished | after photo + Finish from 14 h after Start | 📷 Before photo + After photo |
| H337–349 | 14 | Hold | Heating up | `TN-HEAT` | Levelling & conditioning finished | after 12 h | — |
| H349–357 | 14 | Hold | Pasteurization | `TN-PAST` | Heating up finished | after 8 h | — |
| H357–371 | 14 | Hold | Cooling down 1 | `TN-COOL-1` | Pasteurization finished | after 14 h | — |
| H371–456 | 15 | Hold | Conditioning 2 | `TN-COND-2` | Cooling down 1 finished | after 85 h | — |
| H456–470 | 19 | Hold | Start cooling down 2 | `TN-COOL-2` | Conditioning 2 finished | after 14 h | — |
| H470–472 | 19 | Supervisor | Tunnel unloading / grow-room loading — stream 1 | `TUN-DISCHARGE-1` | Start cooling down 2 finished | no SOP duration | 📷 Before photo + After photo<br>Temperature [start unloading at 24 °C] |
| H470 | 19 | Lab | Final QC — tunnel unloading | `LAB-QC-FINAL` | Tunnel unloading / grow-room loading — stream 1 has started | All readings + photos, then submit (GM decides) | 📷 Sample photograph + After photograph<br>Readings: ph, ec, moisture_pct, n_pct, ash_pct, cn_ratio, shrunken_height, actinomycetes, smell, colour, spring |
| H472–474 | 19 | Supervisor | Tunnel unloading / grow-room loading — stream 2 | `TUN-DISCHARGE-2` | Tunnel unloading / grow-room loading — stream 1 finished | no SOP duration | 📷 Before photo + After photo<br>Temperature [start unloading at 24 °C] |
| H474–476 | 19 | Supervisor | Tunnel unloading / grow-room loading — stream 3 | `TUN-DISCHARGE-3` | Tunnel unloading / grow-room loading — stream 2 finished | no SOP duration | 📷 Before photo + After photo<br>Temperature [start unloading at 24 °C] |
