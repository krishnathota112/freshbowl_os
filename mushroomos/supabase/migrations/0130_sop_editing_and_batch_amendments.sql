-- ─────────────────────────────────────────────────────────────────────────────
-- 0130 · SOP EDITING (drafts) AND BATCH AMENDMENTS (running batches).
--
-- Two ways to add an activity "after this step", with different reach:
--
-- 1 · A DRAFT SOP VERSION  (clone_process_definition + draft_insert_activity)
--     Copy-on-write, exactly as every prior version was made (0043 … 0115): a published version is
--     cloned into a draft, the draft is edited, and publish_process_definition / set_current_process
--     (unchanged) decide whether FUTURE batches use it. Running batches never move.
--     The insert re-times only what really depends on the new step: a dependent moves by the part of
--     the new duration its own slack cannot absorb, and that push walks down the graph. Parallel
--     branches with no path from the insertion point keep their hours (Geetha 04 / 08).
--
-- 2 · A BATCH AMENDMENT  (amend_batch_add_activity)
--     One running batch gets one extra task, recorded as an amendment with a reason. No frozen plan
--     column of any existing row is written (fn_plan_is_frozen still guards them). The new task has
--     its own plan, and the steps that used to wait for the chosen step now wait for the new one.
--     That re-wiring is done the same way as a new version — the dependents are pointed at a copy of
--     their own SOP activity whose entry rule names the new task — so the gate engine, the start
--     guard and project_batch need no change: the forecast moves only down the real dependency chain.
--     The copies live in a per-batch definition 'AMEND-<batch>' (status archived: never selectable,
--     never publishable).
--
-- NOT DONE, DELIBERATELY: a Lab check or cleaning chosen on an insert is RECORDED, not invented. Which
-- Lab parameters and which cleaning checklist apply is a factory decision (Geetha 14 · NEEDS FACTORY
-- DECISION); the amendment row carries the request so it is visible and auditable.
--
-- Rollback: db-rollback/pre_0130__sop_editing.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── amendment register ───────────────────────────────────────────────────────
create table if not exists public.batch_amendment (
  id                 uuid primary key default gen_random_uuid(),
  master_batch_id    uuid not null references public.master_batch(id) on delete cascade,
  kind               text not null default 'insert_activity' check (kind in ('insert_activity')),
  after_activity_id  uuid references public.batch_activity(id) on delete set null,
  new_activity_id    uuid references public.batch_activity(id) on delete cascade,
  template_code      text,
  title              text not null,
  duration_hr        numeric not null check (duration_hr > 0),
  is_hold            boolean not null default false,
  lab_check          text not null default 'none' check (lab_check in ('none','before','after','both')),
  cleaning           text not null default 'none' check (cleaning in ('none','before','after','both')),
  reason             text not null check (length(trim(reason)) >= 5),
  rewired_codes      text[] not null default '{}',
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now()
);
alter table public.batch_amendment enable row level security;
drop policy if exists batch_amendment_read on public.batch_amendment;
create policy batch_amendment_read on public.batch_amendment for select to authenticated using (true);
drop trigger if exists trg_audit_ins on public.batch_amendment;
create trigger trg_audit_ins after insert on public.batch_amendment for each row execute function public.fn_audit('id');

