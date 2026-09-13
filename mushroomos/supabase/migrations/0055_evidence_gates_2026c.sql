-- ─────────────────────────────────────────────────────────────────────────────
-- 0055 · PROCESS-2026C's evidence did not gate anything.
--
-- THE DEFECT
--   0043 and 0053 seeded 150 `evidence_requirement` rows across PROCESS-2026C — two photographs on
--   every activity somebody performs, the Turner's forty-eight, the seven checkpoint-specific
--   laboratory kinds. Every one of them carries `gates_submission = true`.
--
--   And nothing read them, because the ENFORCEMENT is a separate row:
--
--       submit_activity:
--         select gv.reason into outstanding
--           from public.evaluate_gates(p_activity, 'exit') gv
--          where gv.kind = 'EVIDENCE_COMPLETE' and gv.verdict = 'fail';
--         if outstanding is not null then ... hold the submission ...
--
--   `evaluate_gates` returns one row per GATE RULE. PROCESS-2026B has 32 `EVIDENCE_COMPLETE`
--   rules, seeded by s04. PROCESS-2026C had NONE — so the query returned no rows, `outstanding`
--   stayed null, and every activity in the 470-hour standard could be submitted with no photograph
--   at all. The requirement existed, the counter counted, and nothing stopped anyone.
--
--   `gates_submission = true` on the requirement is a STATEMENT OF INTENT. The gate rule is the
--   thing that acts on it. Seeding one without the other is how a control comes to exist only in
--   the column that describes it.
--
-- FOUND BY A TEST, WHICH IS THE POINT
--   `tests/evidence2026c.test.ts` asked `evaluate_gates` for the exit verdict on `FIB-WET-1` and
--   got no row back. The requirement rows were all present and correct; the assertion that they
--   are ENFORCED is what failed. "The migrations exist" is not GREEN.
--
-- GENERATED FROM THE REQUIREMENTS, NOT LISTED
--   One rule per activity that has at least one gating requirement. Add a requirement to a future
--   activity and re-run this statement; nothing here names an activity.
-- ─────────────────────────────────────────────────────────────────────────────

with pd as (
  select id from public.process_definition where code = 'PROCESS-2026C' and version = 1
),
needs_gate as (
  select distinct pa.id as process_activity_id
  from pd
  join public.process_activity pa on pa.process_definition_id = pd.id
  join public.evidence_requirement er on er.process_activity_id = pa.id
  where er.gates_submission
)
insert into public.gate_rule
  (process_activity_id, phase, kind, config, is_enabled, mapping_confidence,
   blocked_reason_template, ordering)
select needs_gate.process_activity_id, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb,
       true, 'dictated',
       'Cannot submit — {outstanding_count} evidence item(s) outstanding: {outstanding_labels}',
       20
from needs_gate
where not exists (
  select 1 from public.gate_rule g
   where g.process_activity_id = needs_gate.process_activity_id
     and g.phase = 'exit' and g.kind = 'EVIDENCE_COMPLETE');


-- ── The claim, checked rather than stated. ─────────────────────────────────
-- An activity that asks for evidence and does not enforce it is the exact state this file exists
-- to end, so it must be impossible to apply this migration and still be in it.

do $$
declare
  unguarded int;
  guarded   int;
begin
  select count(*) into unguarded
  from public.process_definition pd
  join public.process_activity pa on pa.process_definition_id = pd.id
  where pd.code = 'PROCESS-2026C' and pd.version = 1
    and exists (select 1 from public.evidence_requirement er
                 where er.process_activity_id = pa.id and er.gates_submission)
    and not exists (select 1 from public.gate_rule g
                     where g.process_activity_id = pa.id
                       and g.phase = 'exit' and g.kind = 'EVIDENCE_COMPLETE');

  if unguarded > 0 then
    raise exception
      '% PROCESS-2026C activities require evidence and do not enforce it. A requirement with no '
      'gate rule behind it is a control that exists only in the column describing it.', unguarded;
  end if;

  select count(*) into guarded
  from public.process_definition pd
  join public.process_activity pa on pa.process_definition_id = pd.id
  join public.gate_rule g on g.process_activity_id = pa.id
                         and g.phase = 'exit' and g.kind = 'EVIDENCE_COMPLETE'
  where pd.code = 'PROCESS-2026C' and pd.version = 1;

  raise notice 'PROCESS-2026C: % activities now hold their submission until the photographs exist.',
    guarded;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- AND: the generic photo pair that leaked onto the laboratory activities.
--
-- 0043 §5 seeded BEFORE_PHOTO + AFTER_PHOTO onto "every non-hold activity". On a FRESH run that is
-- exactly right — the 41 laboratory activities do not exist yet, because 0053 has not run. On a
-- REPLAY they do, and they are not holds, so a moisture reading acquired a before-and-after pair on
-- top of the SAMPLE_PHOTO its checkpoint actually asks for.
--
-- 0043 now excludes `responsible_role = 'lab_tech'`, which is a no-op on a fresh database and
-- correct on a replay. This clears what the earlier form left behind.
--
-- ⚠ IT IS NOT A BLANKET DELETE OF BEFORE_PHOTO. Several checkpoints genuinely ask for one:
-- LAB-BNK-LOAD wants BEFORE_PHOTO and HEIGHT_PHOTO, LAB-TUN-LOAD wants BEFORE_PHOTO, LAB-QC-FINAL
-- wants AFTER_PHOTO. The predicate is "not in the kinds this checkpoint names", so a requirement
-- LAB-2026A asked for survives and only the ones nothing asked for go.
-- ─────────────────────────────────────────────────────────────────────────────

with pd as (
  select id from public.process_definition where code = 'PROCESS-2026C' and version = 1
),
leaked as (
  select er.id
  from pd
  join public.process_activity pa on pa.process_definition_id = pd.id
  join public.evidence_requirement er on er.process_activity_id = pa.id
  join public.lab_checkpoint_activity lca on lca.process_activity_id = pa.id
  join public.lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                               and cp.code = lca.checkpoint_code
  where pa.responsible_role = 'lab_tech'
    and not (er.key = any (cp.evidence_kinds))
)
delete from public.evidence_requirement er using leaked where er.id = leaked.id;

do $$
declare mismatched int;
begin
  -- Every laboratory activity now asks for exactly what its checkpoint names — no more, no fewer.
  select count(*) into mismatched
  from public.process_definition pd
  join public.process_activity pa on pa.process_definition_id = pd.id
  join public.lab_checkpoint_activity lca on lca.process_activity_id = pa.id
  join public.lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                               and cp.code = lca.checkpoint_code
  where pd.code = 'PROCESS-2026C' and pd.version = 1
    and (
      exists (select 1 from public.evidence_requirement er
               where er.process_activity_id = pa.id and not (er.key = any (cp.evidence_kinds)))
      or exists (select 1 from unnest(cp.evidence_kinds) k
                  where not exists (select 1 from public.evidence_requirement er
                                     where er.process_activity_id = pa.id and er.key = k))
    );

  if mismatched > 0 then
    raise exception
      '% laboratory activities ask for evidence their checkpoint does not name, or fail to ask for '
      'evidence it does. LAB-2026A names the kinds; nothing else may add to them.', mismatched;
  end if;
end $$;
