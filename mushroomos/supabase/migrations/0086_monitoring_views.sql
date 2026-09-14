-- ─────────────────────────────────────────────────────────────────────────────
-- 0086 · Monitoring views: the Admin verification console and the GM's read-only progress.
--
-- Read-only. No table, rule or function changes.
--
--   v_batch_timeline  one row per batch activity: what it is (stage, stream, instance), its state and
--                     blocked/unresolved reason, whether it was before MushroomOS tracking, who started
--                     and finished it and when (server times), its readings and checklist, its photos
--                     (the persisted evidence rows), and — for lab checkpoints — samples, results and the
--                     latest decision (GM state).
--   v_batch_monitor   one row per batch: process, actual H0, onboarding, progress counts, current
--                     stages, pending lab, awaiting GM, overdue work.
--
-- "Overdue" is measured only where the process states a duration: work IN_PROGRESS longer than its
-- stated maximum. PROCESS-2026E carries no planned hours, so nothing is measured against a schedule.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_batch_timeline with (security_invoker = on) as
select
  ba.master_batch_id,
  mb.code                                   as batch_code,
  mb.label                                  as batch_label,
  mb.is_demo,
  ba.id                                     as activity_id,
  ba.code,
  ba.title,
  pa.stage,
  ba.stream::text                           as stream,
  ba.scope_label,
  ba.seq,
  ba.responsible_role::text                 as responsible_role,
  (ba.responsible_role = 'lab_tech')        as is_lab,
  ba.is_hold,
  ba.state::text                            as state,
  ba.blocked_reason,
  (select string_agg(cr.conflict_id || ': ' || cr.question, ' | ')
     from gate_rule g join conflict_register cr on cr.conflict_id = g.conflict_id
    where g.process_activity_id = ba.process_activity_id and g.kind = 'UNRESOLVED_DEPENDENCY' and g.is_enabled
  )                                         as unresolved_dependency,
  ba.before_tracking,
  ba.onboarded_position,
  ba.skip_reason,
  ba.skipped_at,
  ba.duration_target_min_hr,
  ba.duration_target_max_hr,
  ba.planned_start_at,
  ba.planned_end_at,
  ba.actual_start,
  ps.display_name                           as started_by_name,
  ba.actual_end,
  ba.submitted_at,
  pf.display_name                           as finished_by_name,
  (ba.state = 'IN_PROGRESS' and ba.actual_start is not null and ba.duration_target_max_hr is not null
     and now() > ba.actual_start + make_interval(secs => (ba.duration_target_max_hr * 3600)::int))
                                            as overdue,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'key', v.field_key, 'label', v.label, 'datatype', v.datatype, 'unit', v.unit,
            'target', v.sop_value, 'value', v.actual_value, 'flag', v.variance_flag,
            'skip_reason', v.skip_reason, 'remarks', v.remarks,
            'recorded_at', v.actual_recorded_at, 'recorded_by', pr.display_name)
          order by v.display_order, v.label), '[]'::jsonb)
     from batch_activity_value v left join profiles pr on pr.id = v.actual_recorded_by
    where v.batch_activity_id = ba.id)      as readings,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'media_id', em.id, 'requirement_key', em.requirement_key, 'label', r.label,
            'storage_path', em.storage_path, 'media_kind', em.media_kind,
            'uploaded_at', em.uploaded_at, 'uploaded_by', pu.display_name,
            'superseded', em.superseded_by_id is not null, 'superseded_reason', em.superseded_reason)
          order by r.ordering, em.uploaded_at), '[]'::jsonb)
     from evidence_media em
     left join batch_activity_evidence_req r on r.id = em.requirement_id
     left join profiles pu on pu.id = em.uploaded_by
    where em.batch_activity_id = ba.id)     as photos,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'key', r.key, 'label', r.label, 'required', r.min_count, 'captured', r.satisfied_count)
          order by r.ordering), '[]'::jsonb)
     from batch_activity_evidence_req r
    where r.batch_activity_id = ba.id and r.gates_submission) as photo_requirements,
  (select string_agg(distinct lca.checkpoint_code, ', ')
     from lab_checkpoint_activity lca where lca.process_activity_id = ba.process_activity_id) as lab_checkpoint,
  (select bool_or(lc.kind = 'GATE')
     from lab_checkpoint_activity lca
     join lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
    where lca.process_activity_id = ba.process_activity_id) as lab_is_gate,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'sample_label', s.sample_ref_label, 'collected_at', s.collected_at, 'collected_by', pc.display_name,
            'parameter', t.parameter_code, 'value', coalesce(lr.value_numeric::text, lr.value_text),
            'unit', lr.unit, 'verdict', lr.verdict, 'measured_at', lr.measured_at,
            'technician', pt.display_name, 'retest_reason', lr.retest_reason)
          order by s.collected_at, t.parameter_code), '[]'::jsonb)
     from lab_sample s
     left join profiles pc on pc.id = s.collected_by
     left join lab_test t on t.sample_id = s.id and t.state not in ('superseded', 'cancelled')
     left join lab_result lr on lr.test_id = t.id and lr.superseded_by_result_id is null
     left join profiles pt on pt.id = lr.technician_id
    where s.batch_activity_id = ba.id)      as lab_results,
  ld.verdict                                as decision_verdict,
  ld.reason                                 as decision_reason,
  ld.decided_at,
  ld.decided_role::text                     as decided_role,
  pd2.display_name                          as decided_by_name,
  ld.approved_out_of_range
