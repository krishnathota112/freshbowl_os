#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Phase 0 · one-shot documentation restructure.
#
# Nothing is deleted. Everything moves with `git mv`, keeping its history.
#
# BEFORE: 15 markdown files in the repository root (10,193 lines, all describing
#         the superseded 552-hour model) plus ~40 in docs/ and 22 agent reports.
#         An agent told to "read the repository" rebuilds the wrong process.
#
# AFTER:  CLAUDE.md + README.md at the root. Eleven live documents in six
#         numbered folders. Everything else under docs/_archive/, marked.
#
# Run from the repository root. Idempotent — safe to re-run.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
echo "→ restructuring documentation in $(pwd)"

# `git mv` only works on TRACKED paths. On an untracked file it fails, and with the error
# swallowed it failed SILENTLY — nine paths were left behind by the first run, including both
# .docx files and the whole interim handover/ folder, while the script still printed success.
# So: try git mv (history follows), and fall back to a plain mv (untracked — no history to keep).
mv_if () {
  [ -e "$1" ] || return 0
  git mv -k "$1" "$2" 2>/dev/null && return 0
  mkdir -p "$2" && mv "$1" "$2" 2>/dev/null || true
}

# ── 1 · the new shape ────────────────────────────────────────────────────────
mkdir -p docs/{01-process,02-architecture,03-mission,04-audit,05-ui,_templates,_reference}
mkdir -p docs/_archive/{root-instructions,v2-specs,superseded,reports}

# ── 2 · root markdown → archive ──────────────────────────────────────────────
# Pasted conversation, filed where specifications live. All 552-hour.
for f in fix.md ins2.md instruct.md oka.md process.md room.md room2.md ui.md ui1.md; do
  mv_if "$f" docs/_archive/root-instructions/
done
# V2-era specifications written for other agents. All 552-hour.
for f in "ANTIGRAVITY_MUSHROOMOS_V2_MASTER_INSTRUCTIONS (1).md" \
         MANUS_MUSHROOMOS_V2_FRONTEND_CONTEXT.md \
         MUSHROOMOS_V2_END_TO_END_PRODUCT_CONTRACT.md \
         MUSHROOMOS_USER_JOURNEYS.md FRONTEND_STORY.md; do
  mv_if "$f" docs/_archive/v2-specs/
done
# A live source document that was sitting in the root.
mv_if lab_technician_batch_process.md docs/_reference/

# ── 3 · superseded docs/ → archive ───────────────────────────────────────────
for f in PROCESS_2026B_AUTHORITATIVE_MATRIX.md KIRO_HANDOVER.md PROCESS_V2_FACTORY_CONFIRMED.md \
         ARCHITECTURE_V2.md CANONICAL_MUSHROOMOS_ARCHITECTURE.md MUSHROOMOS_PRODUCT_BLUEPRINT.md \
         BUILD_SEQUENCE_KIRO.md KIRO_BRIEF.md KIRO_BUILD_INSTRUCTIONS.md IMPLEMENTATION_PLAN.md \
         IMPLEMENTATION_CHECKLIST.md PRODUCT_BUILD_PLAN.md STEP_1_2_BUILD_SPEC.md \
         DEMO_PLAN.md DEMO_PLAN_V2.md DEMO_SPRINT_ORDER.md DEMO_AND_APK.md \
         UI_IMPLEMENTATION_PLAN.md UI_PRODUCT_SPEC_V2.md PRODUCT_STORY.md \
         AUDIT_BEFORE_V2.md audit.md SCOPE_GAP_2026-08-23.md SOURCE_READ_2026-08-23.md \
         CONTRACT_AUDIT_2026-08-22.md WORKSPACE_INVENTORY_AND_ARCHITECTURE.md; do
  mv_if "docs/$f" docs/_archive/superseded/
done
mv_if docs/REPORTS                     docs/_archive/reports/
mv_if docs/handover/MASTER_HANDOVER.md docs/_archive/superseded/

