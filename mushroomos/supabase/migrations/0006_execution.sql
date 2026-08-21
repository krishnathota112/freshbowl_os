-- 0006 · Execution. Adds the columns the operator flow needs and one submit path.
--
-- Reconciles two generators that existed side by side: generate_activity_plan (0005) is
-- kept, and the duplicates are dropped so there is exactly one way to build a plan and
-- exactly one way to activate.

drop function if exists public.generate_batch_plan(uuid);
drop function if exists public.activate_batch(uuid, uuid);
drop function if exists public.fn_instance_count(jsonb, jsonb);
drop function if exists public.fn_config_number(jsonb, text);
drop function if exists public.fn_scope_count_field(activity_scope);
drop function if exists public.submit_activity(uuid, jsonb, text, uuid);
drop function if exists public.mark_evidence(uuid, uuid);

alter table public.batch_activity
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id),
  add column if not exists instance_count int;

alter table public.batch_activity_value
  add column if not exists variance_flag text,
  add column if not exists actual_recorded_at timestamptz,
  add column if not exists actual_recorded_by uuid references public.profiles(id);

alter table public.batch_activity_evidence_req
  add column if not exists satisfied_count int not null default 0;

update public.batch_activity ba
   set instance_count = c.n
  from (select master_batch_id, process_activity_id, count(*) n
        from public.batch_activity group by 1,2) c
 where c.master_batch_id = ba.master_batch_id
   and c.process_activity_id = ba.process_activity_id
   and ba.instance_count is null;

-- Every non-actionable state must explain itself. docs/WORKFLOW_MODEL.md §2.1
alter table public.batch_activity drop constraint if exists batch_activity_reason_required;
alter table public.batch_activity add constraint batch_activity_reason_required check (
  state not in ('LOCKED','WAITING_TIME','WAITING_CONDITION','AWAITING_LAB','BLOCKED','DEVIATION')
  or coalesce(blocked_reason,'') <> ''
);

-- ─────────────────────────────────────────────────────────────────────────────
-- mark_evidence · satisfies one NAMED requirement.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_evidence(p_req uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update batch_activity_evidence_req
     set satisfied_count = least(satisfied_count + 1, min_count)
   where id = p_req
  returning satisfied_count into n;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'mark_evidence',
          'batch_activity_evidence_req', p_req::text, 'Named evidence requirement satisfied');
  return coalesce(n, 0);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- submit_activity
--
-- Out-of-range NEVER blocks recording. It records the value, flags the variance and holds
-- the activity for a supervisor. Evidence gates SUBMISSION, not recording: an operator with
-- a dead camera can still record the reading.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_activity(
  p_activity uuid,
  p_values   jsonb default '{}'::jsonb,
  p_remarks  text  default null
) returns table (new_state text, out_of_range int, outstanding_evidence text)
language plpgsql security definer set search_path = public as $$
declare
  ba          batch_activity;
  b           master_batch;
  k           text;
  v           text;
  fld         batch_activity_value;
  flag        text;
  dev_count   int := 0;
  outstanding text;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  select * into b from master_batch where id = ba.master_batch_id;
  if b.status <> 'active' then
    raise exception 'Batch % is % — activate it before recording work', b.code, b.status;
  end if;
  if ba.state not in ('READY','IN_PROGRESS','RETURNED') then
    raise exception '% is %, so it cannot be submitted', ba.title, ba.state;
  end if;

  -- Record reality first, in range or not.
  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;

    flag := 'not_applicable';
    if v ~ '^-?[0-9]+(\.[0-9]+)?$' and (fld.sop_min is not null or fld.sop_max is not null) then
      if (fld.sop_min is not null and v::numeric < fld.sop_min)
         or (fld.sop_max is not null and v::numeric > fld.sop_max) then
        flag := 'out_of_range';
        dev_count := dev_count + 1;
      else
        flag := 'in_range';
      end if;
    end if;

    update batch_activity_value
       set actual_value = v,
           actual_recorded_at = now(),
           actual_recorded_by = auth.uid(),
           variance_flag = flag,
           remarks = coalesce(nullif(p_remarks,''), remarks)
     where id = fld.id;
  end loop;

  select string_agg(label, ', ' order by ordering) into outstanding
  from batch_activity_evidence_req
  where batch_activity_id = p_activity
    and gates_submission and satisfied_count < min_count;

  if outstanding is not null then
    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(actual_start, now()),
           blocked_reason = null
     where id = p_activity;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
    values (auth.uid(), public.current_app_role(), 'submit_blocked_on_evidence',
            'batch_activity', p_activity::text, 'Outstanding: ' || outstanding);

    return query select 'IN_PROGRESS'::text, dev_count, outstanding;
    return;
  end if;

  update batch_activity
     set state = case when dev_count > 0 then 'DEVIATION'::activity_state
                      else 'COMPLETED'::activity_state end,
         actual_start = coalesce(actual_start, now()),
         actual_end = now(),
         submitted_at = now(),
         submitted_by = auth.uid(),
         blocked_reason = case when dev_count > 0 then
           dev_count || ' recorded value(s) outside the SOP band — held for supervisor review'
         end
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'submit_activity', 'batch_activity',
          p_activity::text, coalesce(nullif(p_remarks,''), 'submitted'));

  -- Open what this unblocks. A day opens once every earlier day is done.
  update batch_activity nxt
     set state = 'READY', blocked_reason = null
   where nxt.master_batch_id = ba.master_batch_id
     and nxt.state = 'LOCKED'
     and not exists (
       select 1 from batch_activity earlier
       where earlier.master_batch_id = nxt.master_batch_id
         and earlier.rel_day < nxt.rel_day
         and earlier.state not in ('COMPLETED','SKIPPED')
     );

  return query
    select (select state::text from batch_activity where id = p_activity), dev_count, null::text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- start_activity · opens the clock. Server timestamp, never the device's.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.start_activity(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update batch_activity
     set state = 'IN_PROGRESS',
         actual_start = coalesce(actual_start, now()),
         blocked_reason = null
   where id = p_activity and state in ('READY','RETURNED');

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'start_activity', 'batch_activity',
          p_activity::text, 'Work started');
end;
$$;

-- Rest periods: opening the gate is a function of the SERVER clock and the Day-0 duration.
-- A phone set 48 h forward cannot open a 48 h gate.
create or replace function public.release_elapsed_rests(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select ba.id
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and ba.state = 'WAITING_TIME'
      and ba.day0_duration_hr is not null
      and ba.actual_start is not null
      and now() >= ba.actual_start + make_interval(hours => ba.day0_duration_hr::int)
  )
  update batch_activity set state = 'READY', blocked_reason = null
   where id in (select id from due);
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_evidence(uuid) to authenticated;
grant execute on function public.submit_activity(uuid, jsonb, text) to authenticated;
grant execute on function public.start_activity(uuid) to authenticated;
grant execute on function public.release_elapsed_rests(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['batch_activity','batch_activity_value','batch_activity_evidence_req']
  loop
    execute format('drop policy if exists batch_read on public.%I', t);
    execute format('create policy batch_read on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;
