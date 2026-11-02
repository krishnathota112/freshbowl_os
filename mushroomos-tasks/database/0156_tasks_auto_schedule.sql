-- Advisory schedule rules only. Does not restore execution gates or rewrite existing plans.
alter table public.tk_sop_row add column schedule_mode text not null default 'fixed' check(schedule_mode in ('fixed','stream','batch')),
 add column schedule_gap_minutes int not null default 0 check(schedule_gap_minutes between -525600 and 525600);
alter table public.tk_task add column schedule_mode text not null default 'fixed' check(schedule_mode in ('fixed','stream','batch')),
 add column schedule_gap_minutes int not null default 0 check(schedule_gap_minutes between -525600 and 525600);
create or replace function public.tk_validate_details(p_rows jsonb) returns void
language plpgsql immutable set search_path=public as $fn$
declare r jsonb; p text; pass text;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'title'),'') = '' then continue; end if;
    if nullif(r->>'planned_duration_minutes','') is not null and
      (r->>'planned_duration_minutes' !~ '^[0-9]+$' or length(r->>'planned_duration_minutes') > 6) then
      raise exception 'Planned duration must be whole minutes from 0 to 525600.';
    end if;
    if nullif(r->>'planned_duration_minutes','')::int not between 0 and 525600 then
      raise exception 'Planned duration must be whole minutes from 0 to 525600.';
    end if;
    if length(r->>'report_section') > 200 then raise exception 'Report section must be 200 characters or fewer.'; end if;
    if coalesce(r->>'schedule_mode','fixed') not in ('fixed','stream','batch') then raise exception 'Unknown timing rule.'; end if;
    if coalesce((r->>'schedule_gap_minutes')::numeric,0) not between -525600 and 525600
      or coalesce((r->>'schedule_gap_minutes')::numeric,0)<>trunc(coalesce((r->>'schedule_gap_minutes')::numeric,0)) then
      raise exception 'Timing gap must be whole minutes within one year.';
    end if;
    p := nullif(trim(r->>'pile'),''); pass := nullif(trim(r->>'turner_pass'),'');
    if (p is null) <> (pass is null) then raise exception 'A Turner row needs both a pile and a pass.'; end if;
    if p is not null then
      if r->>'line' is distinct from 'Turner · '||p then raise exception 'Each pile needs its own Turner stream.'; end if;
      if p !~ '^P([1-9]|[1-4][0-9]|50)$' then raise exception 'Use pile P1 to P50.'; end if;
      if pass not in ('T0','T1','T2','T3','REST','LAB_BEFORE_T1','LAB_AFTER_T1') then raise exception 'Unknown Turner pass.'; end if;
      if pass in ('T0','T1','T2','T3') and (r->>'kind' is distinct from 'work' or r->>'photos' is distinct from 'both') then
        raise exception 'Each Turner pass needs its own before and after photos.';
      end if;
      if pass in ('LAB_BEFORE_T1','LAB_AFTER_T1') and r->>'kind' is distinct from 'lab' then raise exception 'The pile Lab check must be a Lab task.'; end if;
      if pass='REST' and r->>'kind' is distinct from 'rest' then raise exception 'The pile rest must be a Rest task.'; end if;
    end if;
  end loop;
end $fn$;
revoke all on function public.tk_validate_details(jsonb) from public, anon, authenticated;

create or replace function public.tk_sop_details(p_sop uuid, p_rows jsonb) returns void
language sql security definer set search_path=public as $fn$
  with input as (
    select row_number() over(order by x.ordinality) n, x.value r
    from jsonb_array_elements(p_rows) with ordinality x(value,ordinality)
    where coalesce(trim(x.value->>'title'),'') <> ''
  ) update tk_sop_row s set description=nullif(trim(input.r->>'description'),''),
      pile=nullif(trim(input.r->>'pile'),''), turner_pass=nullif(trim(input.r->>'turner_pass'),''),
      planned_duration_minutes=nullif(input.r->>'planned_duration_minutes','')::int,
      report_section=nullif(trim(input.r->>'report_section'),''),
      schedule_mode=coalesce(input.r->>'schedule_mode','fixed'),schedule_gap_minutes=coalesce((input.r->>'schedule_gap_minutes')::int,0)
    from input where s.sop_id=p_sop and s.ord=input.n;
$fn$;
revoke all on function public.tk_sop_details(uuid,jsonb) from public, anon, authenticated;

create or replace function public.tk_sop_create_v3(p_name text,p_note text,p_rows jsonb,p_reference_h0 timestamptz) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  perform public.tk_validate_details(p_rows);
  v_id:=public.tk_sop_create_v2(p_name,p_note,p_rows,p_reference_h0);
  perform public.tk_sop_details(v_id,p_rows); return v_id;
