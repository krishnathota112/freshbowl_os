-- ─────────────────────────────────────────────────────────────────────────────
-- 0066 · Work belongs to a role, a person and a batch.
--
-- THREE THINGS THE ACCEPTANCE RUN PROVED WRONG
--   `scripts/acceptance-run.mjs` builds three PROCESS-2026C batches and drives them over HTTP as
--   the real accounts. Fifty-six checks passed. These three did not:
--
--     ✗ an operator cannot start a laboratory activity          got 204
--     ✗ lab work does not appear as operator work               41 lab rows in the operator's view
--     ✗ an object cannot be uploaded under a mismatched path    got 200
--
--   None was theoretical. Each was a real call, made by a real signed-in operator, that succeeded
--   and should not have.
--
-- 1 · AN OPERATOR STARTED A LABORATORY ACTIVITY
--   `start_activity` asserted the caller held one of operator / supervisor / lab_tech and stopped
--   there. It never asked whether the work was THEIRS. So an operator could start — and therefore
--   stamp an official `actual_start` on — any of the 41 lab checkpoints on the batch.
--
--   The rule added here is the one the role matrix already states: you may execute work your role
--   is responsible for, and a supervisor may perform eligible downstream work. `responsible_role`
--   is already on every row; nothing new is invented to enforce it.
--
--   NOT ENFORCED HERE, deliberately: whether operator A may start operator B's assigned task. That
--   is a real question — `can_capture_for_activity` already answers it "no" for EVIDENCE — but the
--   fixtures assign every row to one arbitrary person, so tightening it now would fail a great many
--   tests for a reason unrelated to what they assert. It is reported, not silently decided.
--
-- 2 · "MY WORK" SHOWED EVERYBODY'S WORK
--   `v_my_work` filtered on nothing but `mb.status = 'active'`. An operator opening the screen
--   called My Work saw all 41 laboratory checkpoints. The name promised scoping the view never did.
--
--   It is now scoped to the caller: the rows assigned to you, or everything if you are a
--   supervisor, manager, admin or GM — the roles whose job is to see other people's work. Since
--   0061 the view is `security_invoker`, so `auth.uid()` and `current_app_role()` are the CALLER's
--   here, which is what makes this possible at all.
--
-- 3 · THE BATCH SEGMENT OF AN EVIDENCE PATH WAS DECORATIVE
--   The storage policy parsed `path_tokens[2]` as the activity and authorised on that alone. The
--   batch segment was never checked, so an object could be stored at `<batch A>/<activity of batch
--   B>/photo.jpg` and accepted.
--
--   The BINDING was never at risk — `bind_evidence` takes the activity explicitly and the
--   cross-batch bind was correctly refused. But `storage_path` is what a person reads when auditing
--   a batch, and a path that names the wrong batch is a lie in the one place somebody looks.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · You may start work your role is responsible for ──────────────────────

create or replace function public.assert_may_execute(p_activity uuid, p_action text)
returns void language plpgsql stable security definer set search_path = public as $fn$
declare
  r   app_role;
  own app_role;
  ttl text;
begin
  select ba.responsible_role, ba.title into own, ttl
    from batch_activity ba where ba.id = p_activity;
  if not found then
    raise exception 'No such activity: %', p_activity;
  end if;

  r := public.current_app_role();

  -- A supervisor and above may perform eligible downstream work — ROLE_AND_APPROVAL_MODEL §2.
  if r in ('supervisor', 'manager', 'admin', 'gm') then
    return;
  end if;

  if own is null or r is distinct from own then
    raise exception
      '% is %''s work, not a %''s. A % may execute the work their role is responsible for; a '
      'supervisor may take eligible downstream work. Ask a supervisor to reassign it.',
      ttl, coalesce(own::text, 'nobody'), coalesce(r::text, 'caller with no role'),
      coalesce(r::text, 'caller with no role')
      using errcode = 'insufficient_privilege';
  end if;
end;
$fn$;

comment on function public.assert_may_execute(uuid, text) is
  'You may execute work your role is responsible for; supervisor and above may take eligible '
  'downstream work. Found because an operator started a laboratory checkpoint. 0066.';

grant execute on function public.assert_may_execute(uuid, text) to authenticated;

do $patch$
declare
  src text;
  ins text;
  pos int;
begin
  select prosrc into src from pg_proc where proname = 'start_activity';
  ins := 'perform public.assert_may_execute(p_activity, ''start an activity'');';

  if position('assert_may_execute' in src) > 0 then
    raise notice '0066 · start_activity already guarded';
  else
    -- Anchor on the existing assert_role statement, not on a newline: deployed bodies carry CRLF.
    pos := position('''start an activity'');' in src);
    if pos = 0 then
      raise exception '0066 failed: could not find start_activity''s role assertion to anchor on';
    end if;
    pos := pos + length('''start an activity'');');
    src := substr(src, 1, pos) || E'\n  ' || ins || substr(src, pos + 1);
    execute format(
      'create or replace function public.start_activity(p_activity uuid) returns void '
      'language plpgsql security definer set search_path = public as %L', src);
  end if;
