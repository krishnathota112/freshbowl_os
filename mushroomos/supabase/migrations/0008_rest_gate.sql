-- 0008 · The rest gate, made to actually open.
--
-- Three defects, all in the same beat:
--
--   1. Nothing ever set actual_start on a rest, and release_elapsed_rests required it.
--      The countdown could reach 00:00 and the window would never open.
--   2. make_interval(hours => day0_duration_hr::int) truncates to whole hours, so a
--      3-minute rest (0.05 h) became ZERO and opened instantly.
--   3. There was no stored moment the gate opens, so the client had to guess the countdown.
--
-- The fix keeps the authority where it belongs: the SERVER decides, from its own clock and
-- the Day-0 duration. The client only ever asks.

alter table public.batch_activity
  add column if not exists unblocks_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- advance_batch · the single place activity state moves forward.
--
-- Idempotent and safe to call repeatedly — it is a function of current state, not a
-- sequence of events. A late poll, a double click and a cron tick all produce the same
-- result. docs/ARCHITECTURE_V2.md §3.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.advance_batch(p_batch uuid)
returns table (opened int, resting int)
language plpgsql security definer set search_path = public as $$
declare
  n_opened  int := 0;
  n_resting int := 0;
begin
  -- 1 · A rest window that has elapsed opens. Compared against now() on the SERVER, so a
  --     device with a wrong clock changes nothing.
  with due as (
    select id from batch_activity
    where master_batch_id = p_batch
      and state = 'WAITING_TIME'
      and unblocks_at is not null
      and now() >= unblocks_at
  )
  update batch_activity
     set state = 'READY', blocked_reason = null
   where id in (select id from due);
  get diagnostics n_opened = row_count;

  -- 2 · Work whose earlier days are all finished becomes available. A rest does not become
  --     READY — it starts RESTING, and its clock starts now.
  --
  --     Both LOCKED and WAITING_TIME are considered. generate_activity_plan parks rests
  --     directly in WAITING_TIME with no unblocks_at, so a rest can be sitting in the
  --     resting state with no clock running at all — which is precisely the bug that made
  --     the countdown reach zero and nothing happen.
  with eligible as (
    select ba.id, ba.is_time_gate, ba.day0_duration_hr, ba.title
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and (ba.state = 'LOCKED'
           or (ba.state = 'WAITING_TIME' and ba.unblocks_at is null))
      and not exists (
        select 1 from batch_activity earlier
        where earlier.master_batch_id = ba.master_batch_id
          and earlier.rel_day < ba.rel_day
          and earlier.state not in ('COMPLETED','SKIPPED')
      )
  )
  update batch_activity ba
     set state = case when e.is_time_gate then 'WAITING_TIME'::activity_state
                      else 'READY'::activity_state end,
         actual_start = case when e.is_time_gate then coalesce(ba.actual_start, now())
                             else ba.actual_start end,
         -- Seconds, not hours. A 3-minute rest is 180 s, not 0 h.
         unblocks_at = case
           when e.is_time_gate and e.day0_duration_hr is not null
             then coalesce(ba.actual_start, now())
                  + make_interval(secs => (e.day0_duration_hr * 3600)::int)
           else ba.unblocks_at end,
         blocked_reason = case
           when e.is_time_gate then
             'Resting — ' ||
             case when e.day0_duration_hr >= 1
                  then round(e.day0_duration_hr, 2)::text || ' h required'
                  else round(e.day0_duration_hr * 60)::text || ' min required' end
           else null end
    from eligible e
   where ba.id = e.id;
  get diagnostics n_resting = row_count;

  return query select n_opened, n_resting;
end;
$$;

-- Kept under its original name so existing callers keep working. It is now the poll entry
-- point: the client asks, this decides.
create or replace function public.release_elapsed_rests(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.advance_batch(p_batch);
  return coalesce(r.opened, 0) + coalesce(r.resting, 0);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Activation now starts the clock on anything already resting, and submit_activity hands
-- off to advance_batch instead of carrying its own copy of the unlock rule.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.activate_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare blockers text;
begin
  select string_agg(message, '; ') into blockers
  from public.validate_batch(p_batch_id) where severity = 'blocking';

  if blockers is not null then
    raise exception 'Cannot activate — %', left(blockers, 400) using errcode = 'check_violation';
  end if;

  update master_batch
     set status = 'active', activated_at = now(), activated_by = auth.uid()
   where id = p_batch_id and status = 'draft';

  -- The earliest day's work opens.
  update batch_activity ba
     set state = case when ba.is_time_gate then 'WAITING_TIME'::activity_state
                      else 'READY'::activity_state end,
         actual_start = case when ba.is_time_gate then now() else ba.actual_start end,
         unblocks_at = case
           when ba.is_time_gate and ba.day0_duration_hr is not null
             then now() + make_interval(secs => (ba.day0_duration_hr * 3600)::int)
           else ba.unblocks_at end,
         blocked_reason = case when ba.is_time_gate then 'Resting — window running' end
   where ba.master_batch_id = p_batch_id
     and ba.rel_day = (select min(rel_day) from batch_activity where master_batch_id = p_batch_id);

  insert into notification (master_batch_id, to_role, kind, message, sent_by)
  select p_batch_id, ba.responsible_role, 'gate_opened', ba.title || ' is ready', auth.uid()
  from batch_activity ba
  where ba.master_batch_id = p_batch_id and ba.state = 'READY';

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'activate_batch', 'master_batch',
          p_batch_id::text, 'Baseline frozen');
