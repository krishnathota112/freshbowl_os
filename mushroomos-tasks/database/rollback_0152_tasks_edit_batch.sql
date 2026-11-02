drop function if exists public.tk_batch_plan_save(uuid,text,text,text,jsonb);
drop function if exists public.tk_batch_plan_get(uuid);
drop function if exists public.tk_task_plan_fields(public.tk_task);
drop function if exists public.tk_batch_plan_snapshot(uuid);
notify pgrst,'reload schema';
