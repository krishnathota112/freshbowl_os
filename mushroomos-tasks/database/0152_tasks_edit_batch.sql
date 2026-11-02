-- Edit an existing batch's own plan atomically; never recreate recorded tasks.
-- Additive RPCs only. No existing rows or SOPs are changed by installation.
create function public.tk_batch_plan_snapshot(p_batch uuid) returns jsonb
language sql stable security definer set search_path=public as $fn$
  select jsonb_build_object('batch', to_jsonb(b), 'rows', coalesce((
    select jsonb_agg(to_jsonb(t) || jsonb_build_object('_locked',
      t.status <> 'todo' or t.started_at is not null or t.ended_at is not null
      or t.started_by is not null or t.ended_by is not null or t.start_source is not null
      or t.note is not null or t.answer is not null
      or exists(select 1 from tk_photo where task_id=t.id)
      or exists(select 1 from tk_reading where task_id=t.id)
      or exists(select 1 from tk_decision where task_id=t.id)) order by t.ord)
    from tk_task t where t.batch_id=b.id), '[]'::jsonb))
  from tk_batch b where b.id=p_batch;
$fn$;
revoke all on function public.tk_batch_plan_snapshot(uuid) from public, anon, authenticated;

-- Only plan fields are editable. Status, timestamps, answers and evidence are never supplied to UPDATE.
create function public.tk_task_plan_fields(t public.tk_task) returns jsonb
language sql stable as $fn$
  select jsonb_build_object('line',t.line,'h_ref',t.h_ref,'title',t.title,'kind',t.kind,
    'control',t.control,'lab_checkpoint',t.lab_checkpoint,'photos',t.photos,'ask',t.ask,
    'description',t.description,'pile',t.pile,'turner_pass',t.turner_pass,'suggested_at',t.suggested_at);
$fn$;
revoke all on function public.tk_task_plan_fields(public.tk_task) from public, anon, authenticated;

create function public.tk_batch_plan_get(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $fn$
declare snap jsonb;
begin
  perform public.assert_role(array['admin']::app_role[], 'edit a batch plan');
  snap := public.tk_batch_plan_snapshot(p_batch);
  if snap is null then raise exception 'No such batch.'; end if;
  return snap || jsonb_build_object('token',md5(snap::text));
end $fn$;

create function public.tk_batch_plan_save(p_batch uuid,p_expected text,p_name text,p_note text,p_rows jsonb) returns int
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
    end if;
    r := r || jsonb_build_object('id',task_id,'ord',n,
      'description',nullif(trim(raw->>'description'),''),'pile',nullif(trim(raw->>'pile'),''),
      'turner_pass',nullif(trim(raw->>'turner_pass'),''),'suggested_at',nullif(raw->>'suggested_at','')::timestamptz);
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
        description,pile,turner_pass,suggested_at,added_later)
      values(p_batch,candidate.ord,candidate.line,candidate.h_ref,candidate.title,candidate.kind,
        candidate.control,candidate.lab_checkpoint,candidate.photos,candidate.ask,candidate.description,
        candidate.pile,candidate.turner_pass,candidate.suggested_at,true);
    else
      update tk_task set ord=candidate.ord,line=candidate.line,h_ref=candidate.h_ref,title=candidate.title,
        kind=candidate.kind,control=candidate.control,lab_checkpoint=candidate.lab_checkpoint,
        photos=candidate.photos,ask=candidate.ask,description=candidate.description,
        suggested_at=candidate.suggested_at where id=candidate.id and batch_id=p_batch;
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
notify pgrst,'reload schema';
