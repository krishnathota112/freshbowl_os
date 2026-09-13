-- ─────────────────────────────────────────────────────────────────────────────
-- 0050 · The server owns the clock, and the operator never states a timestamp.
--
-- TWO CHANGES TO ONE RPC, AND ONE NEW RPC.
--
-- ── A · The stored value wins ───────────────────────────────────────────────
--   submit_activity wrote:
--
--       actual_start = coalesce(p_actual_start, actual_start, entered_at)
--
--   Parameter first. So a second submit with a different `p_actual_start` REPLACED a value that
--   had already been recorded. 0049 made the table refuse that — which means that from 0049 until
--   this file, the supported RPC raises on a path it used to accept. The argument order is the
--   actual fix; the trigger is the boundary that catches everything else.
--
--       actual_start = coalesce(actual_start, p_actual_start, entered_at)
--
--   Recorded value · then what the submitter states · then now(). A stated actual can now only
--   FILL A GAP, never overwrite. Changing a recorded one goes through `correct_actual`, with a
--   reason, keeping the original. ARCH-001.
--
-- ── B · An operator may not state an actual at all ──────────────────────────
--   Master PRD: "Operator does NOT enter actual start time, actual end time, duration, variance,
--   forecast, process rules." The parameters existed and were granted to `authenticated`, so the
--   role that must not use them was the role that could.
--
--   The parameters STAY, for the supervisor recording work that happened while the system was
--   unreachable — that is a real factory need and removing it would push people to a spreadsheet.
--   They are simply not the operator's, and the refusal says which path is.
--
-- ── C · complete_activity ───────────────────────────────────────────────────
--   The normal finish had no RPC of its own. An operator's client had to call `submit_activity`,
--   whose signature offers two timestamp parameters — a shape that invites exactly the write this
--   migration is closing. `complete_activity` cannot express a stated time. There is nothing to
--   pass.
--
--       START     → start_activity()    → server records actual_start
--       FINISH    → complete_activity() → server records actual_end
--
-- PATCHED AGAINST THE DEPLOYED BODY, not retyped: `submit_activity` carries 0017's deviation
-- capture, 0016's four validations and 0020's checkpoint hook, and retyping it is how one of those
-- goes missing while somebody fixes an argument order.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  src     text;
  patched text;
  guard   text;
  n_a     int;
  -- The first statement of the body. Unique, and end-of-line agnostic.
  anchor  text := 'if not found then raise exception ''No such activity: %'', p_activity; end if;';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'submit_activity';

  if src is null then
    raise exception 'submit_activity() is not deployed.';
  end if;

  -- ── A · argument order ────────────────────────────────────────────────────
  patched := src;
  patched := replace(patched,
    'coalesce(p_actual_start, actual_start, entered_at)',
    'coalesce(actual_start, p_actual_start, entered_at)');
  patched := replace(patched,
    'coalesce(p_actual_end, actual_end, entered_at)',
    'coalesce(actual_end, p_actual_end, entered_at)');
  patched := replace(patched,
    'coalesce(p_actual_end, actual_end)',
    'coalesce(actual_end, p_actual_end)');

  if patched = src then
    if src like '%coalesce(actual_start, p_actual_start%' then
      raise notice 'submit_activity() already lets the recorded value win.';
    else
      raise exception
        'submit_activity() does not write actuals in a form 0050 recognises. The body has moved — '
        'patch it by hand rather than letting this file report success.';
    end if;
  end if;

  -- ── B · the operator guard, inserted at the top of the body ───────────────
  guard := E'\n' ||
    '  -- 0050 · An operator records work by doing it, not by typing when it happened.' || E'\n' ||
    '  if (p_actual_start is not null or p_actual_end is not null)' || E'\n' ||
    '     and coalesce(public.current_app_role()::text, '''') = ''operator'' then' || E'\n' ||
    '    raise exception' || E'\n' ||
    -- ⚠ ADJACENT LITERALS, NOT `||`. plpgsql's RAISE takes a string LITERAL as its format, so
    -- `raise exception 'a' || 'b'` is a syntax error. Implicit concatenation of adjacent literals
    -- is legal and is what the rest of this codebase uses.
    '      ''An operator may not state a start or end time. Use start_activity and ''' || E'\n' ||
    '      ''complete_activity and the server records when it happened. If a time has to be ''' || E'\n' ||
    '      ''entered after the fact, a supervisor does it.''' || E'\n' ||
    '      using errcode = ''insufficient_privilege'';' || E'\n' ||
    '  end if;' || E'\n';

  -- ⚠ ANCHORED ON A STATEMENT, NOT ON THE WORD `begin`.
  --
  -- The deployed body carries CRLF line endings — these migration files were authored on Windows
  -- and `pg_get_functiondef` returns exactly what was stored. So searching for a newline followed
  -- by `begin` followed by a newline matched nothing, and this migration reported "could not find
  -- the body opening" against a body whose opening was plainly there.
  --
  -- Anchoring on the first real statement of the body, which is unique in it, does not care how
  -- the lines end. Worth remembering for the next migration that patches a deployed body: assume
  -- CRLF, or match with `\s` rather than a literal newline.
  if patched not like '%may not state a start or end time%' then
    n_a := position(anchor in patched);
    if n_a = 0 then
      raise exception
        'submit_activity() does not begin with the lookup 0050 anchors on. The body has moved — '
        'patch it by hand rather than letting this file report success.';
    end if;
    patched := substr(patched, 1, n_a + length(anchor) - 1) || guard
               || substr(patched, n_a + length(anchor));
  end if;

  execute patched;
