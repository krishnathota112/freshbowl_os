-- ─────────────────────────────────────────────────────────────────────────────
-- 0087 · Two extension statuses for Admin decisions (user ruling, 13–14 Sep 2026: late-work "more time"
-- tickets go to Admin, and only Admin approves).
--
-- On its own file because a new enum value cannot be used in the transaction that adds it. Additive only:
-- no row, rule or function changes. 0088 uses them.
-- ─────────────────────────────────────────────────────────────────────────────

alter type public.extension_status add value if not exists 'ADMIN_APPROVED';
alter type public.extension_status add value if not exists 'ADMIN_REJECTED';
