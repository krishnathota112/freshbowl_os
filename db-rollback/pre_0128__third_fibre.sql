-- Rollback for 0128 (and, in effect, 0127). Refuses if any batch already uses the third fibre.
-- Apply from mushroomos/:  node scripts/apply.mjs ../../../db-rollback/pre_0128__third_fibre.sql
do $rb$
begin
  if exists (select 1 from public.batch_material_role where role::text = 'TERTIARY_FIBRE') then
    raise exception 'A batch records a third fibre; cancel or re-create it before removing the role.';
  end if;
  delete from public.material_role_eligibility where role::text = 'TERTIARY_FIBRE';
end
$rb$;
-- The enum value TERTIARY_FIBRE (0127) stays; Postgres cannot drop an enum value in place and an unused value is harmless.
notify pgrst, 'reload schema';
