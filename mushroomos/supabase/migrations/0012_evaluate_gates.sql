-- 0012 · B1 — evaluate_gates. docs/BUILD_SEQUENCE_KIRO.md §B1, docs/WORKFLOW_MODEL.md §2/§3.
--
-- WHAT WAS WRONG
--
-- 122 gate rules were seeded, correct, and READ BY NOTHING (CONTRACT_AUDIT §3.2). State moved on a
-- rule that appears in no seed and in no specification:
--
--     and earlier.rel_day < ba.rel_day
--     and earlier.state not in ('COMPLETED','SKIPPED')
--
-- A global day barrier. Every activity on Day n waited for EVERY activity on every earlier day,
-- which is the `ALL T1 → ALL T2` model the product contract §17 forbids. With three piles it made
-- T2 wait ~42 h of wall clock instead of ~24, and it made the parallelism the factory actually
-- runs impossible to express. `activate_batch` carried a second copy of the same barrier
-- (`rel_day = min(rel_day)`), so deleting one would not have been enough.
--
-- Both copies are gone. Nothing in this file reads `rel_day`.
--
-- WHAT THIS ADDS
--
--   evaluate_gates(activity, phase)  the ONLY place a gate is decided. Pure — it writes nothing.
--   advance_batch(batch)             the ONLY place a gate-driven state write happens.
--   activate_batch                   delegates. No barrier of its own.
--   submit_activity                  consults the exit gates instead of carrying its own copy
--                                    of the evidence rule.
--
-- THE SIX FAMILIES §B1 NAMES, mapped onto the ten kinds s04 and s05 actually contain:
--
--   PREDECESSOR  → PREDECESSOR, with ALL_INSTANCES / ANY_INSTANCE / SAME_SCOPE_INSTANCE
--   COMPOSITE    → BOTH (all sub-rules), EITHER_OR (any sub-rule)
--   TIME         → DAY0_DURATION, ELAPSED_TIME
--   EVIDENCE     → EVIDENCE_COMPLETE
--   LIMIT        → FIELD_IN_RANGE, SENSOR_THRESHOLD
--   —            → MACHINE_STINT_CLOSED, GM_APPROVAL  (see the two notes below)
--
-- NOTE 1 · MACHINE_STINT_CLOSED. 38 enabled `dictated` exit rules whose reason is "machine stint
-- on {machine_code} is still running". Machine stints are `machine_usage`, which is A5 and does not
-- exist. The rule is NOT special-cased and NOT ignored: it is evaluated as written — "no open stint
-- exists for this activity" — against the data that exists. With no stint table the set of open
-- stints is empty, so the predicate is satisfied. The lookup is written against the table by name
-- and guarded by a catalogue check, so the day A5 lands the same 38 rules start biting with no code
-- change here. Nothing was decided; the predicate was evaluated.
--
-- NOTE 2 · GM_APPROVAL. One enabled `dictated` entry rule on TN-LOAD, checkpoint 3, the
-- Phase-1 → Phase-2 release. The approver IS named — `ROLE_AND_APPROVAL_MODEL §1` gives the GM
-- "Approve management checkpoint 2–4" and §5 names checkpoint 3 explicitly. What does not exist is
-- anywhere to RECORD an approval: no `approval` table, no `management_checkpoint` table, and no
-- step in BUILD_SEQUENCE owns one. So this rule is also evaluated as written: no approval exists,
-- therefore it is not satisfied, therefore TN-LOAD stays LOCKED carrying its own seeded reason,
-- "Awaiting GM approval — checkpoint 3, Phase-1 to Phase-2 release".
--
-- That is truthful and it invents nothing, but it means A BATCH CANNOT REACH THE TUNNEL until
-- something can record a GM decision. Reported, not worked around. See docs/REPORTS/B1.md §5.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Reason rendering.
--
-- Every gate rule carries a `blocked_reason_template` and 0003 CHECKs that it is non-empty,
-- because a non-actionable state that cannot explain itself is the defect WORKFLOW_MODEL §2.1
-- exists to prevent. Substitution is deliberately total: any placeholder left unreplaced would
-- reach the operator as literal braces, so what remains is stripped and the fact is stated.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.render_gate_reason(p_template text, p_vars jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare
  out_text text := p_template;
  k text;
  v text;
begin
  for k, v in select * from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    out_text := replace(out_text, '{' || k || '}', coalesce(v, '—'));
  end loop;

  -- Anything the caller had no value for. Left in place it would render as `{machine_code}` on a
  -- card; replaced silently it would read as a fact nobody established.
  out_text := regexp_replace(out_text, '\{[a-z_]+\}', 'not recorded', 'g');
  return out_text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · PREDECESSOR, the three bindings.
--
-- SAME_SCOPE_INSTANCE is the one that matters. Pile 2's T2 waits on pile 2's T1 and on nothing
-- else — matched on `instance_no`, not on `scope_label`, because the label is display copy with
-- the count baked into it ('Pile 2 of 3') and the instance number is the identity.
--
-- AN EMPTY PREDECESSOR SET IS SATISFIED, under every binding. This is not leniency: a stream whose
-- material role has no material bound produces no instances at all (generate_activity_plan skips
-- it), so a gate naming it would otherwise deadlock a batch that was never supposed to run it. The
-- returned `total` is 0, so a caller can tell "satisfied because complete" from "satisfied because
-- absent".
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.gate_predecessor_status(
  p_batch uuid, p_instance_no int, p_codes jsonb, p_binding text
) returns table (ok boolean, blocker_title text, blocker_stream text, total int, done int)
language plpgsql stable set search_path = public as $$
declare
  v_total int := 0;
  v_done  int := 0;
  v_title text;
  v_stream text;
  v_binding text := coalesce(p_binding, 'ALL_INSTANCES');
begin
  if p_codes is null or jsonb_typeof(p_codes) <> 'array' or jsonb_array_length(p_codes) = 0 then
    return query select true, null::text, null::text, 0, 0;
    return;
  end if;

  select count(*)::int, count(*) filter (where ba.state in ('COMPLETED','SKIPPED'))::int
    into v_total, v_done
  from batch_activity ba
  where ba.master_batch_id = p_batch
    and ba.code in (select jsonb_array_elements_text(p_codes))
    and (v_binding <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = p_instance_no);

  if v_total = 0 then
    return query select true, null::text, null::text, 0, 0;
    return;
  end if;

  -- Name the instance that is actually holding this up, not an arbitrary one.
  select ba.title, ba.stream::text into v_title, v_stream
  from batch_activity ba
  where ba.master_batch_id = p_batch
    and ba.code in (select jsonb_array_elements_text(p_codes))
    and (v_binding <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = p_instance_no)
    and ba.state not in ('COMPLETED','SKIPPED')
  order by ba.instance_no
  limit 1;

  if v_binding = 'ANY_INSTANCE' then
    return query select v_done > 0, v_title, v_stream, v_total, v_done;
  else
    return query select v_done = v_total, v_title, v_stream, v_total, v_done;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · evaluate_gates · the single place a gate is decided.
--
-- PURE. It writes nothing, so it can be called from a screen, from a test, or from advance_batch
-- without side effects, and "why is this locked" and "should this open" are answered by the same
-- code rather than by two that agree today.
--
-- Four verdicts, not two:
--   pass         the rule is satisfied
--   fail         the rule is not satisfied, and `reason` says so in the seed's own words
--   skipped      the rule disabled itself — `is_enabled = false`, or C-28's confidence rule
--   unevaluable  the kind is not implemented. Reported, and it does not auto-fail: C-28's
--                principle is that a rule which cannot be trusted must not fail anything, and a
--                rule which cannot be evaluated is a stronger case of the same thing.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.evaluate_gates(p_activity uuid, p_phase text default 'entry')
returns table (
  rule_id            uuid,
  kind               text,
  binding            text,
  verdict            text,
  reason             text,
  is_enabled         boolean,
  mapping_confidence text,
  conflict_id        text,
  ordering           int
)
language plpgsql stable security definer set search_path = public as $$
declare
  ba        batch_activity;
  g         record;
  sub       jsonb;
  st        record;
  v_ok      boolean;
  v_vars    jsonb;
  v_verdict text;
  v_sub_ok  boolean;
  v_any_ok  boolean;
  v_fld     batch_activity_value;
  v_out_n   int;
  v_out_lbl text;
  v_actual  numeric;
  v_hours   numeric;
  v_remain  interval;
  v_machine text;
  v_stints_exist boolean;
begin
  if p_phase not in ('entry','exit') then
    raise exception 'phase must be entry or exit, got %', p_phase;
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  -- Does A5's machine-stint table exist yet? Checked once per call rather than per rule.
  select exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'machine_usage'
  ) into v_stints_exist;

  for g in
    select gr.* from gate_rule gr
    where gr.process_activity_id = ba.process_activity_id
      and gr.phase = p_phase
    order by gr.ordering, gr.id
  loop
    v_vars := jsonb_build_object('scope_label', ba.scope_label);
    v_verdict := null;
    v_ok := null;

    -- ── The rule's own switches come first. A disabled rule decides nothing. ──
    if not g.is_enabled then
      v_verdict := 'skipped';

    -- ── C-28 · a LIMIT whose mapping is not dictated or sop_direct must not auto-fail. ──
    elsif g.kind in ('FIELD_IN_RANGE','SENSOR_THRESHOLD')
          and g.mapping_confidence not in ('dictated','sop_direct') then
      v_verdict := 'skipped';

    elsif g.kind = 'PREDECESSOR' then
      select * into st from gate_predecessor_status(
        ba.master_batch_id, ba.instance_no, g.config->'activity_codes', g.predecessor_binding);
      v_ok := st.ok;
      v_vars := v_vars
        || jsonb_build_object('predecessor_label', st.blocker_title)
        || jsonb_build_object('stream_label',
             case when st.blocker_stream is null then null
                  else initcap(replace(st.blocker_stream, '_', ' ')) end);

    elsif g.kind in ('BOTH','EITHER_OR') then
      -- COMPOSITE. Each sub-rule carries its own kind, codes and binding.
      v_any_ok := false;
      v_ok := (g.kind = 'BOTH');
      for sub in select * from jsonb_array_elements(coalesce(g.config->'sub', '[]'::jsonb)) loop
        v_sub_ok := null;
        if sub->>'kind' = 'PREDECESSOR' then
          select * into st from gate_predecessor_status(
            ba.master_batch_id, ba.instance_no, sub->'activity_codes', sub->>'binding');
          v_sub_ok := st.ok;
          if not st.ok then
            v_vars := v_vars
              || jsonb_build_object('predecessor_label', st.blocker_title)
              || jsonb_build_object('stream_label',
                   case when st.blocker_stream is null then null
                        else initcap(replace(st.blocker_stream, '_', ' ')) end);
          end if;
        elsif sub->>'kind' = 'ELAPSED_TIME' then
          v_hours := nullif(sub->>'hours','')::numeric;
          v_sub_ok := ba.actual_start is not null and v_hours is not null
                      and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int);
        else
          -- A sub-rule this engine does not implement — SENSOR_THRESHOLD inside EITHER_OR, which
          -- needs the probe log that does not exist. Left NULL so it neither passes nor fails.
          v_sub_ok := null;
        end if;

        if g.kind = 'BOTH' then
          -- An unevaluable sub cannot be asserted, so it cannot satisfy a conjunction either;
          -- it is treated as absent rather than as false.
          if v_sub_ok is false then v_ok := false; end if;
        elsif v_sub_ok is true then
          v_any_ok := true;
        end if;
      end loop;

      if g.kind = 'EITHER_OR' then v_ok := v_any_ok; end if;

    elsif g.kind = 'DAY0_DURATION' then
      -- TIME. The window is a function of the SERVER clock and the Day-0 answer. `unblocks_at` is
      -- stamped by advance_batch at the moment the predecessors finished, which is the only moment
      -- the window can honestly be said to have started.
      if ba.day0_duration_hr is null then
        v_ok := false;
        v_vars := v_vars || jsonb_build_object(
          'required', 'not set' || coalesce(' (' || ba.tbd_marker || ')', ''),
          'remaining', 'unknown');
      elsif ba.unblocks_at is null then
        v_ok := false;
        v_remain := make_interval(secs => (ba.day0_duration_hr * 3600)::int);
        v_vars := v_vars || jsonb_build_object(
          'required', to_char(v_remain, 'HH24:MI'), 'remaining', 'not started');
      else
        v_ok := now() >= ba.unblocks_at;
        v_remain := greatest(ba.unblocks_at - now(), interval '0');
        v_vars := v_vars || jsonb_build_object(
          'required', to_char(make_interval(secs => (ba.day0_duration_hr * 3600)::int), 'HH24:MI'),
          'remaining', to_char(v_remain, 'HH24:MI'));
      end if;

    elsif g.kind = 'ELAPSED_TIME' then
      v_hours := nullif(g.config->>'hours','')::numeric;
      v_ok := ba.actual_start is not null and v_hours is not null
              and now() >= ba.actual_start + make_interval(secs => (v_hours * 3600)::int);
      v_vars := v_vars || jsonb_build_object(
        'elapsed', case when ba.actual_start is null then 'not started'
                        else round(extract(epoch from (now() - ba.actual_start)) / 3600, 1)::text end);

    elsif g.kind = 'EVIDENCE_COMPLETE' then
      -- EVIDENCE. Named requirements, each individually satisfied — never a photo count.
      -- Every column is qualified: this function's OUT parameters include `ordering`, and an
      -- unqualified reference is ambiguous between the variable and the column.
      select count(*)::int, string_agg(r.label, ', ' order by r.ordering)
        into v_out_n, v_out_lbl
      from batch_activity_evidence_req r
      where r.batch_activity_id = ba.id
        and r.gates_submission and r.satisfied_count < r.min_count;
      v_ok := coalesce(v_out_n, 0) = 0;
      v_vars := v_vars || jsonb_build_object(
        'outstanding_count', coalesce(v_out_n, 0)::text, 'outstanding_labels', v_out_lbl);

    elsif g.kind = 'FIELD_IN_RANGE' then
      -- LIMIT. Reached only when is_enabled AND the mapping is dictated or sop_direct (C-28).
      select * into v_fld from batch_activity_value
       where batch_activity_id = ba.id and field_key = g.config->>'field_key';

      if not found or v_fld.actual_value is null
         or v_fld.actual_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
        -- Nothing numeric was recorded. A limit cannot be applied to an absent reading, and
        -- inventing a verdict here is exactly what this product exists to prevent.
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object('actual', 'not recorded');
      else
        v_actual := v_fld.actual_value::numeric;
        v_ok := (v_fld.sop_min is null or v_actual >= v_fld.sop_min)
            and (v_fld.sop_max is null or v_actual <= v_fld.sop_max);
        v_vars := v_vars || jsonb_build_object(
          'actual', v_fld.actual_value,
          'min', coalesce(v_fld.sop_min::text, '—'),
          'max', coalesce(v_fld.sop_max::text, '—'));
      end if;

    elsif g.kind = 'MACHINE_STINT_CLOSED' then
      -- Evaluated as written: no OPEN stint may exist for this activity. See NOTE 1 in the header.
      select m.code into v_machine from machine m where m.id = ba.assigned_machine_id;
      v_vars := v_vars || jsonb_build_object('machine_code', v_machine);

      if v_stints_exist then
        execute 'select not exists (select 1 from public.machine_usage mu'
                || ' where mu.batch_activity_id = $1 and mu.ended_at is null)'
          into v_ok using ba.id;
      else
        -- No stint table, therefore no open stint, therefore the predicate holds. It starts
        -- biting the moment A5 creates the table — no change here.
        v_ok := true;
      end if;

    elsif g.kind = 'GM_APPROVAL' then
      -- Evaluated as written: an approval must exist. Nothing can record one. See NOTE 2.
      v_ok := false;

    else
      v_verdict := 'unevaluable';
    end if;

    if v_verdict is null then
      v_verdict := case when v_ok then 'pass' when v_ok is null then 'unevaluable' else 'fail' end;
    end if;

    return query select
      g.id,
      g.kind,
      g.predecessor_binding,
      v_verdict,
      case when v_verdict = 'fail' then render_gate_reason(g.blocked_reason_template, v_vars) end,
      g.is_enabled,
      g.mapping_confidence,
      g.conflict_id,
      g.ordering;
  end loop;
