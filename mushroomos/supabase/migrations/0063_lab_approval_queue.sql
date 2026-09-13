-- ─────────────────────────────────────────────────────────────────────────────
-- 0063 · The approval queue, as a view.
--
-- WHY THIS EXISTS
--   `decide_lab_submission` is the only thing that opens a `LAB_APPROVED` gate. PROCESS-2026C holds
--   eight production activities behind four checkpoints. Measured against `src/` on 2026-09-08:
--
--       decide_lab_submission   0 references in the entire frontend
--       lab_decision            0 rows in the entire database
--
--   So a gate could be opened by the test suite and never by a person using the product, and the
--   eight held activities would stay held forever. The screen was missing, and the screen was
--   missing partly because the READ was missing: nothing said "these submissions are waiting on a
--   decision, and here is what each one will unlock".
--
-- WHY A VIEW AND NOT A CLIENT-SIDE JOIN
--   Answering it takes four joins — `batch_activity` to `lab_checkpoint_activity` for the
--   checkpoint, to `lab_checkpoint` for its name and kind, to `lab_decision` for the standing
--   verdict, and to `gate_rule` for what is actually held. Assembling that in TypeScript would put
--   process knowledge in a screen, which CLAUDE.md rule 5 exists to prevent: read from views, write
--   through RPCs.
--
-- WHAT IT DOES NOT DECIDE
--   · WHO MAY APPROVE. C-32 is open — `lab_approval_reading` holds two readings and neither is
--     enabled, so the server accepts either `gm` or `supervisor` and refuses everyone else. This
--     view reports the state of that question (`approver_roles`); it does not answer it, and a
--     screen must ask rather than hardcoding "GM".
--   · WHETHER A SUBMISSION IS GOOD. `latest_verdict` is null until somebody decides. A row that
--     has never been decided is not "pending approval" in the sense of being nearly approved — it
--     is simply undecided, and the gate is shut.
--   · `LAB-MOIST-DEC` IS NOT A GATE. It is a DECISION and holds nothing, because the 67–68 %
--     moisture band is UNRESOLVED and no gate may be built on it. It appears here with
--     `is_gate = false` so the distinction is visible rather than inferred from an absence.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_lab_approval_queue as
with latest as (
  -- The standing decision on each activity. `lab_decision` is append-only, so "latest" is the
  -- decision in force and the earlier ones are the history behind it.
  select distinct on (ld.batch_activity_id)
         ld.batch_activity_id,
         ld.verdict,
         ld.reason,
         ld.decided_at,
         ld.decided_role,
         ld.decided_by,
         ld.reading_was_enabled
    from public.lab_decision ld
   order by ld.batch_activity_id, ld.seq desc
),
decisions as (
  select count(*) filter (where ld2.batch_activity_id is not null) as n,
         ld2.batch_activity_id
    from public.lab_decision ld2
   group by ld2.batch_activity_id
)
select
  ba.master_batch_id,
  mb.code                              as batch_code,
  mb.status                            as batch_status,
  ba.id                                as activity_id,
  ba.code                              as activity_code,
  ba.title                             as activity_title,
  ba.scope_label,
  ba.state                             as activity_state,
  ba.actual_end,

  lca.checkpoint_code,
  lc.name                              as checkpoint_name,
  lc.kind                              as checkpoint_kind,

  -- What this checkpoint holds shut, and whether a rule actually exists to hold it.
  lca.gates_activity_code,
  held.title                           as gates_activity_title,
  held.state                           as gates_activity_state,
  (gr.id is not null)                  as is_gate,
  coalesce(gr.is_enabled, false)       as gate_is_enabled,

  -- The standing decision, if any.
  l.verdict                            as latest_verdict,
  l.reason                             as latest_reason,
  l.decided_at,
  l.decided_role,
  p.display_name                       as decided_by_name,
  coalesce(d.n, 0)::int                as decision_count,

  -- Has a reading been taken at all? A decision on an activity with no result is a decision about
  -- nothing, and the screen should say so rather than quietly allowing it.
  (select count(*) from public.lab_sample s where s.batch_activity_id = ba.id)::int as sample_count,
  (select count(*)
     from public.lab_result r
     join public.lab_test t   on t.id = r.test_id
     join public.lab_sample s on s.id = t.sample_id
    where s.batch_activity_id = ba.id
      and r.superseded_by_result_id is null)::int as result_count,

  /*
   * AWAITING A DECISION.
   *
   * The work is finished and no decision stands. Not "submitted" — `decide_lab_submission` does not
   * require any particular state, and inventing a stricter rule here would put a second opinion
   * about eligibility in a view.
   */
  (ba.state = 'COMPLETED' and l.verdict is null)          as awaiting_decision,
  (l.verdict = 'approved')                                as is_approved,

  -- C-32, reported not resolved. Both roles while neither reading is enabled.
  (select array_agg(r.approver_role::text order by r.approver_role::text)
     from public.lab_approval_reading r
    where r.is_enabled or not exists (select 1 from public.lab_approval_reading e where e.is_enabled)
  )                                                       as approver_roles,
  (select bool_or(r.is_enabled) from public.lab_approval_reading r) as approver_question_settled

