-- ─────────────────────────────────────────────────────────────────────────────
-- 0084 · Admin may accept the incoming material check it enters.
--
-- User decision, 14 Sep 2026: the Admin sets up a batch on the web — create, enter the incoming
-- material readings, activate — in one sitting. accept_lab_result allowed only the lab technician and
-- the supervisor, so an Admin-created batch could not be activated from the Admin screens.
--
-- NARROW ON PURPOSE. Admin may accept a result ONLY when it belongs to a pre-batch (incoming material)
-- checkpoint on a batch that is still a draft. Every in-process lab result is unchanged: lab
-- technician or supervisor only. The acceptance stays audited with the admin as the actor.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_lab_result(p_result uuid, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r     lab_result;
  role_ app_role;
begin
  select * into r from lab_result where id = p_result;
  if not found then raise exception 'No such lab result: %', p_result; end if;

  role_ := public.current_app_role();
  if role_ is not null and role_ not in ('lab_tech','supervisor')
     -- 0084 · an admin may accept the incoming material check of a batch still being set up
     and not (role_ = 'admin' and exists (
           select 1
             from lab_test t
             join lab_sample s on s.id = t.sample_id
             join lab_checkpoint cp on cp.id = s.checkpoint_id
             join master_batch mb on mb.id = s.master_batch_id
            where t.id = r.test_id
              and cp.is_prebatch
              and mb.status = 'draft')) then
    raise exception
      'A % may not accept this lab result as final. The lab technician and the supervisor accept lab '
      'results; an admin may accept only the incoming material check of a batch that is still a draft.', role_
      using errcode = 'insufficient_privilege';
  end if;

  if r.superseded_by_result_id is not null then
    raise exception
      'That result has been superseded by a retest. Accept the current version instead — accepting '
      'a superseded reading would make the record say the batch was cleared on a number that has '
      'been replaced.'
      using errcode = 'invalid_parameter_value';
  end if;

  update lab_result
     set accepted = true, accepted_by = auth.uid(), accepted_at = now()
   where id = p_result;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), role_, 'accept_lab_result', 'lab_result', p_result::text,
          jsonb_build_object('verdict', r.verdict, 'version', r.version),
          coalesce(p_reason, 'Result accepted as final · verdict ' || r.verdict));
end;
$function$;

notify pgrst, 'reload schema';