end $fn$;
create or replace function public.tk_sop_save_v3(p_sop uuid,p_name text,p_note text,p_rows jsonb,p_reference_h0 timestamptz) returns int
language plpgsql security definer set search_path=public as $fn$
declare n int;
begin
  perform public.tk_validate_details(p_rows);
  if exists(select 1 from tk_sop_row where sop_id=p_sop and schedule_mode<>'fixed')
    and exists(select 1 from jsonb_array_elements(p_rows) r where not r ? 'schedule_mode') then
    raise exception 'Update the app before editing this automatic-timing template.';
  end if;
  n:=public.tk_sop_save_v2(p_sop,p_name,p_note,p_rows,p_reference_h0);
  perform public.tk_sop_details(p_sop,p_rows); return n;
end $fn$;
create or replace function public.tk_sop_new_version_v3(p_from uuid) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  v_id:=public.tk_sop_new_version_v2(p_from);
  update tk_sop_row n set description=s.description,pile=s.pile,turner_pass=s.turner_pass,planned_duration_minutes=s.planned_duration_minutes,report_section=s.report_section,schedule_mode=s.schedule_mode,schedule_gap_minutes=s.schedule_gap_minutes
    from tk_sop_row s where n.sop_id=v_id and s.sop_id=p_from and n.ord=s.ord;
  return v_id;
end $fn$;
create or replace function public.tk_batch_create_plan_v3(p_name text,p_sop uuid,p_h0 timestamptz,p_note text,p_rows jsonb) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  perform public.tk_validate_details(p_rows);
  v_id:=public.tk_batch_create_plan(p_name,p_sop,p_h0,p_note,p_rows);
  with input as (
    select row_number() over(order by x.ordinality) n, x.value r
    from jsonb_array_elements(p_rows) with ordinality x(value,ordinality)
    where coalesce(trim(x.value->>'title'),'') <> ''
  ) update tk_task t set description=nullif(trim(input.r->>'description'),''),
      pile=nullif(trim(input.r->>'pile'),''),turner_pass=nullif(trim(input.r->>'turner_pass'),''),
      planned_duration_minutes=nullif(input.r->>'planned_duration_minutes','')::int,
      report_section=nullif(trim(input.r->>'report_section'),''),
      schedule_mode=coalesce(input.r->>'schedule_mode','fixed'),schedule_gap_minutes=coalesce((input.r->>'schedule_gap_minutes')::int,0)
    from input where t.batch_id=v_id and t.ord=input.n;
  return v_id;
end $fn$;
create or replace function public.tk_task_add_v3(p_batch uuid,p_after uuid,p_row jsonb) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  perform public.tk_validate_details(jsonb_build_array(p_row));
  v_id:=public.tk_task_add_v2(p_batch,p_after,p_row);
  update tk_task set description=nullif(trim(p_row->>'description'),''),pile=nullif(trim(p_row->>'pile'),''),turner_pass=nullif(trim(p_row->>'turner_pass'),''),
    planned_duration_minutes=nullif(p_row->>'planned_duration_minutes','')::int,
    report_section=nullif(trim(p_row->>'report_section'),''),
    schedule_mode=coalesce(p_row->>'schedule_mode','fixed'),schedule_gap_minutes=coalesce((p_row->>'schedule_gap_minutes')::int,0) where tk_task.id=v_id;
  return v_id;
end $fn$;
create or replace function public.tk_task_edit_v3(p_task uuid,p_row jsonb) returns void
language plpgsql security definer set search_path=public as $fn$
declare old tk_task;
begin
  perform public.assert_role(array['admin']::app_role[], 'change a task');
  old:=public.tk_task_for_update(p_task);
  if not p_row ? 'schedule_mode' then p_row:=p_row || jsonb_build_object('schedule_mode',old.schedule_mode); end if;
  if not p_row ? 'schedule_gap_minutes' then p_row:=p_row || jsonb_build_object('schedule_gap_minutes',old.schedule_gap_minutes); end if;
  if old.status<>'todo' or old.started_at is not null or old.ended_at is not null
    or old.note is not null or old.answer is not null
    or exists(select 1 from tk_photo where task_id=p_task)
    or exists(select 1 from tk_reading where task_id=p_task)
    or exists(select 1 from tk_decision where task_id=p_task) then
    raise exception 'This task has recorded work and cannot be changed.';
  end if;
  if not p_row ? 'planned_duration_minutes' then p_row:=p_row || jsonb_build_object('planned_duration_minutes',old.planned_duration_minutes); end if;
  if not p_row ? 'report_section' then p_row:=p_row || jsonb_build_object('report_section',old.report_section); end if;
  -- Pile identity stays fixed after creation, so photos cannot silently change piles.
  p_row:=p_row || jsonb_build_object('pile',old.pile,'turner_pass',old.turner_pass);
  perform public.tk_validate_details(jsonb_build_array(p_row));
  perform public.tk_task_edit_v2(p_task,p_row);
  update tk_task set description=nullif(trim(p_row->>'description'),''),
    planned_duration_minutes=nullif(p_row->>'planned_duration_minutes','')::int,
    report_section=nullif(trim(p_row->>'report_section'),''),
    schedule_mode=coalesce(p_row->>'schedule_mode','fixed'),schedule_gap_minutes=coalesce((p_row->>'schedule_gap_minutes')::int,0) where id=p_task;
