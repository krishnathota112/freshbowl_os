-- Rollback for 0126: decide_lab_submission and v_lab_approval_queue exactly as live on 16 Sep 2026.
-- Apply from mushroomos/:  node scripts/apply.mjs ../../../db-rollback/pre_0126__lab_rejection_returns.sql
CREATE OR REPLACE FUNCTION public.decide_lab_submission(p_activity uuid, p_verdict text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba      batch_activity;
  role_   app_role;
  reading lab_approval_reading;
  n_en    int;
  new_id  uuid;
  roles   text;
  n_samples int;
  n_tests   int;
  n_pending int;
  n_fail    int;
  out_of_range boolean;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  if ba.responsible_role is distinct from 'lab_tech' then
    raise exception
      '% is not a lab activity, so this is not a lab submission. A management checkpoint is '
      'decided with record_checkpoint_decision.', ba.title;
  end if;
  if p_verdict not in ('approved','rejected') then
    raise exception 'A lab submission is approved or rejected, not %', p_verdict;
  end if;
  -- MANDATORY, like every other decision reason in this system.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A decision on % needs a stated reason', ba.title;
  end if;

  role_ := public.current_app_role();
  select count(*) into n_en from lab_approval_reading where is_enabled;

  if n_en > 0 then
    -- C-32 has been answered. Only the enabled reading's role may decide.
    select * into reading from lab_approval_reading where is_enabled;
    if role_ is distinct from reading.approver_role then
      raise exception
        'A % may not decide a lab submission. C-32 has been answered as "%": the % approves.',
        coalesce(role_::text, 'caller with no role'), reading.reading_code, reading.approver_role
        using errcode = 'insufficient_privilege';
    end if;
  else
    -- C-32 IS OPEN. Both readings stand, so a decision from either named role is accepted and the
    -- row records which reading authorised it. Refusing both would leave the state unreachable —
    -- exactly the defect B1 found in GM_APPROVAL.
    select * into reading from lab_approval_reading where approver_role = role_ limit 1;
    if not found then
      select string_agg(distinct approver_role::text, ' or ' order by approver_role::text)
        into roles from lab_approval_reading;
      raise exception
        'A % may not decide a lab submission. C-32 is open and neither reading names that role — '
        'the two readings on file name %. Both are carried; neither has been chosen.',
        coalesce(role_::text, 'caller with no role'), coalesce(roles, 'no role')
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- 0080 · G04 · A DECISION NEEDS A SUBMITTED, COMPLETE PACKAGE AND A DIFFERENT PERSON.
  if ba.state not in ('COMPLETED','DEVIATION') then
    raise exception '% has not been submitted by the lab (it is %), so there is nothing to decide yet.',
      ba.title, ba.state
      using errcode = 'check_violation';
  end if;

  select count(distinct s.id),
         count(t.id) filter (where t.state not in ('superseded','cancelled')),
         count(t.id) filter (where t.state not in ('superseded','cancelled')
                               and not exists (select 1 from lab_result r
                                                where r.test_id = t.id and r.superseded_by_result_id is null)),
         count(r.id) filter (where r.superseded_by_result_id is null and r.verdict = 'fail')
    into n_samples, n_tests, n_pending, n_fail
    from lab_sample s
    left join lab_test t on t.sample_id = s.id
    left join lab_result r on r.test_id = t.id
   where s.master_batch_id = ba.master_batch_id
     and (s.batch_activity_id = ba.id
          or (ba.is_pre_h0 and s.batch_activity_id is null and exists (
                select 1 from lab_checkpoint lc
                  join lab_checkpoint_activity lca
                    on lca.checkpoint_code = lc.code and lca.checkpoint_map = lc.checkpoint_map
                 where lc.id = s.checkpoint_id
                   and lca.process_activity_id = ba.process_activity_id)));

  if n_samples = 0 or n_tests = 0 or n_pending > 0 then
    raise exception
      '% has no complete lab package on record (samples %, readings %, readings without a result %). '
      'There is nothing valid to decide.', ba.title, n_samples, n_tests, n_pending
      using errcode = 'check_violation';
  end if;

  if auth.uid() is not null and (
       ba.submitted_by = auth.uid()
    or exists (select 1 from lab_sample s
                where s.collected_by = auth.uid()
                  and s.master_batch_id = ba.master_batch_id
                  and (s.batch_activity_id = ba.id or (ba.is_pre_h0 and s.batch_activity_id is null)))
    or exists (select 1 from lab_result r
                 join lab_test t on t.id = r.test_id
                 join lab_sample s on s.id = t.sample_id
                where r.technician_id = auth.uid()
                  and s.master_batch_id = ba.master_batch_id
                  and (s.batch_activity_id = ba.id or (ba.is_pre_h0 and s.batch_activity_id is null)))) then
    raise exception
      'You recorded or submitted % yourself, so you cannot decide it. A different person must approve or reject it.',
      ba.title
      using errcode = 'insufficient_privilege';
  end if;

  -- Approving a package with a reading outside its range is allowed only as an explicit, reasoned
  -- decision, and it stays flagged on the decision forever (product decision, 13 Sep 2026).
  out_of_range := p_verdict = 'approved' and n_fail > 0;

  insert into lab_decision (batch_activity_id, verdict, reason, decided_by, decided_role,
                            authorised_under_reading, reading_was_enabled, approved_out_of_range,
                            out_of_range_count)
  values (p_activity, p_verdict, p_reason, auth.uid(), role_,
          reading.reading_code, reading.is_enabled, out_of_range, n_fail)
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), role_, 'decide_lab_submission', 'batch_activity', p_activity::text,
          jsonb_build_object('verdict', p_verdict, 'under_reading', reading.reading_code,
                             'reading_enabled', reading.is_enabled,
                             'approved_out_of_range', out_of_range, 'out_of_range_count', n_fail),
          case when out_of_range then 'approved OUT OF RANGE (' || n_fail || ' reading(s)): ' || p_reason
               else p_verdict || ': ' || p_reason end);
  /*
   * 0065 · THE GATE OPENS THROUGH `advance_batch`, LIKE EVERYTHING ELSE.
   *
   * 0064 was right that the decision had to write the release down, and WRONG about how.
   * It re-evaluated the held activities itself and set their state directly, which made
   * `decide_lab_submission` the tenth writer of `batch_activity.state` — and
   * `gates.test.ts` refused it, in the words of the rule it was defending:
   *
   *     "A new writer of batch_activity.state appeared. Either route it through
   *      advance_batch, or add it to SANCTIONED with the reason it is an actor
   *      transition rather than a gate."
   *
   * It is not an actor transition. Opening a held activity because a gate now passes is exactly
   * what `advance_batch` is for, and `submit_activity` and `release_activity` already delegate
   * to it for precisely this reason. 0064's stated objection — that a lab approval should not
   * release rests batch-wide as a side effect — was mine, not the project's, and the two functions
   * above had already settled the question the other way.
   *
   * So the decision now does what every other actor transition does: it records what it decided,
   * and asks the one gate-driven writer to work out what that opens.
   */
  perform public.advance_batch(ba.master_batch_id);

  return new_id;
