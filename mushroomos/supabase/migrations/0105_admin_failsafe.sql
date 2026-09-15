-- ─────────────────────────────────────────────────────────────────────────────
-- 0105 · ADMIN FAILSAFE (user, 15 Sep 2026: "if somewhere something does not work I need to manually insert things
-- and do things right — how to have a failsafe").
-- Three Admin-only repairs for a running batch, each with a written reason (10+ characters), audited, and listed on
-- the GM's "Overrides and decisions":
--   admin_force_open(task, reason)   a task stuck LOCKED / BLOCKED / WAITING opens now
--   admin_mark_done(task, reason)    work done on the floor but not recorded in the app (phone dead, app failed):
--                                    COMPLETED by Admin, the next steps open; the record says it was an Admin entry
--   admin_reopen_task(task, reason)  a task finished or skipped by mistake goes back to work (RETURNED)
-- Existing repairs kept: correct_actual (Admin fixes a recorded time), late-ticket approval, and cancelling a batch
-- and adding it again as "already running" at its true position.
-- Rollback: drop the three functions; re-run 0103's v_override_log.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_force_open(p_activity uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $fn$
declare ba batch_activity;
begin
  perform public.assert_role(array['admin']::app_role[], 'force a task open');
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Write why (at least 10 characters). It is kept on the record.' using errcode = 'check_violation';
  end if;
  select * into ba from batch_activity where id = p_activity for update;
  if not found then raise exception 'No such task.'; end if;
  if (select status from master_batch where id = ba.master_batch_id) <> 'active' then
    raise exception 'The batch is not running.' using errcode = 'check_violation';
  end if;
  if ba.state::text not in ('LOCKED', 'BLOCKED', 'WAITING_TIME', 'WAITING_CONDITION') then
    raise exception '% is %; only a locked or waiting task can be forced open.', ba.title, ba.state using errcode = 'check_violation';
  end if;
  -- onboarded_position keeps the engine from locking it again (its entry rules are waived, as for an onboarded step)
  update batch_activity
     set state = case when actual_start is not null then 'IN_PROGRESS'::activity_state else 'READY'::activity_state end,
         blocked_reason = null, onboarded_position = true
   where id = p_activity;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, before_state, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_force_open', 'batch_activity', p_activity::text,
          jsonb_build_object('state', ba.state, 'blocked_reason', ba.blocked_reason), jsonb_build_object('state', 'READY'), trim(p_reason));
end;
$fn$;

create or replace function public.admin_mark_done(p_activity uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $fn$
declare ba batch_activity;
begin
  perform public.assert_role(array['admin']::app_role[], 'mark a task done');
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Write why (at least 10 characters) — what was done on the floor and who did it.' using errcode = 'check_violation';
  end if;
  select * into ba from batch_activity where id = p_activity for update;
  if not found then raise exception 'No such task.'; end if;
  if (select status from master_batch where id = ba.master_batch_id) <> 'active' then
    raise exception 'The batch is not running.' using errcode = 'check_violation';
  end if;
  if ba.state::text in ('COMPLETED', 'SKIPPED', 'CANCELLED') then
    raise exception '% is already %.', ba.title, ba.state using errcode = 'check_violation';
  end if;
  update batch_activity
     set state = 'COMPLETED', blocked_reason = null,
         actual_start = coalesce(actual_start, now()), actual_end = coalesce(actual_end, now()),
         actual_recorded_at = now(), submitted_at = now(), submitted_by = auth.uid()
   where id = p_activity;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, before_state, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_mark_done', 'batch_activity', p_activity::text,
          jsonb_build_object('state', ba.state), jsonb_build_object('state', 'COMPLETED', 'entered_by_admin', true), trim(p_reason));
  perform public.advance_batch(ba.master_batch_id);
end;
$fn$;

create or replace function public.admin_reopen_task(p_activity uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $fn$
declare ba batch_activity;
begin
  perform public.assert_role(array['admin']::app_role[], 'reopen a task');
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Write why (at least 10 characters). It is kept on the record.' using errcode = 'check_violation';
  end if;
  select * into ba from batch_activity where id = p_activity for update;
  if not found then raise exception 'No such task.'; end if;
  if (select status from master_batch where id = ba.master_batch_id) <> 'active' then
    raise exception 'The batch is not running.' using errcode = 'check_violation';
  end if;
  if ba.state::text not in ('COMPLETED', 'SKIPPED', 'DEVIATION') then
    raise exception 'Only a finished or skipped task can be reopened.' using errcode = 'check_violation';
  end if;
  update batch_activity set state = 'RETURNED', blocked_reason = 'Reopened by Admin — ' || trim(p_reason) where id = p_activity;
  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (ba.master_batch_id, ba.id, ba.responsible_role, 'returned',
          ba.title || ' — ' || coalesce(ba.scope_label, '') || ' was reopened by Admin', trim(p_reason), auth.uid());
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, before_state, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_reopen_task', 'batch_activity', p_activity::text,
          jsonb_build_object('state', ba.state), jsonb_build_object('state', 'RETURNED'), trim(p_reason));
end;
$fn$;

revoke all on function public.admin_force_open(uuid, text) from public, anon;
revoke all on function public.admin_mark_done(uuid, text) from public, anon;
revoke all on function public.admin_reopen_task(uuid, text) from public, anon;
grant execute on function public.admin_force_open(uuid, text) to authenticated;
grant execute on function public.admin_mark_done(uuid, text) to authenticated;
grant execute on function public.admin_reopen_task(uuid, text) to authenticated;

create or replace view public.v_override_log with (security_invoker = on) as
select a.id, a.occurred_at, a.actor_id, pr.display_name as actor_name,
       case when a.actor_role::text = 'operator' then 'supervisor' else a.actor_role::text end as actor_role,
       a.action, a.entity_table, a.entity_id, a.reason, a.after_state,
       coalesce(mb.code, mb2.code) as batch_code, ba.title as activity_title, ba.scope_label
  from audit_event a
  left join profiles pr on pr.id = a.actor_id
  left join batch_activity ba on a.entity_table = 'batch_activity' and ba.id::text = a.entity_id
  left join master_batch mb on mb.id = ba.master_batch_id
  left join master_batch mb2 on a.entity_table = 'master_batch' and mb2.id::text = a.entity_id
 where a.action in ('onboard_batch', 'mark_batch_demo', 'correct_actual', 'admin_decide_extension', 'cancel_batch',
                    'hold_activity', 'release_activity', 'return_activity', 'skip_activity', 'accept_with_deviation',
                    'gm_decide_override', 'verify_corrective_action', 'decide_lab_submission', 'set_current_process',
                    'publish_process_definition', 'activate_batch', 'set_batch_start_at', 'assign_activity',
                    'request_extension', 'cancel_extension',
                    'admin_force_open', 'admin_mark_done', 'admin_reopen_task', 'admin_create_user', 'admin_set_password',
                    'admin_set_user_role', 'admin_activate_user', 'admin_deactivate_user')
   and public.has_role(variadic array['gm', 'manager', 'admin']::app_role[]);
grant select on public.v_override_log to authenticated;

notify pgrst, 'reload schema';
