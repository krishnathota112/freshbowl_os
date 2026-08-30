# SOURCE INVENTORY

Every claim in the other documents cites a source ID from this table.
Nothing in this rebuild is "remembered" — it is either cited, inferred from a cited
source (and labelled), a product decision (and labelled), or a TBD.

## S1 — Process SOP (authoritative for operator targets)

| ID | File | What it actually contains |
|----|------|---------------------------|
| S1a | `mails/compost process flow diagrams.docx` | **18 SmartArt flow diagrams**, one per stage, each with target values, durations and unload/reload triggers. Stage set: 0A, 0B, 0C, 0D, 1A, 1B, 1C-A, 1C-B, Phase-1A, 1B, 1C, 1D-A, 1D-B, Phase-2A, 2B, 2C, 2D. Each carries a "SUPERVISOR GOLDEN RULE" line. **The richest SOP artefact in the repo.** |
| S1b | `mails/Compost process flow diagrams_v1.docx` | Earlier revision. Different stage decomposition (0C+0D merged, Phase-1 T0/T1 split differently, Phase-2 collapsed to one overview). Superseded by S1a. |
| S1c | `mails/User Guidline for Composting.docx` | Composting theory + **hour-banded Phase-2 control tables** (0–14h, 15–28h, 29–40h, 41–54h, 55–102h, 103–142h, 143–150h) giving, per band and per probe (Tunnel Top / Compost / Plenum): observed value → likely outcome → corrective action → expected result. Also a Phase-1 monitoring table (temp / moisture / N / pH bands). |

Note: the diagram content is stored as DrawingML SmartArt (`word/diagrams/data*.xml`), **not**
as body text and **not** as images. Tooling that reads these files normally sees only the
titles. That is almost certainly why the previous build captured so little of the SOP.

## S2 — Master Batch record (authoritative for record structure)

| ID | File | Contains |
|----|------|----------|
| S2a | `mails/Master batch report.docx` | **The blank Master Batch Record template.** Sections 0 / 1A / 1B / 2 / 3A / 3B / 4 plus an 80-hour tunnel log grid. This is the paper form MushroomOS replaces. |
| S2b | `mails/Master Batch Information.docx` | A *second, different* blank template: Raw Material Register, Stage-0 Operations by day −6…−1, Phase-1 Record by day 0…10, Phase-2 monitoring, Phase-2 Out & Room Preference (incl. Spawn Date, Yield). Conflicts with S2a on cadence — see SOURCE_CONFLICTS. |
| S2c | `mails/Master Batch Information pdf.pdf` | PDF rendering of S2b. |

## S3 — Real executed batch records (authoritative for variation)

| ID | File | Master batch | Individual batches | Rooms declared | Bunker lines | Tunnels |
|----|------|--------------|--------------------|----------------|--------------|---------|
| S3a | `Batch No 366,367,368.docx` | 366–368 | 3 | **4** (conflict) | 2 | 3 |
| S3b | `Batch No 372,373,374.docx` | 372–374 | 3 | 3 | 2 | 3 |
| S3c | `Batch No 381,382,383.docx` | 381–383 | 3 | — | — | — |
| S3d | `Batch No 384,385,386.docx` | 384–386 | 3 | — | — | — |
| S3e | `Batch No 387,388,389,390.docx` | 387–390 | 4 | — | — | — |
| S3f | `Batch No 391,392,393,394.docx` | 391–394 | 4 | 4 | 3 | 4 |

Each of these also carries a hand-written **technical analysis narrative**: raw-material verdict →
stage-0 → phase-1 → phase-2 entry → phase-2 process → compost-out QC → core diagnosis →
expected growing-room behaviour → air-velocity sensitivity → final verdict. That narrative is the
actual management artefact this system should eventually produce automatically.

## S4 — Laboratory

| ID | File | Contains |
|----|------|----------|
| S4a | `mails/Compost lab manual.docx` / `.pdf` | 8 test methods (Moisture, pH, Ash, Nitrogen/Kjeldahl, C:N, EC, TDS, Total Hardness) with apparatus, reagents, procedure, calculation, calibration cadence. **Plus 5 acceptance-range tables**: raw materials, compost phases, water types, casing soil, spawn. |
| S4b | `mails/COMPOST LAB NEW  (USE THIS).xlsx` — sheet `Batch Summary` | The live lab dataset. 158 columns × ~230 rows, **4 rows per master batch**. Column groups: raw-material %/qty/N/Ash/Moisture/fresh-weight → Bagasse B-L & R-L → Lagoon (3 soaks × before/after × pH/EC/TDS) → F-3 MC → T0 MC → Bunker Filling → Bunker Reload-1 → Bunker Reload-2 → Tunnel Load + 6 tunnel stage timings → GR Loading → Harvest (3 breaks, room total, days). |
| S4c | same file — sheet `Compost Quantity Summary` | Quantity reconciliation per batch. |
| S4d | `COMPOST LAB NEW  (USE THIS)_1.xlsx` | Duplicate of S4b. |