-- ── helper: copy one SOP activity (and everything hanging off it) into a definition ─────────────
-- Column lists are read from the catalogue so a column added by a later migration is copied too.
create or replace function public.sop_copy_activity(
  p_src uuid, p_def uuid, p_code text, p_copy_rules boolean, p_copy_lab boolean
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_new uuid;
  v_cols text;
  t text;
begin
  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'process_activity'
     and column_name not in ('id', 'process_definition_id', 'code') and is_generated = 'NEVER';
  execute format('insert into process_activity (process_definition_id, code, %1$s) '
                 'select $1, $2, %1$s from process_activity where id = $3 returning id', v_cols)
     into v_new using p_def, p_code, p_src;

  foreach t in array array['activity_field', 'evidence_requirement', 'resource_requirement', 'movement_rule', 'activity_variant']
               || case when p_copy_rules then array['gate_rule'] else '{}'::text[] end
               || case when p_copy_lab then array['lab_checkpoint_activity'] else '{}'::text[] end
  loop
    select string_agg(quote_ident(column_name), ',' order by ordinal_position) into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t
       and column_name not in ('id', 'process_activity_id') and is_generated = 'NEVER';
    if v_cols is null then continue; end if;
    execute format('insert into %1$I (process_activity_id, %2$s) select $1, %2$s from %1$I where process_activity_id = $2',
                   t, v_cols) using v_new, p_src;
  end loop;
  return v_new;
end;
$fn$;
revoke all on function public.sop_copy_activity(uuid, uuid, text, boolean, boolean) from public, anon, authenticated;

-- ── 1 · DRAFT SOP VERSIONS ──────────────────────────────────────────────────
create or replace function public.clone_process_definition(
  p_from uuid, p_code text default null, p_name text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  src process_definition;
  v_code text;
  v_ver int;
  v_new uuid;
  a record;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'draft a new SOP version');
  select * into src from process_definition where id = p_from;
  if not found then raise exception 'No such process definition: %', p_from; end if;
  if src.code like 'AMEND-%' then raise exception 'An amendment record is not an SOP and cannot be cloned.'; end if;

  v_code := coalesce(nullif(trim(p_code), ''), src.code);
  if v_code like 'AMEND-%' then raise exception 'AMEND- is reserved for batch amendments.'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from process_definition where code = v_code;

  insert into process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
                                  envelope_confidence, envelope_hours, envelope_hour_source)
  values (v_code, coalesce(nullif(trim(p_name), ''), src.name), v_ver, 'draft',
          src.source_ref || ' · drafted from ' || src.code || ' v' || src.version || ' on ' || to_char(now(), 'DD Mon YYYY'),
          src.anchor_day_label, src.total_days, src.envelope_confidence, src.envelope_hours, src.envelope_hour_source)
  returning id into v_new;

  for a in select id, code from process_activity where process_definition_id = p_from loop
    perform public.sop_copy_activity(a.id, v_new, a.code, true, true);
  end loop;
  return v_new;
end;
$fn$;
revoke all on function public.clone_process_definition(uuid, text, text) from public, anon;
grant execute on function public.clone_process_definition(uuid, text, text) to authenticated;

-- Push the planned hours of everything downstream of one changed activity. Pure arithmetic on the
-- draft's own graph: delta(X) = max over X's predecessors P of (delta(P) − slack(P→X)), never < 0.
create or replace function public.sop_push_downstream(p_def uuid, p_changed text, p_old_end numeric, p_delta numeric)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_delta jsonb := jsonb_build_object(p_changed, p_delta);
  v_oldend jsonb;
  r record;
  e record;
  d numeric;
  best numeric;
  n int := 0;
begin
  select jsonb_object_agg(code, coalesce(standard_end_hour, standard_start_hour)) into v_oldend
    from process_activity where process_definition_id = p_def;
  v_oldend := v_oldend || jsonb_build_object(p_changed, p_old_end);

  for r in select * from process_activity
            where process_definition_id = p_def and code <> p_changed and standard_start_hour is not null
            order by standard_start_hour, seq
  loop
    best := 0;
    for e in select jsonb_array_elements_text(g.config->'activity_codes') as pred,
                    coalesce(nullif(g.config->>'min_rest_hr', '')::numeric, 0) as rest,
                    coalesce(g.config->>'when', '') = 'started' as on_start
               from gate_rule g
              where g.process_activity_id = r.id and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
    loop
      d := (v_delta->>e.pred)::numeric;
      if d is null or d <= 0 then continue; end if;
      if e.on_start then
        best := greatest(best, d);   -- a "with X" step moves exactly as X's start moves
      else
        best := greatest(best, d - greatest(0, r.standard_start_hour - ((v_oldend->>e.pred)::numeric + e.rest)));
      end if;
    end loop;
    if best > 0 then
      v_delta := v_delta || jsonb_build_object(r.code, best);
      update process_activity
         set standard_start_hour = standard_start_hour + best,
             standard_end_hour = standard_end_hour + best,
             rel_day = floor((standard_start_hour + best) / 24)::int
       where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$fn$;
