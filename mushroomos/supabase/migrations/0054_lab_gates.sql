-- ─────────────────────────────────────────────────────────────────────────────
-- 0054 · A laboratory GATE holds production until an APPROVED result exists.
--
-- THE RULE, FROM LAB-2026A
--
--     LAB TEST → RESULT → EVIDENCE → SUBMIT → APPROVAL → GATE PASSES → DOWNSTREAM ELIGIBLE
--
--   **ENTERED RESULT IS NOT APPROVED RESULT.** A submitted reading does not unlock anything. Until
--   somebody with the authority to approve has approved it, the production activity behind the
--   gate is locked — and it is locked BY THE SERVER, not by a client disabling a button.
--
-- WHAT ALREADY EXISTED, AND IS REUSED RATHER THAN REBUILT
--   · `decide_lab_submission` — the approval, with the C-32 role model already worked out:
--     when the reading is enabled only that role may decide; while C-32 is open either named
--     role may, and the row records which reading authorised it.
--   · `lab_decision` — append-only, `seq`-ordered, so the LATEST decision governs and the earlier
--     ones stay on the record.
--   · `lab_checkpoint_activity` (0053) — which lab activity carries which checkpoint, and which
--     PRODUCTION activity that checkpoint holds.
--   · `evaluate_gates` / `render_gate_reason` — the engine and the refusal text.
--
--   This migration adds one gate KIND and the rows that use it. No new approval path, no second
--   state machine, no `lab_gate` table duplicating what `gate_rule` already is.
--
-- WHY NOT GM_APPROVAL
--   `GM_APPROVAL` reads `v_checkpoint_status` — the numbered MANAGEMENT checkpoints, a different
--   mechanism answering a different question. Bending it to also mean "a lab result was approved"
--   would make one rule kind mean two things and neither one legibly.
--
-- WHY THE BINDING TABLE AND NOT A CHECKPOINT CODE IN THE CONFIG
--   `LAB-BNK-LOAD` gates three separate bunker fills, one per bunker, and each fill waits on ITS
--   OWN assay — not on all three. `lab_checkpoint_activity.gates_activity_code` already records
--   that pairing precisely, so the gate asks "which lab activities are bound to hold ME?" and
--   needs no instance arithmetic to get the per-bunker case right.
--
-- ── WHAT IS DELIBERATELY NOT GATED ──────────────────────────────────────────
--   `LAB-MOIST-DEC` is a DECISION, not a GATE. It branches the process — ≥68 % proceed, <67 %
--   controlled mist — and the 67–68 % band is UNRESOLVED. CLAUDE.md: "Build no gate on any of
--   them." So only `kind = 'GATE'` produces a rule here: four checkpoints, eight production
--   activities.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The gate kind. ──────────────────────────────────────────────────────
-- Patched against the deployed body. `evaluate_gates` now carries ten kinds plus 0051's rest rule,
-- and retyping it is how one of them quietly changes.

do $mig$
declare
  src     text;
  patched text;
  anchor  text;
  branch  text;
  n       int;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'evaluate_gates';

  if src is null then raise exception 'evaluate_gates() is not deployed.'; end if;

  if src like '%LAB_APPROVED%' then
    raise notice 'evaluate_gates() already knows LAB_APPROVED.';
    return;
  end if;

  -- Inserted BEFORE the GM_APPROVAL branch, so the chain of `elsif`s stays grouped by subject:
  -- the two approval kinds sit together and a reader comparing them does not have to scroll.
  anchor := 'elsif g.kind = ''GM_APPROVAL'' then';
  n := position(anchor in src);
  if n = 0 then
    raise exception
      'evaluate_gates() has no GM_APPROVAL branch to anchor on. The body has moved — patch it by '
      'hand rather than letting this file report success.';
  end if;

  -- ⚠ CRLF bodies: built with explicit newlines, anchored on a statement. See 0050.
  branch :=
    'elsif g.kind = ''LAB_APPROVED'' then' || E'\n' ||
    '      -- 0054 · ENTERED IS NOT APPROVED.' || E'\n' ||
    '      --' || E'\n' ||
    '      -- Which laboratory activities are bound to hold THIS one, and has the latest decision' || E'\n' ||
    '      -- on each of them approved it? `lab_checkpoint_activity` carries the pairing, so a' || E'\n' ||
    '      -- per-bunker gate waits on its own bunker''s assay and not on all three.' || E'\n' ||
    '      --' || E'\n' ||
    '      -- A REJECTED or ABSENT decision does not open the gate. Neither does a recorded' || E'\n' ||
    '      -- result: a reading that nobody has approved is a reading, not an approval.' || E'\n' ||
    '      select count(*)::int,' || E'\n' ||
    '             count(*) filter (where lab.verdict = ''approved'')::int,' || E'\n' ||
    '             string_agg(distinct lab.checkpoint_code, '', '')' || E'\n' ||
    '        into v_out_n, v_cp, v_out_lbl' || E'\n' ||
    '      from (' || E'\n' ||
    '        select lca.checkpoint_code,' || E'\n' ||
    '               (select d.verdict from lab_decision d' || E'\n' ||
    '                 where d.batch_activity_id = lba.id' || E'\n' ||
    '                 order by d.seq desc limit 1) as verdict' || E'\n' ||
    '          from batch_activity lba' || E'\n' ||
    '          join lab_checkpoint_activity lca on lca.process_activity_id = lba.process_activity_id' || E'\n' ||
    '          join lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map' || E'\n' ||
    '                                and cp.code = lca.checkpoint_code' || E'\n' ||
    '         where lba.master_batch_id = ba.master_batch_id' || E'\n' ||
    '           and lca.gates_activity_code = ba.code' || E'\n' ||
    '           and cp.kind = ''GATE''' || E'\n' ||
    '      ) lab;' || E'\n' ||
    '' || E'\n' ||
    '      if coalesce(v_out_n, 0) = 0 then' || E'\n' ||
    '        -- A gate rule with nothing bound to it cannot be evaluated. Passing would silently' || E'\n' ||
    '        -- open production; failing would lock it for ever with no way to clear it. Say so.' || E'\n' ||
    '        v_verdict := ''unevaluable'';' || E'\n' ||
    '        v_vars := v_vars || jsonb_build_object(' || E'\n' ||
    '          ''checkpoint'', ''no laboratory checkpoint is bound to this activity'');' || E'\n' ||
    '      else' || E'\n' ||
    '        v_ok := (v_cp = v_out_n);' || E'\n' ||
    '        v_vars := v_vars || jsonb_build_object(' || E'\n' ||
    '          ''checkpoint'', coalesce(v_out_lbl, ''?''),' || E'\n' ||
    '          ''approved_count'', v_cp::text,' || E'\n' ||
    '          ''required_count'', v_out_n::text);' || E'\n' ||
    '      end if;' || E'\n' ||
    E'\n    ';

  patched := substr(src, 1, n - 1) || branch || substr(src, n);
  execute patched;