**S4b is the definitive list of every lab measurement point in the process.** The lab model is
derived from its column headers, not invented.

## S5 — Formulation history

| ID | File | Contains |
|----|------|----------|
| S5a | `mails/Batch Formulations & Chemical Composition  Original.xlsx` — sheet `Fixed Formulations` | ~790 rows: one formulation block per master batch group from 267,268,269 onward. Per material: %, Quantity(t), N%, Total N2, Ash%, Total Ash; plus computed batch N%, Ash%, **C:N ratio**. Second half of each block gives the material assay (pH, Moisture%, Ash%, N%). |
| S5b | same file — sheets `pH`, `draft`, `Trails`, `Sheet1` | Working sheets; `Trails` holds trial formulations. |

## S6 — Schedule

| ID | File | Contains |
|----|------|----------|
| S6a | `T:\June'2026 Schedule.xlsx` | 10 monthly sheets. Grid = **rows: calendar dates; columns: master batch groups** (header = the individual batch numbers, e.g. `392 393 394 395`). Cell = the scheduled activity token for that batch on that date. Current vocabulary (sheets `March-April'26`, `May'26`) is a stable 17-token set; older sheets use different, evolving vocabularies. |

## S7 — Physical movement log

| ID | File | Contains |
|----|------|----------|
| S7a | `mails/BATCH PHASE MOVEMENT UPDATED.xlsx` | Per master batch, **3–5 physical lines**, each with Bunker No + date + **time** at Bunker Filling, Reload-1, Reload-2; then Tunnel No + date + time at Tunnel Loading; then Tunnel Out (est date, actual date, time) and Harvest Estimate Date. Shows real messiness: skipped Reload-2, a line splitting into two bunkers, blank timings. |

## S8 — Existing application (reference only, not a specification)

| ID | Path | Contains |
|----|------|----------|
| S8a | `MushroomOS-debug.apk` / `apk_extracted/` | Capacitor (WebView) Android wrapper. |
| S8b | `apk_extracted/assets/public/*.html` | 17 hard-coded stage screens + home, login, workflow, planning, records, approvals, notifications, users, admin_dashboard, profile. |
| S8c | `.../sop-spec.js` | `SOP_SPEC` — per-stage mandatory field lists (transcribed from an old `firestore.rules`); `SOP_TARGETS` — 13 threshold constants. Documented in-file as *advisory only, never blocks submission*. |
| S8d | `.../auth.js` | Supabase GoTrue sign-in **with a hard-coded local fallback account table** (4 accounts, unsalted sha256). Roles present: `operator`, `admin`, `chairman` — only 3. Project `omsxtifyzlldaxkeqerx.supabase.co`. |
| S8e | `.../app.js` | All state in `localStorage`: `mushroomos.completed.<stage>`, `mushroomos.override.<page>`, draft autosave, a client-side 17-stage linear `STAGE_ORDER`, and a `TIME_SCALE = 3600` demo accelerator. |

### What S8 tells us — the rebuild rationale, one line each

1. **There is no batch.** Nothing is scoped to a master batch, individual batch, bunker or tunnel. `mushroomos.completed.stage_0A` is a global key.
2. **There is no server.** Every value lives in the browser. Clearing app data destroys the production record.
3. **There is no lab.** Zero lab entities; measurements are plain number inputs on operator screens.
4. **Progression is a linked list, not process state.** `currentStage()` = "first stage with no localStorage key". Nothing can be blocked, waiting, returned, or superseded.
5. **Nothing is enforced.** `SOP_TARGETS` is advisory by design; `requireRole` is documented in its own comments as "NOT a security boundary".
6. **Only 3 roles.** No supervisor, no lab technician, no manager. Approvals route to a "chairman" viewer.
7. **The SOP was lost in transit.** `SOP_SPEC` captures ~90 field names; S1a carries ~110 targets, triggers, durations and decision branches. The richest source was never read, because it is SmartArt.