from batch_activity ba
join master_batch mb             on mb.id = ba.master_batch_id
left join process_activity pa    on pa.id = ba.process_activity_id
left join profiles ps            on ps.id = ba.started_by
left join profiles pf            on pf.id = ba.submitted_by
left join lateral (
  select d.* from lab_decision d where d.batch_activity_id = ba.id order by d.seq desc limit 1
) ld on true
left join profiles pd2           on pd2.id = ld.decided_by;

grant select on public.v_batch_timeline to authenticated;

create or replace view public.v_batch_monitor with (security_invoker = on) as
select
  mb.id                                     as master_batch_id,
  mb.code                                   as batch_code,
  mb.label                                  as batch_label,
  mb.is_demo,
  mb.status::text                           as status,
  pd.code                                   as process_code,
  pd.version                                as process_version,
  mb.start_at                               as h0,
  mb.activated_at,
  exists (select 1 from batch_activity x where x.master_batch_id = mb.id and x.before_tracking) as onboarded,
  (select string_agg(distinct m.code, ', ') from batch_material_role bmr join material m on m.id = bmr.material_id
    where bmr.master_batch_id = mb.id)      as materials,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech')                        as production_total,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state in ('COMPLETED'))              as production_completed,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.before_tracking)                     as production_before_tracking,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state in ('READY', 'RETURNED'))      as production_ready,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state = 'IN_PROGRESS')              as production_in_progress,
  count(ba.id) filter (where ba.responsible_role is distinct from 'lab_tech' and ba.state in ('LOCKED', 'BLOCKED', 'WAITING_TIME', 'WAITING_CONDITION')) as production_locked,
  count(ba.id) filter (where ba.state = 'DEVIATION')                                                  as deviations,
  count(ba.id) filter (where ba.responsible_role = 'lab_tech' and not ba.is_pre_h0 and not ba.before_tracking
                         and ba.state in ('READY', 'IN_PROGRESS', 'RETURNED'))                        as lab_pending,
  count(ba.id) filter (where ba.responsible_role = 'lab_tech' and ba.state = 'COMPLETED'
                         and not exists (select 1 from lab_decision d where d.batch_activity_id = ba.id)
                         and exists (select 1 from lab_checkpoint_activity lca
                                       join lab_checkpoint lc on lc.code = lca.checkpoint_code and lc.checkpoint_map = lca.checkpoint_map
                                      where lca.process_activity_id = ba.process_activity_id and lc.kind = 'GATE')) as awaiting_gm,
  count(ba.id) filter (where ba.state = 'IN_PROGRESS' and ba.actual_start is not null and ba.duration_target_max_hr is not null
                         and now() > ba.actual_start + make_interval(secs => (ba.duration_target_max_hr * 3600)::int)) as overdue,
  (select string_agg(distinct pa2.stage, ' · ')
     from batch_activity x join process_activity pa2 on pa2.id = x.process_activity_id
    where x.master_batch_id = mb.id and x.responsible_role is distinct from 'lab_tech'
      and x.state in ('READY', 'IN_PROGRESS', 'RETURNED'))  as current_stages,
  max(ba.actual_end)                        as last_activity_at
from master_batch mb
join process_definition pd on pd.id = mb.process_definition_id
left join batch_activity ba on ba.master_batch_id = mb.id
group by mb.id, pd.code, pd.version;

grant select on public.v_batch_monitor to authenticated;

notify pgrst, 'reload schema';
