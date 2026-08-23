-- 0016 · Recorded-actual timestamps. What the slip says, and when it was typed.
-- docs/PROCESS_V2_FACTORY_CONFIRMED.md §2, docs/TIME_CONTRACT.md §1, docs/DOMAIN_MODEL.md §5.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS — FACTORY BEHAVIOUR, NOT A DEMO AFFORDANCE
--
-- `PROCESS_V2 §2` specifies the per-load execution record, and it has these rows:
--
--     | Start    | 08:10  |
--     | End      | 08:19  |
--     | Duration | 9 min  |
--
-- Eleven loads, each with a start and an end, written on a slip at the weighbridge and typed in
-- afterwards. The truck does not wait for the phone. `submit_activity` had no way to say so: it
-- wrote `actual_start = coalesce(actual_start, now())` and `actual_end = now()`, so every activity
-- in the system was recorded as having finished at the moment somebody pressed Submit.
--
-- That is not a small inaccuracy. `variance_minutes` is GENERATED from `actual_end - planned_end_at`
-- and `duration_actual_min` from `actual_end - actual_start`, so both were measuring the operator's
-- typing rather than the factory's work. A nine-minute load transcribed an hour later read as a
-- nine-minute-late nothing.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- TWO CLOCKS, KEPT SEPARATE
--
--   actual_start / actual_end     WHEN THE WORK HAPPENED.   Stated by the person, or the server
--                                 clock when they state nothing.
--   actual_recorded_at            WHEN IT WAS TYPED.        Always the server clock. Never a
--                                 parameter, never a device clock.
--
-- Keeping both is the whole point: the trail distinguishes work from paperwork. A row where the two
-- are equal was recorded live; a row where they differ was transcribed, and by how much is visible
-- rather than inferred. `batch_activity_value` has carried exactly this pair since 0004 — column ④
-- of `DOMAIN_MODEL §5`'s six-column model is `actual_value, actual_recorded_at, actual_recorded_by`.
-- This puts the activity on the same footing as its fields.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THE SERVER REFUSES, AND WHY ONE RULE IS STRUCTURAL AND THE OTHER IS NOT
--
--   end before start   → a CHECK CONSTRAINT. Unwritable by ANY path, not only by this RPC. It is
--                        the same move A2 made for a negative baseline hour, and it is what
--                        "the server is the authority" means when the rule is time-independent.
--   a future timestamp → checked in the RPC. It CANNOT be a constraint: `now()` is not immutable,
--                        so Postgres will not accept it in a CHECK. Work that has not happened yet
--                        is not an actual.
--
-- NO TOLERANCE WINDOW on the future check. A tolerance would be a number nobody stated, and the
-- rule it would soften is the one that keeps a device clock out of the record.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ ONE CONSEQUENCE, STATED RATHER THAN BURIED
--
-- `evaluate_gates`' `ELAPSED_TIME` kind measures from `actual_start`. A backdated start therefore
-- reports a rest as having elapsed earlier than a live clock would — which is correct when the work
-- genuinely started then, and is a way to open a gate early when it did not.
--
-- What this migration does about it: the stated time and the typed time are both on the row, the
-- audit event carries both, and the server refuses anything in the future. What it does NOT do is
-- decide WHO may state an actual other than the present, or how far back. Nothing in `docs/` says,
-- and a limit would be an invented number. Reported, not chosen.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The entry clock.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.batch_activity
  add column if not exists actual_recorded_at timestamptz;

comment on column public.batch_activity.actual_recorded_at is
  'When the actuals were TYPED — server clock, never a parameter. actual_start/actual_end are when '
  'the work HAPPENED, which may be earlier: PROCESS_V2 §2 records a per-load start and end from a '
  'paper slip after the fact. Equal values mean it was recorded live.';

comment on column public.batch_activity.actual_start is
  'When the work started, as recorded. May be stated by the submitter (transcribed from a slip) or '
  'taken from the server clock. Never in the future. See actual_recorded_at for when it was typed.';

comment on column public.batch_activity.actual_end is
  'When the work ended, as recorded. Never in the future and never before actual_start — the second '
  'is a CHECK constraint, so no path can write an impossible pair.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · End before start is unwritable.
--
-- Reported before it is enforced: a bare `add constraint` on a violating table gives an error that
-- names the constraint and not the row, and the rows are the interesting part.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare bad text;
begin
  select string_agg(format('%s (%s) start=%s end=%s', ba.title, ba.scope_label,
                           ba.actual_start, ba.actual_end), E'\n  ')
    into bad
    from batch_activity ba
   where ba.actual_start is not null
     and ba.actual_end is not null
     and ba.actual_end < ba.actual_start;

  if bad is not null then
    raise exception
      'These activities already record an end before their start, so the constraint cannot be '
      'added. They are a real data defect and need a decision, not a widened rule:%s  %s',
      E'\n', bad;
  end if;
end $$;

alter table public.batch_activity
  drop constraint if exists batch_activity_actual_end_after_start;
alter table public.batch_activity
  add constraint batch_activity_actual_end_after_start
  check (actual_start is null or actual_end is null or actual_end >= actual_start);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · submit_activity accepts what the slip says.
--
-- The 3-argument form is DROPPED rather than left beside this one. Two overloads would make the
-- PostgREST call ambiguous, and the older one is the version that could only ever write the clock.
-- Both new parameters default to null, so every existing caller — positional or named — is
-- unaffected and keeps the live-clock behaviour it had.
--
-- Everything else is unchanged from 0012, deliberately: the six-column value recording, the
-- variance flags, out-of-range NEVER blocking a recording, the evidence gate on submission, and
-- the deviation holding the next activity in the same stream.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.submit_activity(uuid, jsonb, text);