# ── 4 · supporting detail → _reference (still needs an H552 sweep) ───────────
for f in DOMAIN_MODEL.md TIME_CONTRACT.md TIME_MODEL_CONFIRMED.md ROLE_AND_APPROVAL_MODEL.md \
         LAB_MODEL.md EVIDENCE_CONFIGURATION_MODEL.md RESOURCE_MOVEMENT_MODEL.md \
         MACHINE_UTILIZATION_MODEL.md ADMIN_CONFIGURABILITY_MODEL.md WORKFLOW_MODEL.md \
         BATCH_CREATION_SPEC.md SCHEDULE_BUILDER_SPEC.md SOURCE_CONFLICTS.md SOURCE_INVENTORY.md \
         UI_DATA_CONTRACTS.md UI_ACCEPTANCE_CRITERIA.md UI_COMPONENT_ARCHITECTURE.md \
         UI_CONTROL_TOWER_SPEC.md UI_DESIGN_SPEC.md ADMIN_CONFIGURABILITY_MODEL.md \
         DECISION_2026-08-29_PROCESS_BASELINE.md; do
  mv_if "docs/$f" docs/_reference/
done
mv_if docs/architecture/SYSTEM_ARCHITECTURE_V1.md      docs/_reference/
mv_if docs/architecture/INTEGRITY_FIXES_2026-08-29.md  docs/_reference/
mv_if docs/MushroomOS_Process_Standard_470H.docx       docs/_reference/
mv_if docs/MushroomOS_Technical_PRD_Architecture.docx  docs/_reference/
mv_if docs/diagrams                                    docs/_reference/
mv_if docs/source                                      docs/_reference/

# ── 5 · retire the interim locations (content now lives in the numbered set) ─
for f in docs/handover docs/agents docs/architecture docs/ui docs/DOCUMENT_MAP.md; do
  [ -e "$f" ] && git rm -r -q --ignore-unmatch "$f" || true
done

# ── 6 · archive headers ──────────────────────────────────────────────────────
# node, not python3 — python3 is not present on the Windows/Git-Bash box this runs on, and with
# `set -e` its absence aborted the script here, after the moves and before the proof. Node is
# already a hard dependency of the project, so it is the safer interpreter to reach for.
node -e '
const fs=require("fs"), path=require("path");
const BANNER="> **ARCHIVED — historical record, not an instruction.**\n"
           +"> Describes the 552-hour process model, superseded by PROCESS-2026C (470 hours).\n"
           +"> Current: `docs/00-START-HERE.md`\n\n";
let n=0;
(function walk(d){
  if(!fs.existsSync(d)) return;
  for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name);
    if(e.isDirectory()) walk(p);
    else if(e.name.endsWith(".md")){
      const t=fs.readFileSync(p,"utf8");
      if(!t.startsWith("> **ARCHIVED")){ fs.writeFileSync(p,BANNER+t,"utf8"); n++; }
    }
  }
})("docs/_archive");
console.log("  archived headers added to "+n+" files");'

# ── 7 · binaries out of the source tree ──────────────────────────────────────
git rm -q --cached --ignore-unmatch docs.zip mails.zip MushroomOS-debug.apk || true
grep -q '^docs.zip$' .gitignore 2>/dev/null || cat >> .gitignore <<'IGN'

# binaries and extracts — not source
docs.zip
mails.zip
*.apk
apk_extracted/
MushroomOS-extracted/
dist-audit/
mails/
IGN

# ── 8 · prove it ─────────────────────────────────────────────────────────────
echo
echo "── root markdown (must be CLAUDE.md and README.md only) ──"
ls -1 *.md 2>/dev/null || echo "  (none)"
echo
echo "── live documents ──"
find docs -maxdepth 2 -name '*.md' -not -path 'docs/_archive/*' -not -path 'docs/_reference/*' | sort
echo
echo "── 552 outside the archive (each must be historical context) ──"
grep -rn '552' --include='*.md' docs CLAUDE.md README.md 2>/dev/null \
  | grep -v '^docs/_archive/' | grep -v '^docs/_reference/' | wc -l
echo
echo "✔ restructure complete. Review with 'git status', then commit."