end $fn$;

create or replace function public.tk_task_plan_fields(t public.tk_task) returns jsonb
language sql stable as $fn$
  select jsonb_build_object('line',t.line,'h_ref',t.h_ref,'title',t.title,'kind',t.kind,
    'control',t.control,'lab_checkpoint',t.lab_checkpoint,'photos',t.photos,'ask',t.ask,
    'description',t.description,'pile',t.pile,'turner_pass',t.turner_pass,'suggested_at',t.suggested_at,'planned_duration_minutes',t.planned_duration_minutes,'report_section',t.report_section,'schedule_mode',t.schedule_mode,'schedule_gap_minutes',t.schedule_gap_minutes);
$fn$;
revoke all on function public.tk_task_plan_fields(public.tk_task) from public, anon, authenticated;

create or replace function public.tk_batch_plan_save(p_batch uuid,p_expected text,p_name text,p_note text,p_rows jsonb) returns int
language plpgsql security definer set search_path=public as $fn$
declare b tk_batch; snap jsonb; raw jsonb; r jsonb; old jsonb; previous tk_task; candidate tk_task;
  planned jsonb := '[]'::jsonb; ids uuid[] := '{}'::uuid[]; task_id uuid; n int := 0; shift_by int;
begin
  perform public.assert_role(array['admin']::app_role[], 'edit a batch plan');
  -- Batch FOR UPDATE also blocks concurrent FK inserts. Task locks serialize with
  -- start/finish/notes/photos/Lab/GM RPCs, which all use tk_task_for_update.
  select * into b from tk_batch where id=p_batch for update;
  if not found then raise exception 'No such batch.'; end if;
  if b.status <> 'active' then raise exception 'This batch is closed.'; end if;
  perform id from tk_task where batch_id=p_batch order by id for update;
  snap := public.tk_batch_plan_snapshot(p_batch);
  if p_expected is distinct from md5(snap::text) then
    raise exception 'This batch changed while you were editing. Nothing was saved. Reopen Edit batch and review the latest rows.';
  end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Give the batch a name.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be a list.'; end if;
  if jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'Use between 1 and 2000 task rows.'; end if;
  for raw in select value from jsonb_array_elements(p_rows) loop
    n := n+1;
    r := tk_clean_rows(jsonb_build_array(raw))->0;
    if r is null then raise exception 'Give row % a task name, or remove it.',n; end if;
    task_id := nullif(raw->>'id','')::uuid;
    if task_id = any(ids) then raise exception 'The same task appears twice. Use Duplicate to create a new row.'; end if;
    if task_id is not null then
      select * into previous from tk_task where id=task_id and batch_id=p_batch;
      if not found then raise exception 'A task does not belong to this batch.'; end if;
      if previous.pile is distinct from nullif(trim(raw->>'pile'),'')
        or previous.turner_pass is distinct from nullif(trim(raw->>'turner_pass'),'') then
        raise exception 'Keep an existing Turner task on its original pile and pass.';
      end if;
      ids := array_append(ids,task_id);
      if not raw ? 'schedule_mode' then raw:=raw || jsonb_build_object('schedule_mode',previous.schedule_mode); end if;
      if not raw ? 'schedule_gap_minutes' then raw:=raw || jsonb_build_object('schedule_gap_minutes',previous.schedule_gap_minutes); end if;
      if not raw ? 'planned_duration_minutes' then raw:=raw || jsonb_build_object('planned_duration_minutes',previous.planned_duration_minutes); end if;
      if not raw ? 'report_section' then raw:=raw || jsonb_build_object('report_section',previous.report_section); end if;
    end if;
    r := r || jsonb_build_object('id',task_id,'ord',n,
      'description',nullif(trim(raw->>'description'),''),'pile',nullif(trim(raw->>'pile'),''),
      'turner_pass',nullif(trim(raw->>'turner_pass'),''),'suggested_at',nullif(raw->>'suggested_at','')::timestamptz,
      'planned_duration_minutes',nullif(raw->>'planned_duration_minutes','')::int,
      'report_section',nullif(trim(raw->>'report_section'),''),
      'schedule_mode',coalesce(raw->>'schedule_mode','fixed'),'schedule_gap_minutes',coalesce((raw->>'schedule_gap_minutes')::int,0));
    candidate := jsonb_populate_record(null::tk_task,r);
    old := (select value from jsonb_array_elements(snap->'rows') where value->>'id'=task_id::text);
    if coalesce((old->>'_locked')::boolean,false)
      and tk_task_plan_fields(previous) is distinct from tk_task_plan_fields(candidate) then
      raise exception 'Row % has recorded work and cannot be changed.',n;
    end if;
    planned := planned || r;
  end loop;
  perform tk_validate_details(planned);
  for old in select value from jsonb_array_elements(snap->'rows') where (value->>'_locked')::boolean loop
    if not (old->>'id')::uuid = any(ids) then raise exception 'A task with recorded work cannot be removed.'; end if;
    -- Do not insert/reorder a new prerequisite ahead of work that has already
    -- started. Plain Lab records can happen any time and do not block a stream.
    if old->>'status'<>'todo' and old->>'kind' not in ('lab','lab_gate') and exists (
      select 1 from jsonb_array_elements(planned) p
      where (p->>'ord')::int < (select (x->>'ord')::int from jsonb_array_elements(planned) x where x->>'id'=old->>'id')
        and p->>'kind'<>'lab'
        and (case when old->>'pile' is not null then p->>'pile'=old->>'pile'
             else p->>'pile' is null and p->>'line'=old->>'line' end)
        and not exists (select 1 from jsonb_array_elements(snap->'rows') before_row
          where before_row->>'id'=p->>'id' and (before_row->>'ord')::int < (old->>'ord')::int
            and before_row->>'kind'<>'lab'
            and (case when old->>'pile' is not null then before_row->>'pile'=old->>'pile'
                 else before_row->>'pile' is null and before_row->>'line'=old->>'line' end))
    ) then raise exception 'Keep new or moved process tasks after recorded work in that stream.'; end if;
  end loop;

  delete from tk_task where batch_id=p_batch and not (id=any(ids));
  -- Move all ordinals above the old and new ranges to satisfy the unique key.
  select greatest(coalesce(max(ord),0),n)+1 into shift_by from tk_task where batch_id=p_batch;
  update tk_task set ord=ord+shift_by where batch_id=p_batch;
  for r in select value from jsonb_array_elements(planned) loop
    candidate := jsonb_populate_record(null::tk_task,r);
    if candidate.id is null then
      insert into tk_task(batch_id,ord,line,h_ref,title,kind,control,lab_checkpoint,photos,ask,
        description,pile,turner_pass,suggested_at,planned_duration_minutes,report_section,schedule_mode,schedule_gap_minutes,added_later)
      values(p_batch,candidate.ord,candidate.line,candidate.h_ref,candidate.title,candidate.kind,
        candidate.control,candidate.lab_checkpoint,candidate.photos,candidate.ask,candidate.description,
        candidate.pile,candidate.turner_pass,candidate.suggested_at,candidate.planned_duration_minutes,candidate.report_section,candidate.schedule_mode,candidate.schedule_gap_minutes,true);
    else
      update tk_task set ord=candidate.ord,line=candidate.line,h_ref=candidate.h_ref,title=candidate.title,
        kind=candidate.kind,control=candidate.control,lab_checkpoint=candidate.lab_checkpoint,
        photos=candidate.photos,ask=candidate.ask,description=candidate.description,
        suggested_at=candidate.suggested_at,planned_duration_minutes=candidate.planned_duration_minutes,report_section=candidate.report_section,schedule_mode=candidate.schedule_mode,schedule_gap_minutes=candidate.schedule_gap_minutes where id=candidate.id and batch_id=p_batch;
    end if;
  end loop;
  update tk_batch set name=trim(p_name),note=nullif(trim(p_note),'') where id=p_batch;
  perform tk_log('tk_batch_plan_edit','tk_batch',p_batch,jsonb_build_object(
    'before',snap,'after',tk_batch_plan_snapshot(p_batch)));
  return n;
end $fn$;
revoke all on function public.tk_batch_plan_get(uuid) from public,anon;
revoke all on function public.tk_batch_plan_save(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.tk_batch_plan_get(uuid) to authenticated;
grant execute on function public.tk_batch_plan_save(uuid,text,text,text,jsonb) to authenticated;

create or replace view public.tk_v_task_v3 with (security_invoker=on) as
select v.*,t.description,t.pile,t.turner_pass,t.planned_duration_minutes,t.report_section,t.schedule_mode,t.schedule_gap_minutes
from tk_v_task_v2 v join tk_task t on t.id=v.id;


notify pgrst,'reload schema';
