-- Open every unstarted process task independently. No task data is rewritten.
-- Keep status, role, closed-batch, evidence and Lab/GM approval checks unchanged.
create or replace function public.tk_blocker(p_task uuid) returns uuid
language sql stable security definer set search_path=public as $fn$
  select null::uuid;
$fn$;

-- Preserve the existing view's exact column order/types for all web/APK versions.
-- Its old dependency-derived fields are replaced; v2/v3 inherit the same change.
do $migration$
declare definition text; columns_sql text;
begin
  definition := pg_get_viewdef('public.tk_v_task'::regclass,true);
  select string_agg(case attname
    when 'blocked_by_id' then 'null::uuid as blocked_by_id'
    when 'blocked_by' then 'null::text as blocked_by'
    when 'can_start' then '(v.kind in (''work'',''rest'',''cleaning'') and v.status=''todo'' and v.batch_status=''active'') as can_start'
    else format('v.%I',attname) end,', ' order by attnum)
  into columns_sql from pg_attribute
  where attrelid='public.tk_v_task'::regclass and attnum>0 and not attisdropped;
  execute 'create or replace view public.tk_v_task with (security_invoker=on) as select '
    ||columns_sql||' from ('||rtrim(definition,E';\n\r ')||') v';
end $migration$;
notify pgrst,'reload schema';