create or replace function public.submit_activity(
  p_activity     uuid,
  p_values       jsonb       default '{}'::jsonb,
  p_remarks      text        default null,
  -- When the work HAPPENED. Null means "now", which is what a live recording is.
  p_actual_start timestamptz default null,
  p_actual_end   timestamptz default null
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
  -- The entry clock, read once so every row this call writes carries the same instant.
  entered_at  timestamptz := now();
  eff_start   timestamptz;
  eff_end     timestamptz;
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

  -- ── The recorded actuals are validated BEFORE anything is written ──────────
  -- A refusal must leave the row exactly as it was. Recording half a submission and then raising
  -- would be worse than refusing it, and out-of-range values are written further down.

  if p_actual_start is not null and p_actual_start > entered_at then
    raise exception
      'Cannot record a start of % for %: that is in the future. An actual is something that has '
      'already happened.', p_actual_start, ba.title
      using errcode = 'invalid_datetime_format';
  end if;

  if p_actual_end is not null and p_actual_end > entered_at then
    raise exception
      'Cannot record an end of % for %: that is in the future. An actual is something that has '
      'already happened.', p_actual_end, ba.title
      using errcode = 'invalid_datetime_format';
  end if;

  -- The EFFECTIVE pair, so a stated end earlier than an already-recorded start is refused too —
  -- start_activity may have written actual_start when the operator opened the card.
  eff_start := coalesce(p_actual_start, ba.actual_start);
  eff_end   := coalesce(p_actual_end, ba.actual_end);

  if eff_start is not null and eff_end is not null and eff_end < eff_start then
    raise exception
      'Cannot record % ending at % when it started at %: work does not end before it begins.',
      ba.title, eff_end, eff_start
      using errcode = 'invalid_datetime_format';
  end if;

  -- Record reality first. Out of range NEVER blocks recording.
  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;

    flag := 'not_applicable';

    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      -- Variance is measured against column ② (the Day-0 target) when the admin set one, falling
      -- back to column ① (the SOP band). docs/DOMAIN_MODEL.md §5.
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
           -- The field's own entry clock, the same instant as the activity's.
           actual_recorded_at = entered_at,
           actual_recorded_by = auth.uid(),
           variance_flag = flag,
           remarks = coalesce(nullif(p_remarks,''), remarks)
     where id = fld.id;
  end loop;

  -- Evidence gates SUBMISSION, not recording — and the gate table is what says so.
  select v.reason into outstanding
  from public.evaluate_gates(p_activity, 'exit') v
  where v.kind = 'EVIDENCE_COMPLETE' and v.verdict = 'fail'
  order by v.ordering
  limit 1;

  if outstanding is not null then
    -- Held on paperwork, so the state does not advance — but what the person REPORTED is kept.
    -- Discarding a stated time here would make them type it again, and the second typing would be
    -- a different number.
    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(p_actual_start, actual_start, entered_at),
           -- No `entered_at` fallback: with the submission held, an end nobody stated has not
           -- happened. Null stays null.
           actual_end = coalesce(p_actual_end, actual_end),
           actual_recorded_at = entered_at,
           blocked_reason = null
     where id = p_activity;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                             after_state, reason)
    values (auth.uid(), public.current_app_role(), 'submit_blocked_on_evidence',
            'batch_activity', p_activity::text,
            jsonb_build_object('actual_start', p_actual_start, 'actual_end', p_actual_end,
                               'recorded_at', entered_at),
            outstanding);

    return query select 'IN_PROGRESS'::text, dev_count, outstanding;
    return;
  end if;

  update batch_activity
     set state = case when dev_count > 0 then 'DEVIATION'::activity_state
                      else 'COMPLETED'::activity_state end,
         actual_start = coalesce(p_actual_start, actual_start, entered_at),
         -- `actual_end` before `entered_at`: a stated end from an earlier held submission is kept
         -- rather than overwritten by the clock of the call that finally clears the evidence gate.
         actual_end = coalesce(p_actual_end, actual_end, entered_at),
         actual_recorded_at = entered_at,
         submitted_at = entered_at,
         submitted_by = auth.uid(),
         blocked_reason = case when dev_count > 0
           then rtrim(reasons, '; ') || ' — held for supervisor review' end
   where id = p_activity;

  -- The trail carries BOTH clocks, so "when the work happened" and "when it was typed" are
  -- reconstructable from the event history alone rather than only from the current row.
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           after_state, reason)
  select auth.uid(), public.current_app_role(), 'submit_activity', 'batch_activity',
         p_activity::text,
         jsonb_build_object(
           'actual_start', cur.actual_start,
           'actual_end', cur.actual_end,
           'recorded_at', cur.actual_recorded_at,
           'duration_actual_min', cur.duration_actual_min,
           'variance_minutes', cur.variance_minutes,
           'stated_by_submitter', (p_actual_start is not null or p_actual_end is not null)),
         case when dev_count > 0 then 'DEVIATION · ' || rtrim(reasons,'; ')
              else coalesce(nullif(p_remarks,''), 'submitted') end
    from batch_activity cur where cur.id = p_activity;

  if dev_count = 0 then
    perform public.advance_batch(ba.master_batch_id);
  else
    -- A deviation holds the line. Whatever comes next in the SAME stream stops and says which
    -- activity stopped it. Not the whole batch — the parallel streams are independent and
    -- blocking them would be a lie about what is wrong. B2 replaces this with a real deviation.
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

revoke execute on function
  public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz) from anon;
grant execute on function
  public.submit_activity(uuid, jsonb, text, timestamptz, timestamptz) to authenticated;
