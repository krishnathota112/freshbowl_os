-- ─────────────────────────────────────────────────────────────────────────────
-- 0128 · WHICH MATERIALS MAY BE THE THIRD FIBRE (owner, 17 Sep 2026)
--
-- The Batch Creation form offers Main, Second and Third fibre from ONE list — the fibre materials already
-- eligible for the main fibre (bagasse new/old, wheat straw, mustard straw) — and a later fibre cannot
-- repeat an earlier one. The third fibre is optional ("Not used"), so none is its default.
-- Rollback: db-rollback/pre_0128__third_fibre.sql
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.material_role_eligibility (role, material_id, is_default_lead)
select 'TERTIARY_FIBRE'::public.material_role_code, e.material_id, false
  from public.material_role_eligibility e
 where e.role = 'PRIMARY_FIBRE'
on conflict (role, material_id) do nothing;

notify pgrst, 'reload schema';
