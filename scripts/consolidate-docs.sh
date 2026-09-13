#!/usr/bin/env bash
# One-shot. Idempotent. Archives every superseded instruction document so that
# docs/ holds two agent briefs and nothing else that reads like an instruction.
# Deletes nothing — git mv, so history follows.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mv_if () {  # git mv when tracked, plain mv when not, skip when absent
  local src="$1" dst="$2"
  [ -e "$src" ] || { echo "  skip (absent)  $src"; return 0; }
  [ ! -e "$dst" ] || {
    echo "  refuse (destination exists)  $src -> $dst" >&2
    return 1
  }
  mkdir -p "$(dirname "$dst")"
  if git ls-files --error-unmatch "$src" >/dev/null 2>&1; then git mv "$src" "$dst"
  else mv "$src" "$dst"; git add "$dst" 2>/dev/null || true; fi
  echo "  moved          $src"
}

echo "archiving superseded instruction documents…"
mkdir -p docs/_archive/superseded-2026-08-31

# Two mission documents existed; both are now inside AGENT-BRIEF / CLAUDE-CODE.
mv_if docs/03-mission/MISSION.md                          docs/_archive/superseded-2026-08-31/MISSION.md
mv_if docs/03-mission/CLAUDE-CODE-FOUNDATION-MISSION.md   docs/_archive/superseded-2026-08-31/CLAUDE-CODE-FOUNDATION-MISSION.md
mv_if docs/03-mission/HANDOVER-TO-KIRO.md                 docs/_archive/superseded-2026-08-31/HANDOVER-TO-KIRO.md
mv_if docs/03-mission/PROMPT-FOR-CLAUDE-CODE.md           docs/_archive/superseded-2026-08-31/PROMPT-FOR-CLAUDE-CODE.md
mv_if docs/_reference/PROMPT_FOR_CLAUDE_CODE.md           docs/_archive/superseded-2026-08-31/PROMPT_FOR_CLAUDE_CODE.reference.md

# The per-task prompt folder is now section 4 of AGENT-BRIEF.md.
for f in README 00_KIRO_STANDING_CONTEXT 01_KIRO_LAB_SPEC_TABLES 01_RULING_LAB_SPEC_MODEL \
         02_KIRO_LAB_SCREEN 03_KIRO_OPERATOR_SCREEN 04_KIRO_SESSION_LOG; do
  mv_if "docs/03-mission/kiro/$f.md" "docs/_archive/superseded-2026-08-31/kiro/$f.md"
done
rmdir docs/03-mission/kiro 2>/dev/null || true

HDR='> **ARCHIVED 31 Aug 2026 — historical record, not an instruction.**
> Superseded by `docs/AGENT-BRIEF.md` (all coding agents) and `docs/CLAUDE-CODE.md`.
'
for f in docs/_archive/superseded-2026-08-31/*.md docs/_archive/superseded-2026-08-31/kiro/*.md; do
  [ -e "$f" ] || continue
  grep -q 'ARCHIVED 31 Aug 2026' "$f" || { printf '%s\n%s' "$HDR" "$(cat "$f")" > "$f.t" && mv "$f.t" "$f"; }
done

echo
echo "── proof ──────────────────────────────────────────────────────────────"
echo "root markdown (want: CLAUDE.md, README.md):"
ls -1 *.md 2>/dev/null | sed 's/^/  /'
echo "docs/ top level:"
ls -1 docs/*.md 2>/dev/null | sed 's/^/  /'
echo "03-mission/ (want: FINDINGS.md, TASK-BOARD.md):"
ls -1 docs/03-mission/*.md 2>/dev/null | sed 's/^/  /'
echo
echo "live instruction files outside _archive/ and _reference/:"
find docs -name '*.md' -not -path '*_archive*' -not -path '*_reference*' | wc -l
echo
echo "next: node scripts/schema-snapshot.mjs   → docs/SCHEMA.md, then commit both"
