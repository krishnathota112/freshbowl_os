-- ─────────────────────────────────────────────────────────────────────────────
-- 0049 · Actuals are append-only. ARCH-001, and the last leak in the central claim.
--
-- THE DEFECT, AS DEPLOYED
--   submit_activity, from 0016:
--
--       actual_start = coalesce(p_actual_start, actual_start, entered_at),
--       actual_end   = coalesce(p_actual_end,   actual_end,   entered_at)
--
--   The CALLER'S PARAMETER WINS OVER THE STORED VALUE. A live path, through the supported RPC,
--   granted to `authenticated`, that lets somebody restate the past — set an actual, then set it
--   again to something more flattering, with the first value gone and nothing recording that it
--   ever existed.
--
--   CLAUDE.md's opening claim is that it must be HARD TO RETROACTIVELY MAKE A LATE ACTIVITY LOOK
--   ON TIME. 0034 closed the plan side of that. This is the other side, and until it closes the
--   product's central guarantee is one UPDATE wide.
--
-- WHAT "APPEND-ONLY" MEANS HERE, PRECISELY
--   · Writing an actual that is currently null is normal execution. Always allowed.
--   · Changing an actual that already has a value is a CORRECTION. It requires a reason, it is
--     recorded with the old value beside the new one, and it names who did it.
--   · Nulling an actual is refused outright. There is no legitimate "un-happen".
--
--   So the original is never lost. `actual_correction` is the superseding record — the same shape
--   `evidence_media.superseded_by_id` already uses, which is the one place in this codebase that
--   was already doing corrections correctly.
--
-- WHY A TRIGGER AND NOT A CHECK IN submit_activity
--   F1's lesson, stated in FINDINGS: a guard in the writer protects the one path somebody
--   remembered. `repoint_batch_activities` was granted to `anon` and `PUBLIC` and nobody knew.
--   The table is the boundary. `submit_activity` is corrected too, but the table is what makes
--   the claim true for paths nobody has thought of yet.
--
-- WHY A TRANSACTION-LOCAL SETTING AND NOT A COLUMN
--   The reason has to reach the trigger, and the trigger fires on an UPDATE that carries no place
--   to put one. `correct_actual` sets `mushroomos.correction_reason` for the transaction; the
--   trigger reads it, records it, and every other path finds it empty and is refused. A caller
--   cannot set it without going through the RPC, because the RPC is where the role check is.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The superseding record. ─────────────────────────────────────────────

create table if not exists public.actual_correction (
  id                uuid primary key default gen_random_uuid(),
  batch_activity_id uuid not null references public.batch_activity(id) on delete cascade,
  master_batch_id   uuid not null references public.master_batch(id) on delete cascade,
  field             text not null check (field in ('actual_start', 'actual_end')),
  previous_value    timestamptz not null,
  new_value         timestamptz not null,
  reason            text not null check (length(trim(reason)) >= 10),
  corrected_by      uuid,
  corrected_role    public.app_role,
  corrected_at      timestamptz not null default now()
);

comment on table public.actual_correction is
  'Every change to an actual that already had a value. The ORIGINAL survives here — this table is '
  'what makes "actuals are append-only" true rather than aspirational. Append-only itself. 0049.';

create index if not exists actual_correction_activity_idx
  on public.actual_correction (batch_activity_id, corrected_at desc);

alter table public.actual_correction enable row level security;

drop policy if exists actual_correction_read on public.actual_correction;
create policy actual_correction_read on public.actual_correction
  for select to authenticated using (true);

-- No write policy, and none is coming. Rows appear only from the trigger below, which runs as the
-- table owner inside a SECURITY DEFINER path.
revoke insert, update, delete on public.actual_correction from authenticated, anon;
grant select on public.actual_correction to authenticated;

-- The correction log is itself append-only, or it is just a second place to rewrite history.
create or replace function public.fn_correction_is_append_only()
returns trigger language plpgsql as $fn$
begin
  raise exception
    'actual_correction is append-only. A correction of a correction is another correction — '
    'call correct_actual again.'
    using errcode = 'check_violation';
end;
$fn$;

drop trigger if exists trg_correction_is_append_only on public.actual_correction;
create trigger trg_correction_is_append_only
  before update or delete on public.actual_correction
  for each row execute function public.fn_correction_is_append_only();


-- ── 2 · The table refuses to forget. ────────────────────────────────────────

create or replace function public.fn_actual_is_append_only()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  reason text := nullif(trim(coalesce(current_setting('mushroomos.correction_reason', true), '')), '');
  f      text;
  oldv   timestamptz;
  newv   timestamptz;
begin
  foreach f in array array['actual_start', 'actual_end'] loop
    if f = 'actual_start' then
      oldv := old.actual_start; newv := new.actual_start;
    else
      oldv := old.actual_end;   newv := new.actual_end;
    end if;

    -- Unchanged, or being set for the first time. Normal execution.
    if oldv is null or newv is not distinct from oldv then
      continue;
    end if;

    -- There is no "un-happen".
    if newv is null then
      raise exception
        'Cannot clear %.% on %: an actual that has been recorded cannot become unknown. If it was '
        'recorded in error, correct it to the right value with correct_actual and state why.',
        'batch_activity', f, old.title
        using errcode = 'check_violation';
    end if;

    if reason is null then
      raise exception
        'Refusing to overwrite %.% on % (% -> %). An actual that has been recorded is history. '
        'To change it, call correct_actual(activity, ''%'', new_value, reason) — the original is '
        'kept and the correction names who made it and why.',
        'batch_activity', f, old.title, oldv, newv, f
        using errcode = 'check_violation';
    end if;

    insert into actual_correction
      (batch_activity_id, master_batch_id, field, previous_value, new_value,
       reason, corrected_by, corrected_role)
    values
      (old.id, old.master_batch_id, f, oldv, newv,
       reason, auth.uid(), public.current_app_role());
  end loop;

  return new;