from public.batch_activity ba
join public.master_batch mb        on mb.id = ba.master_batch_id
join public.process_activity pa    on pa.id = ba.process_activity_id
join public.lab_checkpoint_activity lca
                                   on lca.process_activity_id = ba.process_activity_id
left join public.lab_checkpoint lc on lc.code = lca.checkpoint_code
/*
 * The LAB_APPROVED rule does NOT name its checkpoint in `config` — `config` carries only
 * `checkpoint_map`. 0054 bound the gate the other way round: the rule sits on the HELD process
 * activity, and `lab_checkpoint_activity.gates_activity_code` is what says which checkpoint holds
 * it. So the join goes through the held activity, not through the config.
 */
left join public.process_activity pa_held
                                   on pa_held.process_definition_id = pa.process_definition_id
                                  and pa_held.code = lca.gates_activity_code
left join public.gate_rule gr      on gr.process_activity_id = pa_held.id
                                  and gr.kind = 'LAB_APPROVED'
left join public.batch_activity held
                                   on held.master_batch_id = ba.master_batch_id
                                  and held.code = lca.gates_activity_code
left join latest l                 on l.batch_activity_id = ba.id
left join decisions d              on d.batch_activity_id = ba.id
left join public.profiles p        on p.id = l.decided_by
where ba.responsible_role = 'lab_tech';

comment on view public.v_lab_approval_queue is
  'Lab submissions and the standing decision on each, with what that decision holds shut. '
  'A LAB_APPROVED gate opens only on verdict = approved — submission is not approval. '
  'C-32 is reported in approver_roles, never resolved here. 0063.';

grant select on public.v_lab_approval_queue to authenticated;
alter view public.v_lab_approval_queue set (security_invoker = on);

do $a$
declare
  n int;
  gated int;
begin
  select count(*) into n from public.v_lab_approval_queue;
  raise notice '0063 · v_lab_approval_queue: % rows', n;

  -- The four gating checkpoints of PROCESS-2026C must resolve to a real rule; LAB-MOIST-DEC
  -- must NOT, because the moisture band is UNRESOLVED.
  select count(distinct checkpoint_code) into gated
    from public.v_lab_approval_queue where is_gate;
  raise notice '0063 · % checkpoints resolve to a LAB_APPROVED rule', gated;

  if exists (select 1 from public.v_lab_approval_queue
              where checkpoint_code = 'LAB-MOIST-DEC' and is_gate) then
    raise exception
      '0063 failed: LAB-MOIST-DEC resolves to a gate. It is a DECISION — the 67-68%% moisture '
      'band is UNRESOLVED and no gate may be built on it.';
  end if;

  -- 0061 must hold for anything added afterwards.
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'v_lab_approval_queue'
       and c.reloptions::text like '%security_invoker=on%') then
    raise exception '0063 failed: the new view does not read as its caller';
  end if;
end $a$;
