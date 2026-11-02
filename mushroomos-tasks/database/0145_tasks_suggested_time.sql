-- 0145 · Optional suggested date/time for each SOP row.
-- The Admin enters calendar dates against an example H0. A batch shifts every suggestion to its own H0.
-- Suggestions never affect task eligibility or the Lab/GM gate.

alter table public.tk_sop add column reference_h0 timestamptz not null default now();
alter table public.tk_sop_row add column suggested_offset_minutes integer;
alter table public.tk_task add column suggested_at timestamptz;

-- The existing RPCs stay available to an older APK. The new client uses these additive RPCs.
create or replace function public.tk_apply_sop_schedule(p_sop uuid, p_rows jsonb, p_reference_h0 timestamptz)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_reference_h0 is null then raise exception 'Give the SOP an example H0.'; end if;
  update public.tk_sop set reference_h0 = p_reference_h0 where id = p_sop;
  with planned as (
    select row_number() over (order by x.ordinality)::int as ord,
           nullif(trim(x.value->>'suggested_offset_minutes'), '')::integer as offset_minutes
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as x(value, ordinality)
     where coalesce(trim(x.value->>'title'), '') <> ''
  )
  update public.tk_sop_row r set suggested_offset_minutes = p.offset_minutes
    from planned p where r.sop_id = p_sop and r.ord = p.ord;
end $fn$;
revoke all on function public.tk_apply_sop_schedule(uuid, jsonb, timestamptz) from public, anon, authenticated;

create or replace function public.tk_sop_create_v2(p_name text, p_note text, p_rows jsonb, p_reference_h0 timestamptz)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v uuid;
begin
  v := public.tk_sop_create(p_name, p_note, p_rows);
  perform public.tk_apply_sop_schedule(v, p_rows, p_reference_h0);
  perform public.tk_log('tk_sop_schedule', 'tk_sop', v, jsonb_build_object('reference_h0', p_reference_h0));
  return v;
end $fn$;

create or replace function public.tk_sop_save_v2(p_sop uuid, p_name text, p_note text, p_rows jsonb, p_reference_h0 timestamptz)
returns int language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  n := public.tk_sop_save(p_sop, p_name, p_note, p_rows);
  perform public.tk_apply_sop_schedule(p_sop, p_rows, p_reference_h0);
  perform public.tk_log('tk_sop_schedule', 'tk_sop', p_sop, jsonb_build_object('reference_h0', p_reference_h0, 'rows', n));
  return n;
end $fn$;

create or replace function public.tk_sop_new_version_v2(p_from uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v uuid;
begin
  v := public.tk_sop_new_version(p_from);
  update public.tk_sop n set reference_h0 = s.reference_h0 from public.tk_sop s where n.id = v and s.id = p_from;
  update public.tk_sop_row n set suggested_offset_minutes = s.suggested_offset_minutes
    from public.tk_sop_row s where n.sop_id = v and s.sop_id = p_from and n.ord = s.ord;
  return v;
end $fn$;

create or replace function public.tk_batch_create_v2(p_name text, p_sop uuid, p_h0 timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v uuid;
begin
  v := public.tk_batch_create(p_name, p_sop, p_h0, p_note);
  update public.tk_task t set suggested_at = b.h0 + r.suggested_offset_minutes * interval '1 minute'
    from public.tk_batch b join public.tk_sop_row r on r.sop_id = b.sop_id
   where b.id = v and t.batch_id = b.id and t.ord = r.ord and r.suggested_offset_minutes is not null;
  perform public.tk_log('tk_batch_schedule', 'tk_batch', v,
    jsonb_build_object('suggested_tasks', (select count(*) from public.tk_task where batch_id = v and suggested_at is not null)));
  return v;
end $fn$;

create or replace function public.tk_task_add_v2(p_batch uuid, p_after uuid, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v uuid; proposed timestamptz;
begin
  proposed := nullif(trim(p_row->>'suggested_at'), '')::timestamptz;
  v := public.tk_task_add(p_batch, p_after, p_row);
  update public.tk_task set suggested_at = proposed where id = v;
  perform public.tk_log('tk_task_schedule', 'tk_task', v, jsonb_build_object('suggested_at', proposed));
  return v;
end $fn$;

create or replace function public.tk_task_edit_v2(p_task uuid, p_row jsonb)
returns void language plpgsql security definer set search_path = public as $fn$
declare proposed timestamptz;
begin
  proposed := nullif(trim(p_row->>'suggested_at'), '')::timestamptz;
  perform public.tk_task_edit(p_task, p_row);
  update public.tk_task set suggested_at = proposed where id = p_task;
  perform public.tk_log('tk_task_schedule', 'tk_task', p_task, jsonb_build_object('suggested_at', proposed));
end $fn$;

create view public.tk_v_task_v2 with (security_invoker = on) as
select v.*, t.suggested_at from public.tk_v_task v join public.tk_task t on t.id = v.id;
grant select on public.tk_v_task_v2 to authenticated;

revoke all on function public.tk_sop_create_v2(text, text, jsonb, timestamptz) from public, anon;
revoke all on function public.tk_sop_save_v2(uuid, text, text, jsonb, timestamptz) from public, anon;
revoke all on function public.tk_sop_new_version_v2(uuid) from public, anon;
revoke all on function public.tk_batch_create_v2(text, uuid, timestamptz, text) from public, anon;
revoke all on function public.tk_task_add_v2(uuid, uuid, jsonb) from public, anon;
revoke all on function public.tk_task_edit_v2(uuid, jsonb) from public, anon;
grant execute on function public.tk_sop_create_v2(text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.tk_sop_save_v2(uuid, text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.tk_sop_new_version_v2(uuid) to authenticated;
grant execute on function public.tk_batch_create_v2(text, uuid, timestamptz, text) to authenticated;
grant execute on function public.tk_task_add_v2(uuid, uuid, jsonb) to authenticated;
grant execute on function public.tk_task_edit_v2(uuid, jsonb) to authenticated;
