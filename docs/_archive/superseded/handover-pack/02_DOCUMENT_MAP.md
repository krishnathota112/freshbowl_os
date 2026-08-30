> **ARCHIVED — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/00-START-HERE.md`

# 02 · Document map — what is authoritative, and what is history

**Read this before reading anything else in this repository.**

Updated 30 August 2026.

---

## The problem this file solves

Measured on 30 August 2026, the repository root held **15 markdown files, 10,193 lines, 252 KB**.

**Every one of them described the 552-hour process. None mentioned 470.**

Several were pasted conversation rather than specification — opening lines included *"Yes. This is
finally coherent."*, *"You're right. That diagram was way too compressed."* and *"This plan is much
closer, but I would not let Antigravity…"*.

`docs/` held roughly forty more files and twenty-two agent reports, mostly describing superseded
models.

An agent told to "read the repository" would reconstruct the 552-hour process, because that is what
the overwhelming majority of the words in the repository said. Nothing is wrong with any of those
documents as a record — they are wrong only as an instruction, and they were sitting where
instructions live.

**Nothing has been deleted.** Everything moved under `docs/_archive/`, keeping its git history.

---

## Authoritative — these define the system

| Document | What it is |
|---|---|
| `docs/MushroomOS_Process_Standard_470H.docx` | **The process.** PROCESS-2026C v1: the 470-hour standard, hour by hour, with the laboratory workflow and a worked example. Supersedes every earlier process description. |
| `docs/MushroomOS_Technical_PRD_Architecture.docx` | **The system.** What exists, the database contract, the plan, the screens, the payload contract per screen. |
| `docs/agents/COWORK_FOUNDATION_MISSION.md` | **The current mission.** The ordered brief with the red-team stop gate. Supersedes every instruction file in the root. |
| `docs/agents/TASK_BOARD.md` | The task list. One task, one owner, explicit allowed files and do-not-modify boundaries. |
| `docs/architecture/SYSTEM_ARCHITECTURE_V1.md` | Domain boundaries, the five registers, security boundaries. Frozen 29 Aug. **Carries the stale H552 in §14/§15 — being corrected under PRD-002.** |
| `docs/architecture/INTEGRITY_FIXES_2026-08-29.md` | The record of migrations 0034–0036 and their proofs. |
| `docs/DECISION_2026-08-29_PROCESS_BASELINE.md` | Why the database was restored to the seed definition, and the H0 question it left open — now answered. |
| `docs/audit/*` | The red-team output. Written in Phase 1 of the mission. |
| `docs/ui/UI_VISUAL_LANGUAGE.md` | What to keep from the stakeholder prototype and what must never be copied from it. |
| `docs/handover/` | **The handover pack — 13 numbered files, self-contained.** Start at `00_START_HERE.md`. Anyone picking this project up cold needs only this folder. |
| `T:\obsidian\memory` | **Why** each decision was made. The repository answers *what is implemented*; the vault answers *why we decided this*. |

**Precedence, highest first:** the process owner's latest ruling → the Process Standard → the
Technical PRD → the two source spreadsheets → this repository → the archive.

Where sources disagree, do not silently reconcile. Record the conflict, name the selected source,
preserve the decision.

---

## The two source spreadsheets

`imp_compost_sop_30082026.xlsx` and `TURNERPRCOESS.xlsx` are the factory's own documents and are
authoritative for their own regions — the SOP for the pre-Turner rail, the Turner sheet from H174
onward. Where they disagree, section 13 of the Process Standard records which one governs and why.

In the Turner sheet: **M1 and M2 are turner machines 1 and 2. The yellow-filled numbered columns
1–6 are the piles.** Each pile has an M1 and an M2 column; the pass is recorded under whichever
machine performed it.

---

## Archive move — execute verbatim

Nothing is deleted. Every file keeps its history.

```bash
mkdir -p docs/_archive/root-instructions docs/_archive/v2-specs docs/_archive/superseded docs/_archive/reports

# Pasted conversation, filed as specification. All describe the 552-hour model.
git mv fix.md ins2.md instruct.md oka.md process.md room.md room2.md ui.md ui1.md \
       docs/_archive/root-instructions/

# V2-era specifications written for other agents. All 552-hour.
git mv "ANTIGRAVITY_MUSHROOMOS_V2_MASTER_INSTRUCTIONS (1).md" \
       MANUS_MUSHROOMOS_V2_FRONTEND_CONTEXT.md \
       MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md \
       MUSHROOMOS_USER_JOURNEYS.md \
       FRONTEND_STORY.md \
       docs/_archive/v2-specs/

# Superseded by PROCESS-2026C or by the Technical PRD.
git mv docs/PROCESS_2026B_AUTHORITATIVE_MATRIX.md docs/KIRO_HANDOVER.md \
       docs/PROCESS_V2_FACTORY_CONFIRMED.md docs/ARCHITECTURE_V2.md \
       docs/CANONICAL_MUSHROOMOS_ARCHITECTURE.md docs/MUSHROOMOS_PRODUCT_BLUEPRINT.md \
       docs/BUILD_SEQUENCE_KIRO.md docs/KIRO_BRIEF.md docs/KIRO_BUILD_INSTRUCTIONS.md \
       docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_CHECKLIST.md docs/PRODUCT_BUILD_PLAN.md \
       docs/STEP_1_2_BUILD_SPEC.md docs/DEMO_PLAN.md docs/DEMO_PLAN_V2.md \
       docs/DEMO_SPRINT_ORDER.md docs/UI_IMPLEMENTATION_PLAN.md docs/UI_PRODUCT_SPEC_V2.md \
       docs/_archive/superseded/

# Historical agent reports. Kept as the record of how the build got here.
git mv docs/REPORTS docs/_archive/reports/

# Superseded by the handover pack.
git mv docs/handover/MASTER_HANDOVER.md docs/_archive/superseded/

# Binaries and extracts that do not belong in a source repository.
git rm --cached docs.zip mails.zip MushroomOS-debug.apk
echo -e "\ndocs.zip\nmails.zip\n*.apk\napk_extracted/\nMushroomOS-extracted/\ndist-audit/" >> .gitignore
```

**Keep at the root:** `README.md` only.

**Keep in `docs/` root, unarchived** — these are still referenced by live tests, migrations or the
mission: `DOMAIN_MODEL.md`, `TIME_CONTRACT.md`, `TIME_MODEL_CONFIRMED.md`,
`ROLE_AND_APPROVAL_MODEL.md`, `LAB_MODEL.md`, `EVIDENCE_CONFIGURATION_MODEL.md`,
`RESOURCE_MOVEMENT_MODEL.md`, `MACHINE_UTILIZATION_MODEL.md`, `ADMIN_CONFIGURABILITY_MODEL.md`,
`WORKFLOW_MODEL.md`, `BATCH_CREATION_SPEC.md`, `SCHEDULE_BUILDER_SPEC.md`, `SOURCE_CONFLICTS.md`,
`SOURCE_INVENTORY.md`, `UI_DATA_CONTRACTS.md`, `UI_ACCEPTANCE_CRITERIA.md`,
`UI_COMPONENT_ARCHITECTURE.md`, `UI_CONTROL_TOWER_SPEC.md`, `UI_DESIGN_SPEC.md`,
`lab_technician_batch_process.md` (move this one **into** `docs/` from the root — it is a live
source), and `docs/source/book1_hour_grid.json` (a test fixture).

**Every one of those still needs an H552 sweep.** They are kept because something live points at
them, not because they are current.

---

## Archive header

Add this to the top of every archived file, unchanged otherwise:

```markdown
> **ARCHIVED 30 Aug 2026 — historical record, not an instruction.**
> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).
> Current: `docs/MushroomOS_Process_Standard_470H.docx` and `docs/DOCUMENT_MAP.md`.
```

---

## The rule from here

**A document that is not in the authoritative table above is not an instruction.**

When something is superseded, it moves to `docs/_archive/` with a header, in the same commit that
supersedes it. It is never deleted and never left where an agent will read it as current.

Adding a new root-level markdown file is how this problem comes back.