end $patch$;

do $patch$
declare
  src text;
  pos int;
begin
  select prosrc into src from pg_proc where proname = 'submit_activity';
  if position('assert_may_execute' in src) > 0 then
    raise notice '0066 · submit_activity already guarded';
  else
    pos := position('''submit an activity'');' in src);
    if pos = 0 then
      pos := position('''submit work'');' in src);
    end if;
    if pos = 0 then
      raise warning
        '0066 · submit_activity''s role assertion was not found by either anchor — it is NOT '
        'guarded by assert_may_execute. Reported rather than guessed at.';
    else
      raise notice '0066 · submit_activity anchor found at %', pos;
    end if;
  end if;
end $patch$;

-- ── 2 · "My Work" is the caller's work ───────────────────────────────────────

create or replace view public.v_my_work as
select ba.id                        as activity_id,
       ba.master_batch_id,
       mb.code                      as batch_code,
       ba.code,
       ba.title,
       ba.scope_label,
       ba.stream::text              as stream,
       ba.instance_no,
       ba.state::text               as state,
       ba.blocked_reason,
       ba.is_hold,
       ba.responsible_role::text    as responsible_role,
       ba.assigned_person_id,
       ba.assigned_machine_id,
       ba.baseline_start_hour,
       ba.baseline_end_hour,
       ba.planned_start_at,
       ba.planned_end_at,
       ba.actual_start,
       ba.actual_end,
       ba.variance_minutes,
       ev.required_count,
       ev.satisfied_total,
       ev.outstanding_labels
  from batch_activity ba
  join master_batch mb on mb.id = ba.master_batch_id
  left join lateral (
    select count(*)::int                                          as required_count,
           sum(least(r.satisfied_count, r.min_count))::int         as satisfied_total,
           string_agg(r.label, ', ' order by r.ordering)
             filter (where r.satisfied_count < r.min_count)        as outstanding_labels
      from batch_activity_evidence_req r
     where r.batch_activity_id = ba.id and r.gates_submission) ev on true
 where mb.status = 'active'
   /*
    * 0066 · MY work.
    *
    * The rows assigned to me, or everything if my job is to see other people's work. Before this
    * an operator's "My Work" listed all 41 laboratory checkpoints on the batch.
    *
    * This works because 0061 made every view `security_invoker`: `auth.uid()` and
    * `current_app_role()` are the CALLER's here. Under the old owner-rights view they would have
    * been the owner's, and this filter would have been meaningless.
    */
   and (
     ba.assigned_person_id = auth.uid()
     or public.current_app_role() in ('supervisor', 'manager', 'admin', 'gm')
   );

comment on view public.v_my_work is
  'The signed-in worker''s own assigned work on active batches — or every row, for the roles whose '
  'job is to see other people''s. Scoped in 0066 after an operator''s My Work listed 41 laboratory '
  'checkpoints.';

grant select on public.v_my_work to authenticated;
alter view public.v_my_work set (security_invoker = on);

-- ── 3 · An evidence path must name the batch the activity is actually on ─────

create or replace function public.evidence_path_is_consistent(p_batch text, p_activity text)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare
  b uuid;
  a uuid;
begin
  -- A path segment is text and may be anything at all. A bad cast is a refusal, not an error.
  begin
    b := p_batch::uuid;
    a := p_activity::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from batch_activity ba
     where ba.id = a and ba.master_batch_id = b);
end;
$fn$;

comment on function public.evidence_path_is_consistent(text, text) is
  'The batch segment of an evidence path must name the batch its activity is actually on. The '
  'binding was never at risk — bind_evidence takes the activity — but storage_path is what a '
  'person reads when auditing a batch. 0066.';

grant execute on function public.evidence_path_is_consistent(text, text) to authenticated;

drop policy if exists evidence_insert on storage.objects;
create policy evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and array_length(path_tokens, 1) = 3
    and public.can_capture_for_activity((path_tokens[2])::uuid)
    and public.evidence_path_is_consistent(path_tokens[1], path_tokens[2])
  );

-- ── Assertions ───────────────────────────────────────────────────────────────

do $a$
declare
  n int;
begin
  if position('assert_may_execute' in (select prosrc from pg_proc where proname = 'start_activity')) = 0 then
    raise exception '0066 failed: start_activity is not guarded';
  end if;

  if (select pg_get_viewdef('public.v_my_work'::regclass, true)) !~ 'assigned_person_id = auth.uid' then
    raise exception '0066 failed: v_my_work is not scoped to the caller';
  end if;

  select count(*) into n from pg_policy
   where polrelid = 'storage.objects'::regclass and polname = 'evidence_insert';
  if n <> 1 then
    raise exception '0066 failed: the evidence insert policy is missing';
  end if;

  raise notice '0066 · work is scoped to a role, a person and a batch';
end $a$;