revoke all on function public.sop_push_downstream(uuid, text, numeric, numeric) from public, anon, authenticated;

create or replace function public.draft_insert_activity(
  p_def uuid, p_after_code text, p_template_code text, p_title text,
  p_duration_hr numeric, p_is_hold boolean default false
) returns table (new_code text, moved integer, standard_hr numeric)
language plpgsql security definer set search_path = public as $fn$
declare
  d process_definition;
  a process_activity;
  t process_activity;
  v_new uuid;
  v_code text;
  v_start numeric;
  v_moved int;
  v_std numeric;
  dep record;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'edit a draft SOP');
  select * into d from process_definition where id = p_def;
  if not found then raise exception 'No such process definition: %', p_def; end if;
  if d.status <> 'draft' or d.code like 'AMEND-%' then
    raise exception '% v% is %. Only a draft SOP version can be edited — draft a new version first.', d.code, d.version, d.status
      using errcode = 'check_violation';
  end if;
  if p_duration_hr is null or p_duration_hr <= 0 or p_duration_hr * 2 <> floor(p_duration_hr * 2) then
    raise exception 'Duration must be a positive number of hours in half-hour steps.';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Give the new activity a name.'; end if;

  select * into a from process_activity where process_definition_id = p_def and code = p_after_code;
  if not found then raise exception 'No activity % in this draft.', p_after_code; end if;
  if a.standard_start_hour is null then raise exception '% has no planned hour, so nothing can be placed after it.', a.code; end if;
  select * into t from process_activity where process_definition_id = p_def and code = p_template_code;
  if not found then raise exception 'No template activity % in this draft.', p_template_code; end if;

  select 'ADD' || lpad((count(*) + 1)::text, 2, '0') || '-' || regexp_replace(a.code, '^ADD[0-9]+-', '') into v_code
    from process_activity where process_definition_id = p_def and code like 'ADD__-%';
  v_start := coalesce(a.standard_end_hour, a.standard_start_hour);

  v_new := public.sop_copy_activity(t.id, p_def, v_code, false, false);
  update process_activity
     set label_template = trim(p_title), stream = a.stream, scope = a.scope, cardinality_rule = a.cardinality_rule,
         stage = a.stage, seq = a.seq, parallel_group = a.parallel_group,
         standard_start_hour = v_start, standard_end_hour = v_start + p_duration_hr,
         rel_day = floor(v_start / 24)::int, standard_hour_source = 'sop_duration_chain',
         duration_target_min_hr = p_duration_hr, duration_target_max_hr = p_duration_hr,
         is_hold = coalesce(p_is_hold, false), is_time_gate = coalesce(p_is_hold, false),
         is_pre_h0 = false, pre_h0_offset = null, planning_unresolved = false,
         timing_confidence = a.timing_confidence, material_role = null, required_material_code = null,
         source_ref = 'Inserted after ' || a.code || ' in the SOP editor, ' || to_char(now(), 'DD Mon YYYY')
   where id = v_new;

  insert into gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence, blocked_reason_template, ordering)
  values (v_new, 'entry', 'PREDECESSOR', jsonb_build_object('activity_codes', jsonb_build_array(a.code)),
          case when a.scope = 'MASTER' then 'ALL_INSTANCES' else 'SAME_SCOPE_INSTANCE' end, true, 'dictated',
          'Waiting for {predecessor_label}', 10),
         (v_new, 'exit', 'MIN_DURATION', jsonb_build_object('hours', p_duration_hr, 'source', 'SOP editor insertion'),
          null, true, 'dictated', 'Needs {duration} before it can finish', 20);
  if exists (select 1 from evidence_requirement where process_activity_id = v_new) then
    insert into gate_rule (process_activity_id, phase, kind, config, is_enabled, mapping_confidence, blocked_reason_template, ordering)
    values (v_new, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb, true, 'dictated', 'Photos are still missing', 30);
  end if;

  -- The steps that waited for A (on its finish) now wait for the new activity.
  for dep in select g.id, g.config from gate_rule g join process_activity pa on pa.id = g.process_activity_id
              where pa.process_definition_id = p_def and pa.id <> v_new and g.phase = 'entry' and g.kind = 'PREDECESSOR'
                and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started'
  loop
    update gate_rule
       set config = jsonb_set(dep.config, '{activity_codes}',
             (select jsonb_agg(case when x = a.code then v_code else x end) from jsonb_array_elements_text(dep.config->'activity_codes') x))
     where id = dep.id;
  end loop;

  v_moved := public.sop_push_downstream(p_def, v_code, v_start, p_duration_hr);

  -- A stated envelope follows the process it states; otherwise publish would refuse the draft.
  select calculated_standard_hr into v_std from v_process_standard where process_definition_id = p_def;
  if d.envelope_hours is not null and v_std is not null and v_std <> d.envelope_hours then
    update process_definition set envelope_hours = ceil(v_std)::int where id = p_def;
  end if;
  return query select v_code, v_moved, v_std;
