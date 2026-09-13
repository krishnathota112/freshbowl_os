> **ARCHIVED 31 Aug 2026 — historical record, not an instruction.**
> Superseded by `docs/AGENT-BRIEF.md` (all coding agents) and `docs/CLAUDE-CODE.md`.

# Kiro prompts — MushroomOS

Five files. Read this one, then use them in order.

| File | When | What it does |
|---|---|---|
| `00_KIRO_STANDING_CONTEXT.md` | **every session, first** | Where the vault is, where the repo is, the five rules, the four things Kiro may never decide, and how to log. Paste this before anything else, every time. |
| `01_KIRO_LAB_SPEC_TABLES.md` | first build session | Makes the laboratory specification data. Nothing else works until this exists. |
| `02_KIRO_LAB_SCREEN.md` | today | The laboratory capture screen. Form renderer, offline queue, camera. |
| `03_KIRO_OPERATOR_SCREEN.md` | today | The operator capture screen. H-hours, machines, piles, no gates. |
| `04_KIRO_SESSION_LOG.md` | end of every session | Forces the Obsidian write before Kiro is allowed to summarise. |

---

## The order, and why it is that order

```
00 standing context        every session
       ↓
01 lab spec tables         once — the data model the two screens read
       ↓
   ┌───┴───┐
02 lab screen   03 operator screen      in parallel, different people, no conflict
   └───┬───┘
       ↓
04 session log             every session, before the summary
```

Prompts 02 and 03 touch different directories and both read the same views. Two people can run
them at the same time without a merge conflict, which is the whole reason 01 comes first.

## What makes these different from a normal prompt

**They tell Kiro what it may not decide.** Four factory questions are unresolved. An agent will
resolve them by default if it is not stopped, and the default becomes invisible within a week and
gets defended as a factory decision within a month.

**They make the log a step, not an afterthought.** Prompt 04 exists because a report written at
the end is written from memory, and the most valuable line in it — the thing believed at 10am and
disproved at 2pm — is exactly the line memory drops.

**They point at the vault and the repo separately.** The repository says what is implemented. The
vault says why. If Kiro only reads the repo, it re-litigates decisions that were settled in July.

**They repeat the archive warning.** `docs/_archive/` holds around ten thousand lines describing a
552-hour process the factory no longer runs. An agent told to "read the repository" reconstructs
the wrong system, confidently, because the overwhelming majority of the words in it say 552.