end
$mig$;


-- ── 2 · The rules. One per production activity a GATE checkpoint holds. ─────
-- Generated from the binding table, so the set of gates is whatever LAB-2026A says it is. Adding
-- a fifth gate to the checkpoint set and re-running this statement is the whole change.

with pd as (
  select id from public.process_definition where code = 'PROCESS-2026C' and version = 1
),
held as (
  select distinct pa.id as process_activity_id, pa.code, lca.checkpoint_map
  from pd
  join public.process_activity pa on pa.process_definition_id = pd.id
  join public.lab_checkpoint_activity lca on lca.gates_activity_code = pa.code
  join public.lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                               and cp.code = lca.checkpoint_code
  where cp.kind = 'GATE'
)
insert into public.gate_rule
  (process_activity_id, phase, kind, config, is_enabled, mapping_confidence,
   blocked_reason_template, ordering)
select held.process_activity_id, 'entry', 'LAB_APPROVED',
       jsonb_build_object('checkpoint_map', held.checkpoint_map),
       true, 'dictated',
       'Locked — waiting for laboratory approval. {checkpoint}: {approved_count} of '
       '{required_count} approved. A recorded result is not an approved result.',
       5
from held
where not exists (
  select 1 from public.gate_rule g
   where g.process_activity_id = held.process_activity_id
     and g.phase = 'entry' and g.kind = 'LAB_APPROVED');


-- ── 3 · What is gated, as data. ────────────────────────────────────────────

create or replace view public.v_lab_gate as
select
  pd.code                as process_code,
  cp.code                as checkpoint_code,
  cp.name                as checkpoint_name,
  cp.kind,
  lca.gates_activity_code as blocks_activity_code,
  gpa.label_template      as blocks_activity,
  (g.id is not null)      as rule_exists,
  g.is_enabled
from public.lab_checkpoint_activity lca
join public.lab_checkpoint cp on cp.checkpoint_map = lca.checkpoint_map
                             and cp.code = lca.checkpoint_code
join public.process_activity pa on pa.id = lca.process_activity_id
join public.process_definition pd on pd.id = pa.process_definition_id
left join public.process_activity gpa on gpa.process_definition_id = pd.id
                                     and gpa.code = lca.gates_activity_code
left join public.gate_rule g on g.process_activity_id = gpa.id
                            and g.phase = 'entry' and g.kind = 'LAB_APPROVED'
where cp.kind in ('GATE', 'DECISION');

grant select on public.v_lab_gate to authenticated;

comment on view public.v_lab_gate is
  'Every laboratory gate and decision, and the production activity it holds. A DECISION shows with '
  'rule_exists = false ON PURPOSE: LAB-MOIST-DEC branches the process, it does not block it, and '
  'the 67-68 % band it turns on is UNRESOLVED. 0054.';


-- ── 4 · The seeding must have produced what LAB-2026A describes. ───────────
-- Asserted here rather than trusted: a gate that silently failed to bind is a gate that silently
-- passes, which is the failure mode this whole migration exists to prevent.

do $$
declare
  n_gates int;
  n_rules int;
  n_dec   int;
begin
  select count(distinct checkpoint_code) into n_gates
    from public.v_lab_gate where kind = 'GATE';
  select count(*) into n_rules
    from public.v_lab_gate where kind = 'GATE' and rule_exists;
  select count(*) into n_dec
    from public.v_lab_gate where kind = 'DECISION' and rule_exists;

  if n_gates <> 4 then
    raise exception
      'LAB-2026A defines four gates; % are bound to a production activity. A gate that binds to '
      'nothing blocks nothing.', n_gates;
  end if;

  if n_rules = 0 then
    raise exception 'No LAB_APPROVED rule was created. The gates are described and not enforced.';
  end if;

  if n_dec > 0 then
    raise exception
      'A DECISION checkpoint has been given a blocking rule. LAB-MOIST-DEC branches the process; '
      'it does not hold it, and the 67-68 %% band is UNRESOLVED.';
  end if;

  raise notice 'LAB-2026A: % gates bound, % production activities held.', n_gates, n_rules;
end $$;
