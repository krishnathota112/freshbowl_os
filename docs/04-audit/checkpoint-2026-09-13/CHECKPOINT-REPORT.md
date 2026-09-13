# Repository checkpoint — integrity pass, 13 September 2026

Prepared before the first git checkpoint since `003d2aa`. **Nothing committed or pushed by this pass. No application code changed. No database queried** — migration status comes from the saved read-only catalog snapshot `04-audit/context-comparison-2026-09-13/database-readonly.json` (captured 07:31 UTC).

Reproduce: `node docs/04-audit/checkpoint-2026-09-13/classify-migrations.mjs <repo root>` and `verify-anomalies.mjs <repo root>`. Raw output: `classify-migrations.output.txt`.

## 1 · Migration classification

### How "applied" is established

There is **no migration ledger** — not in `scripts/db.mjs` and not in the database — so no record says which files ran. Status is inferred by comparing each file with the live catalog: tables, added columns, views, triggers and policies by presence; functions by **exact body match** against the last file that defines each one; data-only files by a named post-condition. This is evidence, not a ledger. See [F49](../../03-mission/FINDINGS.md) for why the missing ledger matters.

Known parser artefacts, each checked: policies created through `format()`/dynamic SQL or on `storage.objects` read as "absent"; `zz_*_probe` objects are created and dropped inside `0067`, `0069`, `0074` as self-tests; functions rewritten in place by `0058`/`0059` (which patch bodies with `pg_get_functiondef` + `execute`) read as "differs" against their original file while the live body carries the guard.

### A · Applied historical, tracked, unchanged — 30 files

| File | Evidence |
|---|---|
| 0001, 0002, 0005, 0008, 0009, 0010, 0015, 0016, 0018, 0019, 0024, 0025, 0028, 0029, 0030, 0033 | Every final object matches live |
| 0003, 0004, 0006, 0017, 0020, 0021, 0022, 0026, 0031 | Objects match; only dynamically created policies unreadable by parser |
| 0014 | Storage policies sit outside the public-schema snapshot |
| 0007 | `set_activity_plan`, `send_alert` later rewritten in place by `0058`/`0059`; live bodies carry the guards |
| 0013 | `cancel_batch` rewritten in place by `0058` |
| 0032 | `validate_batch` redefined later (`0047`, `0073`) |
| 0023 | All definitions superseded by later files |

### B1 · Applied to live but never committed — 40 files

| File | Evidence |
|---|---|
| 0034, 0035, 0036, 0040, 0041, 0043, 0045, 0048, 0049, 0050, 0051, 0053, 0054, 0056, 0060, 0062, 0065, 0068, 0070, 0071, 0073, 0076 | Every final object matches live |
| 0042 | `process_activity.standard_start_hour` is `numeric` in live |
| 0044 | `create_master_batch` rewritten in place by `0058` |
| 0046 | Post-condition holds: no repoint function uses whole-hour `make_interval` (only `set_dev_clock_h`, which no migration creates) |
| 0047 | Data-only; consistent with later `validate_batch` — **inferred, not directly proved** |
| 0052 | `LAB_2026A` checkpoint map value present |
| 0055 | 93 of PROCESS-2026C's 110 activities carry exit `EVIDENCE_COMPLETE` gates |
| 0057 | No function executable by `anon` or `PUBLIC` |
| 0058, 0059 | Live bodies carry the injected `assert_role` guards |
| 0061 | 38 of 38 views are `security_invoker` |
| 0063 | `v_lab_approval_queue` present |
| 0066, 0067, 0069, 0074 | Objects present; remaining "absent" items are storage policy or self-test probes |
| 0072 | Live `advance_batch` is **exactly** this file's body |
| 0064, 0075 | Definitions superseded by later files |

`0037`–`0039` were reserved and never written.

### B2 · New and not applied — 1 file

| File | Evidence | Checkpoint |
|---|---|---|
| **0077** `a_poll_that_moves_nothing_writes_nothing` | Its `advance_batch` differs from live; live equals `0072`. Matches F47 ("written, not applied") | **Excluded** |

### C · Modified historical migrations — 3 files

All three are applied (they belong to A). The working-tree edits change no live object's end state; they exist **only so `db.mjs` can re-execute every file on top of a database that already has them**. A fresh database replays without them — shown by reasoning, **not by an executed replay** (no disposable database exists yet).

| File | Edit | Why it was needed | Needed on a fresh replay? | Checkpoint |
|---|---|---|---|---|
| **0011** `hour_axis` | explicit `floor()` in the `rel_day` rule; `make_interval(hours =>)` → seconds; backfill loop limited to draft batches | Re-running over the `numeric` column (after `0042`) fails the rule and `make_interval`; re-running the loop over active batches hits the frozen-plan trigger | No — at this step the column is `int` and no batches exist | **Excluded** |
| **0012** `evaluate_gates` | `drop function gate_predecessor_status` before re-creating | Re-running over `0051`'s wider return type fails `create or replace` | No — `0051` itself drops before re-creating | **Excluded** |
| **0027** `hourly_plan` | `make_interval(hours =>)` → seconds | Same `numeric` re-run failure; its functions are superseded and patched by `0046` | No | **Excluded** |

**Should these be new migrations instead?** No new migration can fix them: the failure is in re-executing the old file itself. The right fix is a runner with a ledger (F49), after which these edits are unnecessary and can be reverted. Until that decision, they stay uncommitted in the working tree.

