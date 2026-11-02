-- Rollback for 0129. Refuses if any weight has already been recorded (recorded readings are never deleted).
-- Apply from mushroomos/:  node scripts/apply.mjs ../../../db-rollback/pre_0129__prebatch_weights.sql
do $rb$
begin
  if exists (select 1 from public.lab_test where parameter_code like 'wt\_%\_kg' escape '\') then
    raise exception 'Pre-H0 weights are already recorded on a batch; the parameters stay.';
  end if;
  delete from public.lab_parameter where code like 'wt\_%\_kg' escape '\';
end
$rb$;
notify pgrst, 'reload schema';
