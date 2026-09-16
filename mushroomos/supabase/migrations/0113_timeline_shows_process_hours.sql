-- ─────────────────────────────────────────────────────────────────────────────
-- 0113 · THE BATCH RECORD SHOWS THE PROCESS HOUR (user, 16 Sep 2026: "I said follow the H0 to H476 format;
-- I see PHASE-2A / STAGE-0A instead, and I cannot tell which tasks are not due yet").
--
-- v_batch_timeline carried the SOP's stage wording (process_activity.stage: "STAGE–0A: BAGASSE (NEW) PRE-WET &
-- REST", "PHASE–2A TUNNEL PREPERATION") but not the activity's own hours, so the screen had nothing else to show.
-- This adds, from data that already exists on the row:
--   baseline_start_hour / baseline_end_hour   the H-hours of the published plan (H0 … H476)
--   h0                                        the batch's own zero, so a screen can say "H0 = 16 Sep 08:00"
--   due_from                                  the earliest a task may be started (0106: planned start minus the
--                                             early window) — so "READY" and "not due until Thursday" stop looking
--                                             the same on screen
-- Read-only: one view, no behaviour change.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_batch_timeline with (security_invoker = on) as
with base as (
SELECT ba.master_batch_id,
    mb.code AS batch_code,
    mb.label AS batch_label,
    mb.is_demo,
    ba.id AS activity_id,
    ba.code,
    ba.title,
    pa.stage,
    ba.stream::text AS stream,
    ba.scope_label,
    ba.seq,
    ba.responsible_role::text AS responsible_role,
    ba.responsible_role = 'lab_tech'::app_role AS is_lab,
    ba.is_hold,
    ba.state::text AS state,
    ba.blocked_reason,
    ( SELECT string_agg((cr.conflict_id || ': '::text) || cr.question, ' | '::text) AS string_agg
           FROM gate_rule g
             JOIN conflict_register cr ON cr.conflict_id = g.conflict_id
          WHERE g.process_activity_id = ba.process_activity_id AND g.kind = 'UNRESOLVED_DEPENDENCY'::text AND g.is_enabled) AS unresolved_dependency,
    ba.before_tracking,
    ba.onboarded_position,
    ba.skip_reason,
    ba.skipped_at,
    ba.duration_target_min_hr,
    ba.duration_target_max_hr,
    ba.planned_start_at,
    ba.planned_end_at,
    ba.actual_start,
    ps.display_name AS started_by_name,
    ba.actual_end,
    ba.submitted_at,
    pf.display_name AS finished_by_name,
    ba.state = 'IN_PROGRESS'::activity_state AND ba.actual_start IS NOT NULL AND ba.duration_target_max_hr IS NOT NULL AND now() > (ba.actual_start + make_interval(secs => ((ba.duration_target_max_hr + COALESCE(( SELECT sum(er.approved_extension_hr) AS sum
           FROM extension_request er
          WHERE er.batch_activity_id = ba.id AND extension_is_effective(er.status)), 0::numeric)) * 3600::numeric)::integer::double precision)) AS overdue,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('key', v.field_key, 'label', v.label, 'datatype', v.datatype, 'unit', v.unit, 'target', v.sop_value, 'value', v.actual_value, 'flag', v.variance_flag, 'skip_reason', v.skip_reason, 'remarks', v.remarks, 'recorded_at', v.actual_recorded_at, 'recorded_by', pr.display_name) ORDER BY v.display_order, v.label), '[]'::jsonb) AS "coalesce"
           FROM batch_activity_value v
             LEFT JOIN profiles pr ON pr.id = v.actual_recorded_by
          WHERE v.batch_activity_id = ba.id) AS readings,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('media_id', em.id, 'requirement_key', em.requirement_key, 'label', r.label, 'storage_path', em.storage_path, 'media_kind', em.media_kind, 'uploaded_at', em.uploaded_at, 'uploaded_by', pu.display_name, 'superseded', em.superseded_by_id IS NOT NULL, 'superseded_reason', em.superseded_reason) ORDER BY r.ordering, em.uploaded_at), '[]'::jsonb) AS "coalesce"
           FROM evidence_media em
             LEFT JOIN batch_activity_evidence_req r ON r.id = em.requirement_id
             LEFT JOIN profiles pu ON pu.id = em.uploaded_by
          WHERE em.batch_activity_id = ba.id) AS photos,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('key', r.key, 'label', r.label, 'required', r.min_count, 'captured', r.satisfied_count) ORDER BY r.ordering), '[]'::jsonb) AS "coalesce"
           FROM batch_activity_evidence_req r
          WHERE r.batch_activity_id = ba.id AND r.gates_submission) AS photo_requirements,
    ( SELECT string_agg(DISTINCT lca.checkpoint_code, ', '::text) AS string_agg
           FROM lab_checkpoint_activity lca
          WHERE lca.process_activity_id = ba.process_activity_id) AS lab_checkpoint,
    ( SELECT bool_or(lc.kind = 'GATE'::text) AS bool_or
           FROM lab_checkpoint_activity lca
             JOIN lab_checkpoint lc ON lc.code = lca.checkpoint_code AND lc.checkpoint_map = lca.checkpoint_map
          WHERE lca.process_activity_id = ba.process_activity_id) AS lab_is_gate,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('sample_label', s.sample_ref_label, 'collected_at', s.collected_at, 'collected_by', pc.display_name, 'parameter', t.parameter_code, 'value', COALESCE(lr.value_numeric::text, lr.value_text), 'unit', lr.unit, 'verdict', lr.verdict, 'measured_at', lr.measured_at, 'technician', pt.display_name, 'retest_reason', lr.retest_reason) ORDER BY s.collected_at, t.parameter_code), '[]'::jsonb) AS "coalesce"
           FROM lab_sample s
             LEFT JOIN profiles pc ON pc.id = s.collected_by
             LEFT JOIN lab_test t ON t.sample_id = s.id AND (t.state <> ALL (ARRAY['superseded'::lab_test_state, 'cancelled'::lab_test_state]))
             LEFT JOIN lab_result lr ON lr.test_id = t.id AND lr.superseded_by_result_id IS NULL
             LEFT JOIN profiles pt ON pt.id = lr.technician_id
          WHERE s.batch_activity_id = ba.id) AS lab_results,
    ld.verdict AS decision_verdict,
    ld.reason AS decision_reason,
    ld.decided_at,
    ld.decided_role::text AS decided_role,
    pd2.display_name AS decided_by_name,
    ld.approved_out_of_range,
    ( SELECT COALESCE(jsonb_agg(jsonb_build_object('id', er.id, 'status', er.status, 'requested_at', er.requested_at, 'requested_by', rq.display_name, 'requested_by_role', er.requested_by_role, 'hours', er.requested_extension_hr, 'reason', er.requested_reason, 'overdue_at_request', er.overdue_at_request, 'decision', er.admin_decision, 'decided_at', er.admin_decided_at, 'decided_by', ad.display_name, 'granted_hr', er.admin_granted_hr, 'decision_reason', er.admin_reason, 'photos', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('storage_path', m.storage_path, 'uploaded_at', m.uploaded_at, 'media_kind', m.media_kind) ORDER BY m.uploaded_at), '[]'::jsonb) AS "coalesce"
                   FROM extension_request_media m
                  WHERE m.extension_request_id = er.id)) ORDER BY er.requested_at), '[]'::jsonb) AS "coalesce"
           FROM extension_request er
             LEFT JOIN profiles rq ON rq.id = er.requested_by
             LEFT JOIN profiles ad ON ad.id = er.admin_decided_by
          WHERE er.batch_activity_id = ba.id) AS tickets
   FROM batch_activity ba
     JOIN master_batch mb ON mb.id = ba.master_batch_id
     LEFT JOIN process_activity pa ON pa.id = ba.process_activity_id
     LEFT JOIN profiles ps ON ps.id = ba.started_by
     LEFT JOIN profiles pf ON pf.id = ba.submitted_by
     LEFT JOIN LATERAL ( SELECT d.id,
            d.seq,
            d.batch_activity_id,
            d.verdict,
            d.reason,
            d.decided_by,
            d.decided_role,
            d.authorised_under_reading,
            d.reading_was_enabled,
            d.decided_at,
            d.approved_out_of_range,
            d.out_of_range_count
           FROM lab_decision d
          WHERE d.batch_activity_id = ba.id
          ORDER BY d.seq DESC
         LIMIT 1) ld ON true
     LEFT JOIN profiles pd2 ON pd2.id = ld.decided_by
)
select b.*,
       ba.baseline_start_hour,
       ba.baseline_end_hour,
       mb.start_at as h0,
       case
         when ba.before_tracking or ba.actual_start is not null or ba.planned_start_at is null then null
         else ba.planned_start_at
              - make_interval(mins => coalesce((select p.early_start_min from extension_policy p where p.id), 30))
       end as due_from
  from base b
  join public.batch_activity ba on ba.id = b.activity_id
  join public.master_batch mb on mb.id = b.master_batch_id;

grant select on public.v_batch_timeline to authenticated;

notify pgrst, 'reload schema';
