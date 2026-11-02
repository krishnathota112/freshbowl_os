-- Only for an unused installation of 0159. Refuse rollback once any machine/resource has been recorded.
do $$ begin
  if exists(select 1 from public.tk_machine) or exists(select 1 from public.tk_task_resource_revision)
     or exists(select 1 from public.tk_machine_refuel) then
    raise exception '0159 contains factory data. Preserve the machine and resource tables; do not roll back by dropping them.';
  end if;
end $$;

create or replace function public.tk_batch_progress(p_batch uuid) returns jsonb
language sql stable security invoker set search_path=public as $fn$
  select jsonb_build_object('batch',to_jsonb(b),'generated_at',now(),'rows',coalesce((
    select jsonb_agg(to_jsonb(t) || jsonb_build_object(
      'readings',coalesce((select jsonb_agg(jsonb_build_object('round',r.round,'label',r.label,
        'value',r.value,'unit',r.unit,'entered_at',r.entered_at) order by r.round,r.entered_at,r.id)
        from tk_reading r where r.task_id=t.id),'[]'::jsonb),
      'other_photos',(select count(*) from tk_photo p where p.task_id=t.id and p.kind='other')
    ) order by t.ord) from tk_v_task_v3 t where t.batch_id=b.id),'[]'::jsonb))
  from tk_v_batch b where b.id=p_batch;
$fn$;
drop view public.tk_v_task_resources;
drop view public.tk_v_machine_refuel;
drop view public.tk_v_machine_refuel_totals;
drop function public.tk_refuel_void(uuid,text);
drop function public.tk_refuel_record(uuid,uuid,numeric,text,timestamptz,text);
drop function public.tk_finish_with_resources(uuid,text,text,integer,jsonb,bigint);
drop function public.tk_resources_record(uuid,integer,jsonb,bigint);
drop function public.tk_machine_save(uuid,text,text,boolean,boolean);
drop table public.tk_task_resource_revision;
drop table public.tk_machine_refuel;
drop table public.tk_machine;
notify pgrst,'reload schema';