end;
$$;

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
  target      numeric;
  target_src  text;
  dev_count   int := 0;
  reasons     text := '';
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

  -- Record reality first. Out of range NEVER blocks recording.
  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;

    flag := 'not_applicable';

    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      -- Variance is measured against column ② (the Day-0 target) when the admin set one,
      -- falling back to column ① (the SOP band). docs/DOMAIN_MODEL.md §5.
      --
      -- This matters on Day 0–1, where the sources give NO SOP bound and inventing one
      -- would be the exact failure this product exists to prevent. The Day-0 target is a
      -- real number a person chose, so it is the honest thing to measure against.
      target := null;
      target_src := null;

      if fld.day0_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
        target := fld.day0_value::numeric;
        target_src := 'the Day-0 plan';
      elsif ba.planned_qty_mt is not null and k like '%qty%' then
        target := ba.planned_qty_mt;
        target_src := 'the Day-0 plan';
      end if;

      if fld.sop_min is not null or fld.sop_max is not null then
        if (fld.sop_min is not null and v::numeric < fld.sop_min)
           or (fld.sop_max is not null and v::numeric > fld.sop_max) then
          flag := 'out_of_range';
          dev_count := dev_count + 1;
          reasons := reasons || fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                     || ' outside the SOP band ' || coalesce(fld.sop_min::text,'')
                     || '–' || coalesce(fld.sop_max::text,'') || '; ';
        else
          flag := 'in_range';
        end if;

      elsif target is not null and target > 0 then
        -- No SOP band exists. Compare against what was planned, and say so plainly.
        if abs(v::numeric - target) / target > 0.10 then
          flag := 'out_of_range';
          dev_count := dev_count + 1;
          reasons := reasons || fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                     || ' against ' || target || coalesce(' ' || fld.unit,'')
                     || ' in ' || target_src || ' ('
                     || case when v::numeric > target then '+' else '' end
                     || round(v::numeric - target, 2) || '); ';
        else
          flag := 'in_range';
        end if;
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

  -- Evidence gates SUBMISSION, not recording.
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
         blocked_reason = case when dev_count > 0
           then rtrim(reasons, '; ') || ' — held for supervisor review' end
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'submit_activity', 'batch_activity',
          p_activity::text,
          case when dev_count > 0 then 'DEVIATION · ' || rtrim(reasons,'; ')
               else coalesce(nullif(p_remarks,''), 'submitted') end);

  -- A deviation holds the line: nothing downstream advances until it is resolved.
  if dev_count = 0 then
    perform public.advance_batch(ba.master_batch_id);
  else
    -- A deviation holds the line. Whatever comes next in the same stream stops, and says
    -- which activity stopped it and why. Not the whole batch — the parallel streams are
    -- independent and blocking them would be a lie about what is wrong.
    update batch_activity nxt
       set state = 'BLOCKED',
           blocked_reason = 'Blocked — ' || ba.title || ' (' || ba.scope_label
                            || ') is in deviation: ' || rtrim(reasons, '; ')
     where nxt.master_batch_id = ba.master_batch_id
       and nxt.stream = ba.stream
       and nxt.seq > ba.seq
       and nxt.state in ('LOCKED','READY','WAITING_TIME')
       and nxt.seq = (
         select min(n2.seq) from batch_activity n2
         where n2.master_batch_id = ba.master_batch_id
           and n2.stream = ba.stream
           and n2.seq > ba.seq
           and n2.state in ('LOCKED','READY','WAITING_TIME')
       );
  end if;

  return query
    select (select state::text from batch_activity where id = p_activity), dev_count, null::text;
end;
$$;

grant execute on function public.advance_batch(uuid) to authenticated;
grant execute on function public.release_elapsed_rests(uuid) to authenticated;
grant execute on function public.submit_activity(uuid, jsonb, text) to authenticated;