end;
$fn$;
revoke all on function public.draft_insert_activity(uuid, text, text, text, numeric, boolean) from public, anon;
grant execute on function public.draft_insert_activity(uuid, text, text, text, numeric, boolean) to authenticated;

create or replace function public.discard_draft_process(p_def uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare d process_definition;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'discard a draft SOP');
  select * into d from process_definition where id = p_def;
  if not found then return; end if;
  if d.status <> 'draft' or d.code like 'AMEND-%' then raise exception 'Only a draft SOP version can be discarded.'; end if;
  if exists (select 1 from master_batch where process_definition_id = p_def) then
    raise exception 'A batch was created from this draft; it cannot be discarded.';
  end if;
  delete from process_definition where id = p_def;
end;
$fn$;
revoke all on function public.discard_draft_process(uuid) from public, anon;
grant execute on function public.discard_draft_process(uuid) to authenticated;

-- ── 2 · BATCH AMENDMENTS ────────────────────────────────────────────────────
create or replace function public.amend_batch_add_activity(
  p_batch uuid, p_after uuid, p_template_code text, p_title text, p_duration_hr numeric,
  p_is_hold boolean default false, p_lab_check text default 'none', p_cleaning text default 'none',
  p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  b master_batch;
  a batch_activity;
  t process_activity;
  v_def uuid;
  v_code text;
  v_pa uuid;
  v_new uuid;
  v_start_h numeric;
  v_start_at timestamptz;
  v_n int;
  dep record;
  v_copy uuid;
  v_map jsonb := '{}'::jsonb;
  v_rewired text[] := '{}';
begin
  perform public.assert_role(array['admin']::app_role[], 'amend a running batch');
  select * into b from master_batch where id = p_batch for update;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status not in ('active', 'draft') then
    raise exception 'Batch % is %; only a draft or running batch can be amended.', b.code, b.status using errcode = 'check_violation';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null or length(trim(p_reason)) < 5 then
    raise exception 'Say why this batch needs the extra step (at least a few words). It is kept in the batch record.';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Give the new activity a name.'; end if;
  if p_duration_hr is null or p_duration_hr <= 0 or p_duration_hr * 2 <> floor(p_duration_hr * 2) then
    raise exception 'Duration must be a positive number of hours in half-hour steps.';
  end if;

  select * into a from batch_activity where id = p_after and master_batch_id = p_batch;
  if not found then raise exception 'That step is not part of batch %.', b.code; end if;
  if a.before_tracking then raise exception '% happened before MushroomOS tracked this batch; nothing can be inserted before tracked work.', a.title; end if;
  if a.baseline_start_hour is null then raise exception '% has no planned hour, so nothing can be placed after it.', a.title; end if;

  select * into t from process_activity where process_definition_id = b.process_definition_id and code = p_template_code;
  if not found then raise exception 'No activity % in this batch''s SOP to use as the template.', p_template_code; end if;

  -- Work that has already begun cannot be made to wait for something inserted before it.
  for dep in
    select ba.id, ba.title, ba.actual_start
      from batch_activity ba
      join gate_rule g on g.process_activity_id = ba.process_activity_id
     where ba.master_batch_id = p_batch and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
       and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started'
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = a.instance_no)
       and ba.actual_start is not null
  loop
    raise exception '"%" has already started, so a step cannot be inserted in front of it. Pick a later point.', dep.title
      using errcode = 'check_violation';
  end loop;

  -- The batch's amendment record (one per batch; archived so it is never a selectable or publishable SOP).
  select id into v_def from process_definition where code = 'AMEND-' || b.id::text;
  if v_def is null then
    insert into process_definition (code, name, version, status, source_ref, anchor_day_label, total_days, envelope_confidence)
    select 'AMEND-' || b.id::text, 'Amendments to batch ' || b.code, 1, 'archived',
           'Batch-specific amendments to ' || b.code || ' — not an SOP', pd.anchor_day_label, pd.total_days, 'UNRESOLVED'
      from process_definition pd where pd.id = b.process_definition_id
    returning id into v_def;
  end if;

  select count(*) + 1 into v_n from batch_amendment where master_batch_id = p_batch;
  v_code := 'AMD' || lpad(v_n::text, 2, '0') || '-' || regexp_replace(a.code, '^AMD[0-9]+-', '');
  v_start_h := coalesce(a.baseline_end_hour, a.baseline_start_hour);
  v_start_at := coalesce(a.planned_end_at, a.planned_start_at);

  v_pa := public.sop_copy_activity(t.id, v_def, v_code, false, false);
  update process_activity
     set label_template = trim(p_title), stream = a.stream, scope = a.scope, stage = (select stage from process_activity where id = a.process_activity_id),
         seq = a.seq, standard_start_hour = v_start_h, standard_end_hour = v_start_h + p_duration_hr,
         rel_day = floor(v_start_h / 24)::int, standard_hour_source = 'sop_duration_chain',
         duration_target_min_hr = p_duration_hr, duration_target_max_hr = p_duration_hr,
         is_hold = coalesce(p_is_hold, false), is_time_gate = coalesce(p_is_hold, false),
         is_pre_h0 = false, pre_h0_offset = null, planning_unresolved = false, material_role = null, required_material_code = null,
         default_enabled = true, source_ref = 'Batch ' || b.code || ' amendment: ' || trim(p_reason)
   where id = v_pa;
  insert into gate_rule (process_activity_id, phase, kind, config, predecessor_binding, is_enabled, mapping_confidence, blocked_reason_template, ordering)
  values (v_pa, 'entry', 'PREDECESSOR', jsonb_build_object('activity_codes', jsonb_build_array(a.code)),
          'ALL_INSTANCES', true, 'dictated', 'Waiting for {predecessor_label}', 10),
         (v_pa, 'exit', 'MIN_DURATION', jsonb_build_object('hours', p_duration_hr, 'source', 'batch amendment'),
          null, true, 'dictated', 'Needs {duration} before it can finish', 20);
  if exists (select 1 from evidence_requirement where process_activity_id = v_pa) then
    insert into gate_rule (process_activity_id, phase, kind, config, is_enabled, mapping_confidence, blocked_reason_template, ordering)
    values (v_pa, 'exit', 'EVIDENCE_COMPLETE', '{}'::jsonb, true, 'dictated', 'Photos are still missing', 30);
  end if;

  insert into batch_activity (
    master_batch_id, process_activity_id, code, title, stream, rel_day, seq, scope, scope_label, instance_no,
    baseline_start_hour, baseline_end_hour, planned_start_at, planned_end_at,
    duration_target_min_hr, duration_target_max_hr, is_time_gate, is_pre_h0, is_hold, state, blocked_reason)
  values (
    p_batch, v_pa, v_code, trim(p_title), a.stream, floor(v_start_h / 24)::int, a.seq, a.scope, a.scope_label, a.instance_no,
    v_start_h, v_start_h + p_duration_hr, v_start_at,
    case when v_start_at is null then null else v_start_at + make_interval(secs => (p_duration_hr * 3600)::int) end,
    p_duration_hr, p_duration_hr, coalesce(p_is_hold, false), false, coalesce(p_is_hold, false),
    case when b.status = 'draft' then 'LOCKED' else 'WAITING_CONDITION' end::activity_state,
    'Waiting for ' || a.title)
  returning id into v_new;

  insert into batch_activity_evidence_req (batch_activity_id, key, label, media_kinds, min_count, gates_submission, capture_hint, ordering, capture_phase)
  select v_new, er.key, er.label, er.media_kinds, er.min_count, er.gates_submission, er.capture_hint, er.ordering, er.capture_phase
    from evidence_requirement er where er.process_activity_id = v_pa;
  insert into batch_activity_value (batch_activity_id, field_key, label, unit, sop_value, sop_min, sop_max, sop_source_ref, conflict_id,
                                    variance_allowed, section, operator_input, display_order, datatype)
  select v_new, af.key, af.label, af.unit, af.sop_value, af.sop_min, af.sop_max, af.sop_source_ref, af.conflict_id,
         af.default_variance, af.section, af.operator_input, af.display_order, af.datatype
    from activity_field af where af.process_activity_id = v_pa;

  -- Re-wire: every step that waited for A's finish now waits for the new task. Each dependent is pointed at
  -- a copy of its own SOP activity (in the amendment record) whose rule names the new code. Plan columns untouched.
  for dep in
    select distinct on (ba.id) ba.id as ba_id, ba.code, ba.process_activity_id as pa_id, pa.process_definition_id as pa_def
      from batch_activity ba
      join process_activity pa on pa.id = ba.process_activity_id
      join gate_rule g on g.process_activity_id = ba.process_activity_id
     where ba.master_batch_id = p_batch and ba.id <> v_new and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
       and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started'
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = a.instance_no)
  loop
    if dep.pa_def = v_def then
      v_copy := dep.pa_id;                                   -- already this batch's copy: edit it in place
    elsif v_map ? dep.pa_id::text then
      v_copy := (v_map->>dep.pa_id::text)::uuid;
    else
      v_copy := public.sop_copy_activity(dep.pa_id, v_def,
                  dep.code || '~' || v_n::text || '~' || substr(md5(dep.pa_id::text), 1, 4), true, true);
      v_map := v_map || jsonb_build_object(dep.pa_id::text, v_copy);
    end if;
    update gate_rule g
       set config = jsonb_set(g.config, '{activity_codes}',
             (select jsonb_agg(case when x = a.code then v_code else x end) from jsonb_array_elements_text(g.config->'activity_codes') x))
     where g.process_activity_id = v_copy and g.phase = 'entry' and g.kind = 'PREDECESSOR'
       and g.config->'activity_codes' ? a.code and coalesce(g.config->>'when', '') <> 'started';
    update batch_activity set process_activity_id = v_copy where id = dep.ba_id and process_activity_id <> v_copy;
    v_rewired := v_rewired || dep.code;
  end loop;

  insert into batch_amendment (master_batch_id, after_activity_id, new_activity_id, template_code, title, duration_hr,
                               is_hold, lab_check, cleaning, reason, rewired_codes, created_by)
  values (p_batch, a.id, v_new, p_template_code, trim(p_title), p_duration_hr, coalesce(p_is_hold, false),
          coalesce(p_lab_check, 'none'), coalesce(p_cleaning, 'none'), trim(p_reason), v_rewired, auth.uid());

  if b.status = 'active' then
    perform public.advance_batch(p_batch);
  end if;
  return v_new;
end;
$fn$;
revoke all on function public.amend_batch_add_activity(uuid, uuid, text, text, numeric, boolean, text, text, text) from public, anon;
grant execute on function public.amend_batch_add_activity(uuid, uuid, text, text, numeric, boolean, text, text, text) to authenticated;

create or replace view public.v_batch_amendment with (security_invoker = on) as
select am.*, mb.code as batch_code, aft.title as after_title, aft.baseline_end_hour as after_end_hour,
       nw.code as new_code, nw.state::text as new_state, nw.baseline_start_hour as new_start_hour,
       nw.baseline_end_hour as new_end_hour, p.display_name as created_by_name
  from public.batch_amendment am
  join public.master_batch mb on mb.id = am.master_batch_id
  left join public.batch_activity aft on aft.id = am.after_activity_id
  left join public.batch_activity nw on nw.id = am.new_activity_id
  left join public.profiles p on p.id = am.created_by;
grant select on public.v_batch_amendment to authenticated;

notify pgrst, 'reload schema';