end
$mig$;


-- ── C · The normal finish. No timestamp to pass. ────────────────────────────

create or replace function public.complete_activity(
  p_activity uuid,
  p_values   jsonb default '{}'::jsonb,
  p_remarks  text  default null
) returns table (new_state text, out_of_range int, outstanding_evidence text)
language plpgsql security definer set search_path = public as $fn$
begin
  -- Deliberately a thin delegation. `submit_activity` carries the evidence gate, the field
  -- validation, the deviation capture and the state machine, and a second implementation of any
  -- of those is a second thing to keep true. What this adds is the ABSENCE of the two parameters:
  -- an operator's client physically cannot state a time through it.
  return query select * from public.submit_activity(p_activity, p_values, p_remarks, null, null);
end;
$fn$;

revoke execute on function public.complete_activity(uuid, jsonb, text) from public, anon;
grant execute on function public.complete_activity(uuid, jsonb, text) to authenticated;

comment on function public.complete_activity(uuid, jsonb, text) is
  'FINISH. The server records actual_end. There is no timestamp parameter, which is the point — '
  'the normal operator path cannot express a stated time. 0050.';


-- ── D · What the operator's client reads. ───────────────────────────────────
-- MY WORK, as a contract rather than a query each client writes for itself. A blocked row carries
-- the reason the server computed, so no client decides eligibility or renders a guess.

create or replace view public.v_my_work as
select
  ba.id                    as activity_id,
  ba.master_batch_id,
  mb.code                  as batch_code,
  ba.code,
  ba.title,
  ba.scope_label,
  ba.stream::text          as stream,
  ba.instance_no,
  ba.state::text           as state,
  ba.blocked_reason,
  ba.is_hold,
  ba.responsible_role::text as responsible_role,
  ba.assigned_person_id,
  ba.assigned_machine_id,
  -- PLAN. Read-only to the operator; shown so they know whether they are early or late, never
  -- typed by them.
  ba.baseline_start_hour,
  ba.baseline_end_hour,
  ba.planned_start_at,
  ba.planned_end_at,
  -- ACTUAL. Server-recorded.
  ba.actual_start,
  ba.actual_end,
  ba.variance_minutes,
  -- EVIDENCE. What is still outstanding, so the card can say "1 photo left" without counting.
  ev.required_count,
  ev.satisfied_total,
  ev.outstanding_labels
from public.batch_activity ba
join public.master_batch mb on mb.id = ba.master_batch_id
left join lateral (
  select count(*)::int                                         as required_count,
         sum(least(r.satisfied_count, r.min_count))::int        as satisfied_total,
         string_agg(r.label, ', ' order by r.ordering)
           filter (where r.satisfied_count < r.min_count)       as outstanding_labels
    from public.batch_activity_evidence_req r
   where r.batch_activity_id = ba.id and r.gates_submission
) ev on true
where mb.status = 'active';

grant select on public.v_my_work to authenticated;

comment on view public.v_my_work is
  'One row per live activity: plan, actual, state, why it is blocked, and what evidence is still '
  'outstanding. The operator surface computes nothing. 0050.';
