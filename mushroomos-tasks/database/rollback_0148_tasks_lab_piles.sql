-- Refuse destructive rollback once real descriptions/pile records exist. Keep their evidence intact.
do $guard$ begin
  if exists(select 1 from tk_task where pile is not null or description is not null)
    or exists(select 1 from tk_sop_row where pile is not null or description is not null) then
    raise exception 'Description/pile data exists; retain 0148 and use a forward fix.';
  end if;
end $guard$;
drop view public.tk_v_task_v3;
drop function public.tk_sop_create_v3(text,text,jsonb,timestamptz), public.tk_sop_save_v3(uuid,text,text,jsonb,timestamptz),
 public.tk_sop_new_version_v3(uuid), public.tk_batch_create_plan_v3(text,uuid,timestamptz,text,jsonb),
 public.tk_task_add_v3(uuid,uuid,jsonb),public.tk_task_edit_v3(uuid,jsonb), public.tk_sop_details(uuid,jsonb),public.tk_validate_details(jsonb);
create or replace function public.tk_blocker(p_task uuid) returns uuid
language sql stable security definer set search_path=public as $fn$
 select e.id from tk_task t join tk_task e on e.batch_id=t.batch_id and e.line=t.line and e.ord<t.ord
 where t.id=p_task and e.kind<>'lab' and e.status not in ('done','done_before') order by e.ord limit 1;
$fn$;
alter table public.tk_task drop column description,drop column pile,drop column turner_pass;
alter table public.tk_sop_row drop column description,drop column pile,drop column turner_pass;
notify pgrst,'reload schema';