end;
$$;

revoke execute on function public.evaluate_gates(uuid, text) from anon;
grant execute on function public.evaluate_gates(uuid, text) to authenticated;
grant execute on function public.gate_predecessor_status(uuid, int, jsonb, text) to authenticated;
grant execute on function public.render_gate_reason(text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · advance_batch · the only place a gate-driven state write happens.
--
-- Idempotent and a function of current state, not of a sequence of events, so a late poll, a
-- double click and a cron tick all produce the same result (ARCHITECTURE_V2 §3).
--
-- THE BARRIER IS GONE. There is no `rel_day` in this function. An activity opens when ITS OWN
-- entry rules pass, which is what makes pile 2's T2 able to open while piles 1 and 3 are still
-- in T1.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.advance_batch(p_batch uuid)
returns table (opened int, resting int)
language plpgsql security definer set search_path = public as $$
declare
  n_opened  int := 0;
  n_resting int := 0;
  cand      record;
  fail      record;
begin
  -- 1 · A rest window that has elapsed opens. The DAY0_DURATION exit rule is what decides, so the
  --     countdown and the gate cannot disagree.
  for cand in
    select ba.id from batch_activity ba
    where ba.master_batch_id = p_batch and ba.state = 'WAITING_TIME'
      and ba.unblocks_at is not null
  loop
    if not exists (
      select 1 from evaluate_gates(cand.id, 'exit') v
      where v.kind = 'DAY0_DURATION' and v.verdict = 'fail'
    ) then
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;
    end if;
  end loop;

  -- 2 · Anything still shut is re-evaluated against its OWN entry rules.
  --
  --     WAITING_TIME with no unblocks_at is included: generate_activity_plan used to park rests
  --     there with no clock, so a rest could sit in the resting state with nothing running.
  for cand in
    select ba.id, ba.is_time_gate, ba.day0_duration_hr, ba.actual_start, ba.unblocks_at
    from batch_activity ba
    where ba.master_batch_id = p_batch
      and (ba.state = 'LOCKED' or (ba.state = 'WAITING_TIME' and ba.unblocks_at is null))
    order by ba.seq, ba.instance_no
  loop
    select v.reason, v.kind into fail
    from evaluate_gates(cand.id, 'entry') v
    where v.verdict = 'fail'
    order by v.ordering
    limit 1;

    if fail.reason is not null then
      -- Still shut, and it says why in the rule's own words rather than in this function's.
      update batch_activity
         set state = 'LOCKED', blocked_reason = fail.reason
       where id = cand.id and (state <> 'LOCKED' or coalesce(blocked_reason,'') <> fail.reason);
      continue;
    end if;

    if cand.is_time_gate then
      -- A rest does not become READY. It starts resting, and its clock starts now — the moment its
      -- predecessors actually finished.
      update batch_activity ba
         set state = 'WAITING_TIME',
             actual_start = coalesce(ba.actual_start, now()),
             unblocks_at = case
               when ba.day0_duration_hr is not null
                 then coalesce(ba.actual_start, now())
                      + make_interval(secs => (ba.day0_duration_hr * 3600)::int)
               else ba.unblocks_at end,
             blocked_reason = case
               when ba.day0_duration_hr is null then
                 'Rest duration has not been set for this batch'
                 || coalesce(' — ' || ba.tbd_marker || ' is unresolved', '')
               when ba.day0_duration_hr >= 1 then
                 'Resting — ' || round(ba.day0_duration_hr, 2)::text || ' h required'
               else
                 'Resting — ' || round(ba.day0_duration_hr * 60)::text || ' min required'
             end
       where ba.id = cand.id;
      n_resting := n_resting + 1;
    else
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;
    end if;
  end loop;

  return query select n_opened, n_resting;
end;
$$;

create or replace function public.release_elapsed_rests(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.advance_batch(p_batch);
  return coalesce(r.opened, 0) + coalesce(r.resting, 0);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · activate_batch · freezes the baseline, then delegates.
--
-- The second copy of the barrier lived here: `rel_day = (select min(rel_day) …)` opened "the first
-- day" wholesale, regardless of any gate. Now activation writes no activity state at all — it
-- flips the batch to active and asks advance_batch what that makes available.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.activate_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare blockers text;
begin
  select string_agg(message, '; ') into blockers
  from public.validate_batch(p_batch_id) where severity = 'blocking';

  if blockers is not null then
    raise exception 'Cannot activate — %', left(blockers, 400) using errcode = 'check_violation';
  end if;

  update master_batch
     set status = 'active', activated_at = now(), activated_by = auth.uid()
   where id = p_batch_id and status = 'draft';

  -- Whatever the gates say is available becomes available. Nothing else.
  perform public.advance_batch(p_batch_id);

  insert into notification (master_batch_id, to_role, kind, message, sent_by)
  select p_batch_id, ba.responsible_role, 'gate_opened', ba.title || ' is ready', auth.uid()
  from batch_activity ba
  where ba.master_batch_id = p_batch_id and ba.state = 'READY';

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'activate_batch', 'master_batch',
          p_batch_id::text, 'Baseline frozen');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · submit_activity · consults the exit gates instead of carrying its own copy.
--
-- Unchanged in behaviour except that the evidence check is now `evaluate_gates(…, 'exit')`. The
-- rule was duplicated: 29 EVIDENCE_COMPLETE rows said one thing and an inline query said the same
-- thing, and only one of them was reachable. Out-of-range still NEVER blocks recording.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_activity(
  p_activity uuid,
  p_values   jsonb default '{}'::jsonb,
  p_remarks  text  default null
) returns table (new_state text, out_of_range int, outstanding_evidence text)
language plpgsql security definer set search_path = public as $$
declare
  ba          batch_activity;
  b           master_batch;
  k           text;
  v           text;
  fld         batch_activity_value;
  flag        text;
  target      numeric;
  target_src  text;
  dev_count   int := 0;
  reasons     text := '';
  outstanding text;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  select * into b from master_batch where id = ba.master_batch_id;
  if b.status <> 'active' then
    raise exception 'Batch % is % — activate it before recording work', b.code, b.status;
  end if;
  if ba.state not in ('READY','IN_PROGRESS','RETURNED') then
    raise exception '% is %, so it cannot be submitted', ba.title, ba.state;
  end if;

  -- Record reality first. Out of range NEVER blocks recording.
  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;

    flag := 'not_applicable';

    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      -- Variance is measured against column ② (the Day-0 target) when the admin set one, falling
      -- back to column ① (the SOP band). docs/DOMAIN_MODEL.md §5.
      target := null;
      target_src := null;

      if fld.day0_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
        target := fld.day0_value::numeric;
        target_src := 'the Day-0 plan';
      elsif ba.planned_qty_mt is not null and k like '%qty%' then
        target := ba.planned_qty_mt;
        target_src := 'the Day-0 plan';
      end if;

      if fld.sop_min is not null or fld.sop_max is not null then
        if (fld.sop_min is not null and v::numeric < fld.sop_min)
           or (fld.sop_max is not null and v::numeric > fld.sop_max) then
          flag := 'out_of_range';
          dev_count := dev_count + 1;
          reasons := reasons || fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                     || ' outside the SOP band ' || coalesce(fld.sop_min::text,'')
                     || '–' || coalesce(fld.sop_max::text,'') || '; ';
        else
          flag := 'in_range';
        end if;

      elsif target is not null and target > 0 then
        if abs(v::numeric - target) / target > 0.10 then
          flag := 'out_of_range';
          dev_count := dev_count + 1;
          reasons := reasons || fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                     || ' against ' || target || coalesce(' ' || fld.unit,'')
                     || ' in ' || target_src || ' ('
                     || case when v::numeric > target then '+' else '' end
                     || round(v::numeric - target, 2) || '); ';
        else
          flag := 'in_range';
        end if;
      end if;
    end if;

    update batch_activity_value
       set actual_value = v,
           actual_recorded_at = now(),
           actual_recorded_by = auth.uid(),
           variance_flag = flag,
           remarks = coalesce(nullif(p_remarks,''), remarks)
     where id = fld.id;
  end loop;

  -- Evidence gates SUBMISSION, not recording — and the gate table is what says so.
  select v.reason into outstanding
  from public.evaluate_gates(p_activity, 'exit') v
  where v.kind = 'EVIDENCE_COMPLETE' and v.verdict = 'fail'
  order by v.ordering
  limit 1;

  if outstanding is not null then
    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(actual_start, now()),
           blocked_reason = null
     where id = p_activity;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
    values (auth.uid(), public.current_app_role(), 'submit_blocked_on_evidence',
            'batch_activity', p_activity::text, outstanding);

    return query select 'IN_PROGRESS'::text, dev_count, outstanding;
    return;
  end if;

  update batch_activity
     set state = case when dev_count > 0 then 'DEVIATION'::activity_state
                      else 'COMPLETED'::activity_state end,
         actual_start = coalesce(actual_start, now()),
         actual_end = now(),
         submitted_at = now(),
         submitted_by = auth.uid(),
         blocked_reason = case when dev_count > 0
           then rtrim(reasons, '; ') || ' — held for supervisor review' end
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'submit_activity', 'batch_activity',
          p_activity::text,
          case when dev_count > 0 then 'DEVIATION · ' || rtrim(reasons,'; ')
               else coalesce(nullif(p_remarks,''), 'submitted') end);

  if dev_count = 0 then
    perform public.advance_batch(ba.master_batch_id);
  else
    -- A deviation holds the line. Whatever comes next in the SAME stream stops and says which
    -- activity stopped it. Not the whole batch — the parallel streams are independent and
    -- blocking them would be a lie about what is wrong. B2 replaces this with a real deviation.
    update batch_activity nxt
       set state = 'BLOCKED',
           blocked_reason = 'Blocked — ' || ba.title || ' (' || ba.scope_label
                            || ') is in deviation: ' || rtrim(reasons, '; ')
     where nxt.master_batch_id = ba.master_batch_id
       and nxt.stream = ba.stream
       and nxt.seq > ba.seq
       and nxt.state in ('LOCKED','READY','WAITING_TIME')
       and nxt.seq = (
         select min(n2.seq) from batch_activity n2
         where n2.master_batch_id = ba.master_batch_id
           and n2.stream = ba.stream
           and n2.seq > ba.seq
           and n2.state in ('LOCKED','READY','WAITING_TIME')
       );
  end if;

  return query
    select (select state::text from batch_activity where id = p_activity), dev_count, null::text;
end;
$$;

grant execute on function public.advance_batch(uuid) to authenticated;
grant execute on function public.release_elapsed_rests(uuid) to authenticated;
grant execute on function public.activate_batch(uuid) to authenticated;
grant execute on function public.submit_activity(uuid, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · Re-derive every running batch from the corrected engine.
--
-- advance_batch is a function of current state, so anything that genuinely should be open or
-- resting comes straight back — this time because its own gates say so.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare bid uuid;
begin
  for bid in select id from master_batch where status = 'active' loop
    perform public.advance_batch(bid);
  end loop;
end $$;