### D · Generated

`0043` (PROCESS-2026C) and `0053` (LAB-2026A) are generated by `scripts/gen-process-2026c.mjs` and `scripts/gen-lab-2026a.mjs`; both applied. No test-only migration files exist.

### Seeds — held out as one coupled group

`s03`, `s10`, `s11` (edited) and `s12`, `s13` (new) are re-executed by every `npm run db`. The edited `s03` switches published PROCESS-2026B back to draft so later seeds can write, and `s13` republishes it last — a partial run leaves a published process in draft. The group is **excluded** until the runner decision (F49).

## 2 · Product state

Evidence labels: *observed* = seen in this workspace on 12–13 September (browser, HTTP as real roles, or catalog); *not run* = the 36 database test files, which write to the live project.

| State | Items |
|---|---|
| **Exists** | React 18 + TypeScript + Vite app, 27 routes, Capacitor 6 Android · 59 tables, 38 views, ~90 app-callable functions, 45 triggers, 85 policies · Codex model package (product, process, SOP version, roles, screens, navigation, acceptance) |
| **Works — observed** | Sign-in and role routing · Admin Home with New Batch / Add Ongoing Batch · batch create → plan → assign → activate → execute → lab → decision over HTTP as real roles (12 Sep run) · server refuses `start_activity` for admin, GM, manager · frozen plan, append-only actuals, immutable audit · Lab Queue and Lab Approvals render live data · typecheck, build, 61 local tests |
| **Partially implemented** | New Batch (no material/configuration inputs — G01) · Add Ongoing Batch (route exists; onboarding contract D13) · Batch Detail (legacy panels — G02) · Operations workstation (still two shells: field vs management) · incoming-material lab check (Lab cannot reach it — G11) · evidence camera (native capture unverified on a handset — F32) · vessel allocation |
| **Broken** | G02 Batch Detail's pile panel uses codes absent from PROCESS-2026C, so pile steps show COMPLETED on every batch · G05 lab collection time invented as min(now, H0 − 1 h) · Supervisor menu has Lab Queue · `888,999,777` is active with 94 activities (G01 consequence) · `npm run db` targets live with no ledger (F49) · F47 false `gate_opened` audit events every poll |
| **Missing** | `03-mission/PROJECT-DELIVERY.md` · `01-process/PROCESS_AUTHORING_AND_IMPORT.md` · draft-batch lab queue · single Operations shell · extension, deviation and management-checkpoint screens · SOP authoring/import · batch closure workflow · offline replay · migration ledger · disposable test database · demo records marked `is_demo` |
| **Backend-blocked** | G03 lab completion without a valid package · G04 lab decision without valid package or distinct actor · F47/0077 unapplied · G06 personal queue (`v_my_work` too broad, `v_lab_queue` unassigned) · G10 SOP publication contract · G11 draft lab queue contract · closure contract · F37 `request_lab_test` unguarded · per-person capability grants, only if D15 wants them |
| **Factory-decision-blocked** | D01 Stage 1B second hopper pass · D03 Turner · D04 bunker · D05 tunnel · D06 totals · D07 trigger logic · D08 lab turnaround · D09 lab acceptance/approval authority · D10 pre-H0 readiness · D11 resources · D12 SOP governance · D13 onboarding and closure · D14 extensions/overrides · D15 visibility and delegation |

## 3 · Checkpoint contents

**Include:** documentation package and edits (including this report) · source evidence (`Compost SOP.xlsx`, LAB-2026A docx/pdf) · application source · migrations `0034`–`0036`, `0040`–`0076` · tests · Android build files, camera permission, `libs/.gitkeep` · tooling without credentials (`apply.mjs`, `gen-*.mjs`, `context-audit-readonly.mjs`, `schema-snapshot.mjs`, `consolidate-docs.sh`).

**Exclude, left untouched on disk:** `0077` · edits to `0011`, `0012`, `0027` · all seed changes · `.mcp.json` (invalid JSON, machine config) · `android/app/src/debug/` (Norton TLS anchor) · live-database demo writers with the hardcoded demo password (`batchexp-run`, `lab-demo-state`, `clean-demo-data`, `dummy-batch`, `realtime-batches`, `acceptance-run`, edit to `setup-demo-showcase`) · `role-isolation.mjs`, `scripts/break/`, `probe-*.mjs`, `_probe.mjs`, `_verify.mjs` · run logs, `.start.txt`, `mushroomos/.claude/`, `tsconfig.tsbuildinfo` · already ignored `.env.local`, `key.txt`, `local.properties`.

## 4 · Verification

| Check | Result |
|---|---|
| `npm run typecheck` | pass · 15:29 |
| `npm run build` | pass · 15:29 · warning: `exceljs` chunk 938 kB |
| `vitest run src/domain/time.test.ts tests/fieldShell.test.ts` | 61 / 61 pass · 15:30 |
| 36 database test files | **not run** — they write to the configured live project |
| Fresh migration replay | **not run** — no disposable database |

## 5 · Decisions this checkpoint needs

1. Approve the commit as listed (no push).
2. F49 runner: adopt a ledger-based runner with `0001`–`0076` recorded as applied — this adds a ledger table to the live database, so it needs explicit approval — or keep the re-run model and commit the historical edits and seeds separately.
3. `0077`: apply after review in a disposable database first, or leave pending.
