-- ─────────────────────────────────────────────────────────────────────────────
-- 0116 · `NOT_DUE_YET` BECOMES A REAL STATE.
--
-- THE DEFECT. advance_batch sets READY the moment an activity's ENTRY gates pass, and the entry
-- gates are only PREDECESSOR and LAB_APPROVED. Planned time is not among them. So a stream head —
-- an activity with no predecessor at all — is READY from the moment the batch is activated:
--
--     batch 001,002,003 · H0 = 16 Sep 10:00 · observed at H0.45
--       FIB-WET-1   planned H0    16 Sep 10:00   READY   correct
--       STR-WEIGH   planned H70   19 Sep 08:00   READY   three days early
--       CM-WEIGH    planned H130  21 Sep 20:00   READY   five days early
--       TN-PREP     planned H308  29 Sep 06:00   READY   thirteen days early
--
-- 0106 made start_activity REFUSE those starts, which is why nothing broke in the field. But the
-- refusal lives in the RPC and the STATE still says READY, so v_my_work serves READY to the
-- Supervisor's phone and the board shows a Start button on work due in thirteen days. The Geetha
-- context is explicit (§37): never show "READY / not due until 29 Sep"; show "NOT DUE YET".
--
-- This file adds the enum value ONLY. PostgreSQL will not let a value added by ALTER TYPE be USED
-- in the same transaction, and scripts/apply.mjs wraps each invocation in one — so the logic that
-- uses it is 0117, applied as a separate call:
--
--     node scripts/apply.mjs 0116_not_due_yet_is_a_state.sql
--     node scripts/apply.mjs 0117_planned_time_decides_ready.sql
--
-- Adding an enum value is additive: nothing produces NOT_DUE_YET until 0117, and no reader breaks.
-- The frontend degrades correctly on its own in the meantime — shared/api/work.ts workGroupOf()
-- returns 'waiting' for any state it does not recognise, so an unlabelled NOT_DUE_YET is shown
-- without a Start button rather than being folded into 'ready'.
--
-- Rollback: an enum value cannot be dropped in PostgreSQL. Reverting means 0117's rollback body
-- (advance_batch stops producing the value); the unused label is harmless.
-- ─────────────────────────────────────────────────────────────────────────────

alter type public.activity_state add value if not exists 'NOT_DUE_YET';

notify pgrst, 'reload schema';