end;
$fn$;

drop trigger if exists trg_actual_is_append_only on public.batch_activity;
create trigger trg_actual_is_append_only
  before update of actual_start, actual_end on public.batch_activity
  for each row execute function public.fn_actual_is_append_only();


-- ── 3 · The one path that may change one. ───────────────────────────────────

create or replace function public.correct_actual(
  p_activity uuid,
  p_field    text,
  p_value    timestamptz,
  p_reason   text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  ba  batch_activity;
  b   master_batch;
  cur timestamptz;
begin
  -- NOT the operator. Correcting the record is a supervisory act, and the person whose work is
  -- late is not the person who should be able to restate when it finished.
  perform public.assert_role(array['supervisor','manager','gm','admin']::app_role[],
                             'correct a recorded actual');

  if p_field not in ('actual_start', 'actual_end') then
    raise exception 'correct_actual handles actual_start and actual_end, not %', p_field
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception
      'A correction needs a reason of at least ten characters. "typo" does not tell anyone reading '
      'this batch in six months what actually happened.'
      using errcode = 'check_violation';
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  select * into b from master_batch where id = ba.master_batch_id;

  if p_value is null then
    raise exception 'A correction must state a value. Clearing an actual is not a correction.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_value > now() then
    raise exception
      'Cannot correct % to %: that is in the future. An actual is something that has already '
      'happened.', ba.title, p_value
      using errcode = 'invalid_datetime_format';
  end if;
  if b.start_at is not null and p_value < b.start_at then
    raise exception
      'Cannot correct % to %: the batch begins at % and nothing in it happens before that.',
      ba.title, p_value, b.start_at
      using errcode = 'invalid_datetime_format';
  end if;

  cur := case when p_field = 'actual_start' then ba.actual_start else ba.actual_end end;
  if cur is null then
    raise exception
      'There is nothing to correct: % has no % recorded. Record it through the normal execution '
      'path instead.', ba.title, p_field
      using errcode = 'check_violation';
  end if;
  if cur = p_value then
    return;                                    -- idempotent; not a correction.
  end if;

  -- Ordering still has to hold after the correction, or a supervisor can produce an activity that
  -- ended before it began by fixing one half of the pair.
  if p_field = 'actual_start' and ba.actual_end is not null and ba.actual_end < p_value then
    raise exception
      'Cannot move the start of % to %: it is already recorded as ending at %, and work does not '
      'end before it begins. Correct the end first.', ba.title, p_value, ba.actual_end
      using errcode = 'invalid_datetime_format';
  end if;
  if p_field = 'actual_end' and ba.actual_start is not null and p_value < ba.actual_start then
    raise exception
      'Cannot move the end of % to %: it is recorded as starting at %, and work does not end '
      'before it begins.', ba.title, p_value, ba.actual_start
      using errcode = 'invalid_datetime_format';
  end if;

  perform set_config('mushroomos.correction_reason', p_reason, true);

  if p_field = 'actual_start' then
    update batch_activity set actual_start = p_value where id = p_activity;
  else
    update batch_activity set actual_end = p_value where id = p_activity;
  end if;

  -- Cleared immediately. Leaving it set would let any LATER update in the same transaction
  -- overwrite a different actual under a reason written for this one.
  perform set_config('mushroomos.correction_reason', '', true);

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'correct_actual', 'batch_activity',
          p_activity::text, p_field || ': ' || p_reason);
end;
$fn$;

revoke execute on function public.correct_actual(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.correct_actual(uuid, text, timestamptz, text) to authenticated;

comment on function public.correct_actual(uuid, text, timestamptz, text) is
  'The ONLY path that may change an actual that already has a value. Supervisor and above, reason '
  'mandatory, original preserved in actual_correction. 0049 / ARCH-001.';


-- ── 4 · What an actual looks like once it has a history. ────────────────────

create or replace view public.v_actual_history as
select
  ba.id                as activity_id,
  ba.master_batch_id,
  ba.code,
  ba.title,
  ba.scope_label,
  ba.actual_start,
  ba.actual_end,
  ba.actual_recorded_at,
  coalesce(c.n, 0)     as correction_count,
  c.first_recorded_start,
  c.first_recorded_end,
  -- Visible on purpose. An activity whose finish has been moved is not the same story as one
  -- recorded once, and a management view that showed only the current value would hide that.
  (coalesce(c.n, 0) > 0) as has_been_corrected
from public.batch_activity ba
left join (
  select batch_activity_id,
         count(*)::int as n,
         min(previous_value) filter (where field = 'actual_start') as first_recorded_start,
         min(previous_value) filter (where field = 'actual_end')   as first_recorded_end
    from public.actual_correction
   group by batch_activity_id
) c on c.batch_activity_id = ba.id;

grant select on public.v_actual_history to authenticated;

comment on view public.v_actual_history is
  'The current actuals beside what was FIRST recorded, and how many times they have moved. '
  'The answer to "was this always the finish time, or was it changed?". 0049.';
