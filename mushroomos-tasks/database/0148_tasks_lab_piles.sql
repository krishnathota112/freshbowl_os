-- Explicit task descriptions and Turner-only pile identity. Existing data stays intact.
alter table public.tk_sop_row add column description text, add column pile text, add column turner_pass text;
alter table public.tk_task add column description text, add column pile text, add column turner_pass text;

create function public.tk_validate_details(p_rows jsonb) returns void
language plpgsql immutable set search_path=public as $fn$
declare r jsonb; p text; pass text;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'title'),'') = '' then continue; end if;
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

create function public.tk_sop_details(p_sop uuid, p_rows jsonb) returns void
language sql security definer set search_path=public as $fn$
  with input as (
    select row_number() over(order by x.ordinality) n, x.value r
    from jsonb_array_elements(p_rows) with ordinality x(value,ordinality)
    where coalesce(trim(x.value->>'title'),'') <> ''
  ) update tk_sop_row s set description=nullif(trim(input.r->>'description'),''),
      pile=nullif(trim(input.r->>'pile'),''), turner_pass=nullif(trim(input.r->>'turner_pass'),'')
    from input where s.sop_id=p_sop and s.ord=input.n;
$fn$;
revoke all on function public.tk_sop_details(uuid,jsonb) from public, anon, authenticated;

create function public.tk_sop_create_v3(p_name text,p_note text,p_rows jsonb,p_reference_h0 timestamptz) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  perform public.tk_validate_details(p_rows);
  v_id:=public.tk_sop_create_v2(p_name,p_note,p_rows,p_reference_h0);
  perform public.tk_sop_details(v_id,p_rows); return v_id;
end $fn$;
create function public.tk_sop_save_v3(p_sop uuid,p_name text,p_note text,p_rows jsonb,p_reference_h0 timestamptz) returns int
language plpgsql security definer set search_path=public as $fn$
declare n int;
begin
  perform public.tk_validate_details(p_rows);
  n:=public.tk_sop_save_v2(p_sop,p_name,p_note,p_rows,p_reference_h0);
  perform public.tk_sop_details(p_sop,p_rows); return n;
end $fn$;
create function public.tk_sop_new_version_v3(p_from uuid) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  v_id:=public.tk_sop_new_version_v2(p_from);
  update tk_sop_row n set description=s.description,pile=s.pile,turner_pass=s.turner_pass
    from tk_sop_row s where n.sop_id=v_id and s.sop_id=p_from and n.ord=s.ord;
  return v_id;
end $fn$;
create function public.tk_batch_create_plan_v3(p_name text,p_sop uuid,p_h0 timestamptz,p_note text,p_rows jsonb) returns uuid
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
      pile=nullif(trim(input.r->>'pile'),''),turner_pass=nullif(trim(input.r->>'turner_pass'),'')
    from input where t.batch_id=v_id and t.ord=input.n;
  return v_id;
end $fn$;
create function public.tk_task_add_v3(p_batch uuid,p_after uuid,p_row jsonb) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v_id uuid;
begin
  perform public.tk_validate_details(jsonb_build_array(p_row));
  v_id:=public.tk_task_add_v2(p_batch,p_after,p_row);
  update tk_task set description=nullif(trim(p_row->>'description'),''),pile=nullif(trim(p_row->>'pile'),''),turner_pass=nullif(trim(p_row->>'turner_pass'),'') where tk_task.id=v_id;
  return v_id;
end $fn$;
create function public.tk_task_edit_v3(p_task uuid,p_row jsonb) returns void
language plpgsql security definer set search_path=public as $fn$
declare old tk_task;
begin
  perform public.assert_role(array['admin']::app_role[], 'change a task');
  old:=public.tk_task_for_update(p_task);
  -- Pile identity stays fixed after creation, so photos cannot silently change piles.
  p_row:=p_row || jsonb_build_object('pile',old.pile,'turner_pass',old.turner_pass);
  perform public.tk_validate_details(jsonb_build_array(p_row));
  perform public.tk_task_edit_v2(p_task,p_row);
  update tk_task set description=nullif(trim(p_row->>'description'),'') where id=p_task;
end $fn$;

-- A pile's previous work blocks only that pile. Lab records remain non-blocking.
create or replace function public.tk_blocker(p_task uuid) returns uuid
language sql stable security definer set search_path=public as $fn$
  select e.id from tk_task t join tk_task e on e.batch_id=t.batch_id and e.ord<t.ord
    and ((t.pile is not null and e.pile=t.pile) or (t.pile is null and e.pile is null and e.line=t.line))
  where t.id=p_task and e.kind<>'lab' and e.status not in ('done','done_before') order by e.ord limit 1;
$fn$;
create view public.tk_v_task_v3 with (security_invoker=on) as
select v.*, t.description, t.pile, t.turner_pass from tk_v_task_v2 v join tk_task t on t.id=v.id;
grant select on public.tk_v_task_v3 to authenticated;
do $grant$
declare f text;
begin
  foreach f in array array['tk_sop_create_v3(text,text,jsonb,timestamptz)','tk_sop_save_v3(uuid,text,text,jsonb,timestamptz)',
    'tk_sop_new_version_v3(uuid)','tk_batch_create_plan_v3(text,uuid,timestamptz,text,jsonb)',
    'tk_task_add_v3(uuid,uuid,jsonb)','tk_task_edit_v3(uuid,jsonb)'] loop
    execute 'revoke all on function public.'||f||' from public,anon';
    execute 'grant execute on function public.'||f||' to authenticated';
  end loop;
end $grant$;
notify pgrst,'reload schema';