end;
$function$
;

create or replace view public.v_lab_approval_queue with (security_invoker = on) as
 SELECT master_batch_id,
    batch_code,
    batch_status,
    activity_id,
    activity_code,
    activity_title,
    scope_label,
    activity_state,
    actual_end,
    checkpoint_code,
    checkpoint_name,
    checkpoint_kind,
    gates_activity_code,
    gates_activity_title,
    gates_activity_state,
    is_gate,
    gate_is_enabled,
    latest_verdict,
    latest_reason,
    decided_at,
    decided_role,
    decided_by_name,
    decision_count,
    sample_count,
    result_count,
    awaiting_decision,
    is_approved,
    approver_roles,
    approver_question_settled
   FROM ( WITH latest AS (
                 SELECT DISTINCT ON (ld.batch_activity_id) ld.batch_activity_id,
                    ld.verdict,
                    ld.reason,
                    ld.decided_at,
                    ld.decided_role,
                    ld.decided_by,
                    ld.reading_was_enabled
                   FROM lab_decision ld
                  ORDER BY ld.batch_activity_id, ld.seq DESC
                ), decisions AS (
                 SELECT count(*) FILTER (WHERE (ld2.batch_activity_id IS NOT NULL)) AS n,
                    ld2.batch_activity_id
                   FROM lab_decision ld2
                  GROUP BY ld2.batch_activity_id
                )
         SELECT ba.master_batch_id,
            mb.code AS batch_code,
            mb.status AS batch_status,
            ba.id AS activity_id,
            ba.code AS activity_code,
            ba.title AS activity_title,
            ba.scope_label,
            ba.state AS activity_state,
            ba.actual_end,
            lca.checkpoint_code,
            lc.name AS checkpoint_name,
            lc.kind AS checkpoint_kind,
            lca.gates_activity_code,
            held.title AS gates_activity_title,
            held.state AS gates_activity_state,
            (gr.id IS NOT NULL) AS is_gate,
            COALESCE(gr.is_enabled, false) AS gate_is_enabled,
            l.verdict AS latest_verdict,
            l.reason AS latest_reason,
            l.decided_at,
            l.decided_role,
            p.display_name AS decided_by_name,
            (COALESCE(d.n, (0)::bigint))::integer AS decision_count,
            (( SELECT count(*) AS count
                   FROM lab_sample s
                  WHERE (s.batch_activity_id = ba.id)))::integer AS sample_count,
            (( SELECT count(*) AS count
                   FROM ((lab_result r
                     JOIN lab_test t ON ((t.id = r.test_id)))
                     JOIN lab_sample s ON ((s.id = t.sample_id)))
                  WHERE ((s.batch_activity_id = ba.id) AND (r.superseded_by_result_id IS NULL))))::integer AS result_count,
            ((ba.state = 'COMPLETED'::activity_state) AND (l.verdict IS NULL)) AS awaiting_decision,
            (l.verdict = 'approved'::text) AS is_approved,
            ( SELECT array_agg((r.approver_role)::text ORDER BY (r.approver_role)::text) AS array_agg
                   FROM lab_approval_reading r
                  WHERE (r.is_enabled OR (NOT (EXISTS ( SELECT 1
                           FROM lab_approval_reading e
                          WHERE e.is_enabled))))) AS approver_roles,
            ( SELECT bool_or(r.is_enabled) AS bool_or
                   FROM lab_approval_reading r) AS approver_question_settled
           FROM ((((((((((batch_activity ba
             JOIN master_batch mb ON ((mb.id = ba.master_batch_id)))
             JOIN process_activity pa ON ((pa.id = ba.process_activity_id)))
             JOIN lab_checkpoint_activity lca ON ((lca.process_activity_id = ba.process_activity_id)))
             LEFT JOIN lab_checkpoint lc ON ((lc.code = lca.checkpoint_code)))
             LEFT JOIN process_activity pa_held ON (((pa_held.process_definition_id = pa.process_definition_id) AND (pa_held.code = lca.gates_activity_code))))
             LEFT JOIN gate_rule gr ON (((gr.process_activity_id = pa_held.id) AND (gr.kind = 'LAB_APPROVED'::text))))
             LEFT JOIN batch_activity held ON (((held.master_batch_id = ba.master_batch_id) AND (held.code = lca.gates_activity_code))))
             LEFT JOIN latest l ON ((l.batch_activity_id = ba.id)))
             LEFT JOIN decisions d ON ((d.batch_activity_id = ba.id)))
             LEFT JOIN profiles p ON ((p.id = l.decided_by)))
          WHERE (ba.responsible_role = 'lab_tech'::app_role)) q
  WHERE (current_app_role() = ANY (ARRAY['supervisor'::app_role, 'manager'::app_role, 'admin'::app_role, 'gm'::app_role]));

notify pgrst, 'reload schema';
