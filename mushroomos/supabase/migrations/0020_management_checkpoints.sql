-- 0020 · Management checkpoints.  (B6)
-- docs/BUILD_SEQUENCE_KIRO.md §B6, docs/ROLE_AND_APPROVAL_MODEL.md §1 · §2 · §5.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS STEP EXISTS
--
-- `s04` seeds an enabled, `dictated` `GM_APPROVAL` entry rule on `TN-LOAD` — checkpoint 3, the
-- Phase-1 → Phase-2 release. B1 evaluated it exactly as written:
--
--     elsif g.kind = 'GM_APPROVAL' then
--       -- Evaluated as written: an approval must exist. Nothing can record one. See NOTE 2.
--       v_ok := false;
--
-- No approval could exist, because nothing in the system could record one. **So no batch could ever
-- reach the tunnel.** B1 was right to report that rather than special-case the gate.
--
-- The approver was never in question. `ROLE_AND_APPROVAL_MODEL §1` gives the GM "Approves or returns
-- at 4 checkpoints", §2's matrix ticks "Approve management checkpoint 2–4" for the GM column alone,
-- and §5 names checkpoint 3 explicitly. This is not a factory question. What was missing was a place
-- to put the decision.
--
-- THE SEEDED RULE IS NOT TOUCHED. Not disabled, not edited, not given an exception. §B6: "The rule is
-- correct; the recording mechanism was missing."
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- SCOPE — WHAT THIS RECORDS, AND WHAT IT DOES NOT SHOW
--
-- §B6: "This step builds only what RECORDS a decision — the four checkpoints and their outcomes.
-- The nine-section package that a GM reads before deciding is a derived view and has no owning
-- screen yet."
--
-- So `checkpoint_package()` below assembles the sections the system can honestly produce TODAY, and
-- NAMES THE ONES IT CANNOT in `sections_absent`. A snapshot that silently omitted half the package
-- would let a future reader believe the GM saw quality data that did not exist.
--
-- ⚠ SECTION 9 IS ABSENT, AND §5 CALLS IT "the point of the whole document" — the proposed next step,
-- the vessel allocation and fill heights the decision is actually about. It needs A5's occupancy model
-- and the Manager's allocation authority. **A GM can record a verdict today; the package they would
-- read is not yet the package §5 specifies.** Reported in docs/REPORTS/B6.md, not papered over.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ONE DOCUMENTED TENSION, CARRIED NOT RESOLVED
--
-- §1 says the GM "Approves or returns at 4 checkpoints". §2's matrix row reads "Approve management
-- checkpoint 2–4", and checkpoint 1 appears only as a precondition of Admin activation
-- ("Activate batch ✅ *(requires GM checkpoint 1)*"). Whether checkpoint 1 is the GM's own decision or
-- merely a precondition they satisfy elsewhere is not stated the same way twice.
--
-- Nothing here depends on the difference: only checkpoint 3 has a seeded `gate_rule`, so only
-- checkpoint 3 gates anything. The RPC requires the `gm` role for ANY checkpoint, which is compatible
-- with both readings, and the number of checkpoints is NOT baked into a constraint — see §1 below.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The checkpoint.
--
-- `checkpoint_no > 0` and NOT `between 1 and 4`. The model names four, but a CHECK encoding the count
-- would be a hard-coded count in the schema — rule 4 — and the thing that actually binds a checkpoint
-- to a point in the process is a `gate_rule` whose config names it. Adding a fifth checkpoint stays a
-- seed change.
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type checkpoint_state as enum ('open','decided');
exception when duplicate_object then null; end $$;

do $$ begin
  -- The three verdicts §5 puts on the screen: [ APPROVE ] [ APPROVE WITH CONDITIONS ] [ RETURN FOR REVIEW ]
  create type checkpoint_verdict as enum ('approved','approved_with_conditions','returned');
exception when duplicate_object then null; end $$;

create table if not exists public.management_checkpoint (
  id              uuid primary key default gen_random_uuid(),
  master_batch_id uuid not null references public.master_batch(id) on delete cascade,
  checkpoint_no   int  not null check (checkpoint_no > 0),
  state           checkpoint_state not null default 'open',
  opened_at       timestamptz not null default now(),
  unique (master_batch_id, checkpoint_no)
);
alter table public.management_checkpoint enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The decision. APPEND-ONLY, and snapshotted.
--
-- `ROLE_AND_APPROVAL_MODEL §5`: "A package is snapshotted when the decision is made. The GM's approval
-- is bound to exactly what they saw, not to whatever the data later became."
--
-- That is why `package_snapshot` is `not null` and why nothing may update or delete a row here. A
-- decision that could be edited afterwards is not a decision, it is a note.
--
-- More than one decision per checkpoint is legal and expected: a `returned` verdict sends the batch
-- back, and the GM decides again later. The gate reads the LATEST one.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.checkpoint_decision (
  id                       uuid primary key default gen_random_uuid(),
  management_checkpoint_id uuid not null references public.management_checkpoint(id) on delete cascade,
  verdict                  checkpoint_verdict not null,
  -- MANDATORY, per §B6. A verdict with no reason is unreviewable and `§5`'s return path is
  -- meaningless without one.
  reason                   text not null check (length(btrim(reason)) > 0),
  -- What the GM actually saw. See §5.
  package_snapshot         jsonb not null,
  decided_at               timestamptz not null default now(),
  decided_by               uuid not null references public.profiles(id),
  decided_by_role          app_role not null,
  -- ORDER COMES FROM A SEQUENCE, NOT FROM THE CLOCK.
  --
  -- "The latest decision governs" was first written as `order by decided_at desc`, and the B6 proof
  -- caught it immediately: `now()` is frozen for a transaction, so a return and a later approval
  -- recorded in the same transaction share an instant, the ordering picked arbitrarily, and the
  -- approval lost. Two decisions a second apart in production would tie just as well on a coarse
  -- clock. `audit_event` already orders by its `bigserial` for the same reason.
  seq                      bigserial not null unique
);
alter table public.checkpoint_decision enable row level security;

-- For the already-applied case: `create table if not exists` above is a no-op once the table exists.
alter table public.checkpoint_decision
  add column if not exists seq bigserial;

create index if not exists idx_checkpoint_decision_latest
  on public.checkpoint_decision (management_checkpoint_id, seq desc);

create or replace function public.fn_checkpoint_decision_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'checkpoint_decision is append-only: a %ELETE on a recorded management decision is refused. '
    'A decision is bound to what the GM saw (ROLE_AND_APPROVAL_MODEL §5); to change course, record a '
    'new decision.', case when tg_op = 'UPDATE' then 'n UPDATE or a D' else ' D' end
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_checkpoint_decision_immutable on public.checkpoint_decision;
create trigger trg_checkpoint_decision_immutable
  before update or delete on public.checkpoint_decision
  for each row execute function public.fn_checkpoint_decision_is_append_only();

-- The checkpoint's state is DERIVED from its decisions, by trigger, so it cannot drift from them.
-- Same mechanism A4 used for `satisfied_count`: a column a client could set independently is a column
-- that will eventually disagree with the rows it summarises.
create or replace function public.fn_recount_checkpoint_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update management_checkpoint c
     set state = case
           when exists (
             select 1 from checkpoint_decision d
              where d.management_checkpoint_id = c.id
                and d.verdict in ('approved','approved_with_conditions')
                -- The sequence, not the clock. See the column comment.
                and d.seq = (select max(d2.seq) from checkpoint_decision d2
                              where d2.management_checkpoint_id = c.id)
           ) then 'decided'::checkpoint_state
           -- No decision, or the latest one returned it. Either way the checkpoint is open.
           else 'open'::checkpoint_state end
   where c.id = new.management_checkpoint_id;
  return null;
end;
$$;

drop trigger if exists trg_recount_checkpoint_state on public.checkpoint_decision;
create trigger trg_recount_checkpoint_state
  after insert on public.checkpoint_decision
  for each row execute function public.fn_recount_checkpoint_state();

-- Read is open to any authenticated user: a supervisor and an operator are both entitled to see that
-- the batch is waiting on the GM, and who decided what. WRITES GO THROUGH THE RPC ONLY.
do $$
declare t text;
begin
  foreach t in array array['management_checkpoint','checkpoint_decision'] loop
    execute format('drop policy if exists checkpoint_read on public.%I', t);
    execute format(
      'create policy checkpoint_read on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · The package, as far as the system can honestly assemble it.
--
-- Section numbers are §5's. Every section is READ from something that exists; the ones that cannot be
-- read are named in `sections_absent` with the step that would fill them, so the snapshot is explicit
-- about what the GM was not shown.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.checkpoint_package(p_batch uuid, p_checkpoint int)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'checkpoint', p_checkpoint,
    'assembled_at', now(),

    -- 1 · PLAN — what was committed at Day-0.
    'plan', (
      select jsonb_build_object(
        'code', mb.code, 'label', mb.label, 'h0', mb.start_at,
        'supervisor', mb.supervisor_name, 'day0_config', mb.config,
        'material_roles', (
          select coalesce(jsonb_agg(jsonb_build_object('role', r.role, 'material', m.code)
                                    order by r.role), '[]'::jsonb)
            from batch_material_role r join material m on m.id = r.material_id
           where r.master_batch_id = mb.id))
        from master_batch mb where mb.id = p_batch),

    -- 2 · ACTUAL EXECUTION — plan vs actual. B4's attribution, headline and ranked contributors.
    'execution', (
      select jsonb_build_object(
        'variance_minutes', v.variance_minutes,
        'worst_stream', v.worst_stream,
        'all_streams_sum_minutes', v.all_streams_sum_minutes,
        'measured_of', v.measured_count || ' of ' || v.activity_count,
        'contributors', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'rank', c.rank, 'code', c.code, 'scope', c.scope_label,
                   'minutes', c.variance_minutes, 'person', c.person,
                   'machine', c.machine, 'cause', c.cause) order by c.rank), '[]'::jsonb)
            from v_variance_contributor c where c.master_batch_id = p_batch))
        from v_batch_variance v where v.master_batch_id = p_batch),

    -- 4 · EVIDENCE — named requirements, satisfied against required. Never a bare photo count.
    'evidence', (
      select jsonb_build_object(
        'requirements_total', count(*),
        'requirements_satisfied', count(*) filter (where r.satisfied_count >= r.min_count),
        'outstanding', coalesce(jsonb_agg(distinct r.label)
                                filter (where r.gates_submission
                                          and r.satisfied_count < r.min_count), '[]'::jsonb))
        from batch_activity_evidence_req r
        join batch_activity ba on ba.id = r.batch_activity_id
       where ba.master_batch_id = p_batch),

    -- 5 · DEVIATIONS — an accepted deviation stays open on the record (§7).
    'deviations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'kind', d.kind, 'summary', d.summary, 'state', d.state,
               'raised_at', d.raised_at, 'decided_by_role', d.decided_by_role,
               'decision_reason', d.decision_reason,
               'awaiting_verdict', d.awaiting_verdict,
               'stands_on_record', d.stands_on_record) order by d.raised_at), '[]'::jsonb)
        from v_deviation_open d where d.master_batch_id = p_batch),

    -- 8 · CURRENT POSITION — where the batch actually is, by state.
    'position', (
      select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb)
        from (select ba.state::text as state, count(*) as n
                from batch_activity ba where ba.master_batch_id = p_batch
               group by ba.state) s),

    -- What the GM was NOT shown, and why. This is the honest half of the snapshot.
    'sections_absent', jsonb_build_array(
      jsonb_build_object('section', 3, 'name', 'QUALITY',
        'reason', 'the lab subsystem does not exist yet (B5); no versioned result, spec or trend is available'),
      jsonb_build_object('section', 6, 'name', 'CORRECTIVE ACTIONS',
        'reason', 'not assembled into this package'),
      jsonb_build_object('section', 7, 'name', 'RESOURCE USAGE',
        'reason', 'no occupancy or machine-usage record exists yet (A5); machine hours are not derivable'),
      jsonb_build_object('section', 9, 'name', 'PROPOSED NEXT STEP',
        'reason', 'needs A5 occupancy and the Manager''s allocation authority. ROLE_AND_APPROVAL_MODEL '
                  '§5 calls this "the point of the whole document" — it is absent, and the decision is '
                  'being recorded without it'))
  );
$$;

revoke execute on function public.checkpoint_package(uuid, int) from anon;
grant execute on function public.checkpoint_package(uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Recording a decision. The GM, a reason, and a snapshot.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_checkpoint_decision(
  p_batch      uuid,
  p_checkpoint int,
  p_verdict    text,
  p_reason     text
) returns table (
  decision_id  uuid,
  checkpoint   int,
  verdict      text,
  state        text,
  decided_at   timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  b        master_batch;
  cp       management_checkpoint;
  new_id   uuid;
  v_role   app_role;
begin
  v_role := public.current_app_role();

  -- §2's matrix ticks "Approve management checkpoint 2–4" in the GM column and nowhere else. A
  -- supervisor holds release/hold/return on ACTIVITIES (B2); a management checkpoint is not theirs.
  if v_role is distinct from 'gm' then
    raise exception
      'Only the General Manager records a management checkpoint decision — % may not '
      '(ROLE_AND_APPROVAL_MODEL §2).', coalesce(v_role::text, 'an unknown role')
      using errcode = 'insufficient_privilege';
  end if;

  if p_verdict not in ('approved','approved_with_conditions','returned') then
    raise exception 'Verdict must be approved, approved_with_conditions or returned — got %', p_verdict;
  end if;

  -- MANDATORY, and checked here as well as by the column so the message names the reason rather than
  -- the constraint.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception
      'A checkpoint decision needs a reason. §5''s return path is meaningless without one, and an '
      'approval with no stated basis cannot be reviewed.';
  end if;

  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch: %', p_batch; end if;
  if b.status <> 'active' then
    raise exception 'Batch % is % — a checkpoint decision applies to a running batch', b.code, b.status;
  end if;

  -- The checkpoint is opened on first use. Nothing in `docs/` specifies an opener, and inventing a
  -- trigger that decides when a checkpoint becomes due would be inventing process.
  insert into management_checkpoint (master_batch_id, checkpoint_no)
  values (p_batch, p_checkpoint)
  on conflict (master_batch_id, checkpoint_no) do nothing;

  select * into cp from management_checkpoint
   where master_batch_id = p_batch and checkpoint_no = p_checkpoint;

  insert into checkpoint_decision (
    management_checkpoint_id, verdict, reason, package_snapshot, decided_by, decided_by_role)
  values (
    cp.id, p_verdict::checkpoint_verdict, btrim(p_reason),
    -- Snapshotted HERE, at the moment of the decision, from the server's own read. Not passed in by
    -- the client: a snapshot the caller supplies is a snapshot the caller can shade.
    public.checkpoint_package(p_batch, p_checkpoint),
    auth.uid(), v_role)
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           after_state, reason)
  values (auth.uid(), v_role, 'checkpoint_' || p_verdict, 'checkpoint_decision', new_id::text,
          jsonb_build_object('batch', b.code, 'checkpoint', p_checkpoint, 'verdict', p_verdict),
          btrim(p_reason));

  -- Whatever the gates now say becomes available. An approval does not open anything by itself; it
  -- satisfies one predicate, and `advance_batch` re-reads all of them.
  perform public.advance_batch(p_batch);

  return query
    select new_id, p_checkpoint, p_verdict,
           (select c.state::text from management_checkpoint c where c.id = cp.id),
           (select d.decided_at from checkpoint_decision d where d.id = new_id);
end;
$$;

revoke execute on function public.record_checkpoint_decision(uuid, int, text, text) from anon;
grant execute on function public.record_checkpoint_decision(uuid, int, text, text) to authenticated;

-- What a screen reads: the latest decision per checkpoint, with the batch it belongs to.
create or replace view public.v_checkpoint_status as
select
  c.id                      as checkpoint_id,
  c.master_batch_id,
  mb.code                   as batch_code,
  c.checkpoint_no,
  c.state,
  c.opened_at,
  d.id                      as latest_decision_id,
  d.verdict                 as latest_verdict,
  d.reason                  as latest_reason,
  d.decided_at              as latest_decided_at,
  p.display_name            as decided_by_name,
  d.decided_by_role,
  (select count(*)::int from checkpoint_decision d2
    where d2.management_checkpoint_id = c.id) as decision_count
from public.management_checkpoint c
join public.master_batch mb on mb.id = c.master_batch_id
left join lateral (
  select * from public.checkpoint_decision d0
   where d0.management_checkpoint_id = c.id
   -- The sequence, not the clock. Two decisions in one transaction share an instant.
   order by d0.seq desc limit 1
) d on true
left join public.profiles p on p.id = d.decided_by;

grant select on public.v_checkpoint_status to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · `evaluate_gates`' GM_APPROVAL branch now reads the decision.
--
-- REPRODUCED FROM 0012 WITH ONE BRANCH CHANGED. Everything else is byte-identical, deliberately: this
-- migration is about the approval predicate and nothing else, and a silent edit elsewhere in a
-- 200-line function is how an engine acquires behaviour nobody chose.
--
-- The branch reads the checkpoint number out of the rule's own config — `s04` seeds
-- `'{"checkpoint":3}'` — so which checkpoint gates which activity stays data, not code.
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
  v_cp      int;
begin
  if p_phase not in ('entry','exit') then
    raise exception 'phase must be entry or exit, got %', p_phase;
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

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

    if not g.is_enabled then
      v_verdict := 'skipped';

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
          v_sub_ok := null;
        end if;

        if g.kind = 'BOTH' then
          if v_sub_ok is false then v_ok := false; end if;
        elsif v_sub_ok is true then
          v_any_ok := true;
        end if;
      end loop;

      if g.kind = 'EITHER_OR' then v_ok := v_any_ok; end if;

    elsif g.kind = 'DAY0_DURATION' then
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
      select count(*)::int, string_agg(r.label, ', ' order by r.ordering)
        into v_out_n, v_out_lbl
      from batch_activity_evidence_req r
      where r.batch_activity_id = ba.id
        and r.gates_submission and r.satisfied_count < r.min_count;
      v_ok := coalesce(v_out_n, 0) = 0;
      v_vars := v_vars || jsonb_build_object(
        'outstanding_count', coalesce(v_out_n, 0)::text, 'outstanding_labels', v_out_lbl);

    elsif g.kind = 'FIELD_IN_RANGE' then
      select * into v_fld from batch_activity_value
       where batch_activity_id = ba.id and field_key = g.config->>'field_key';

      if not found or v_fld.actual_value is null
         or v_fld.actual_value !~ '^-?[0-9]+(\.[0-9]+)?$' then
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
      select m.code into v_machine from machine m where m.id = ba.assigned_machine_id;
      v_vars := v_vars || jsonb_build_object('machine_code', v_machine);

      if v_stints_exist then
        execute 'select not exists (select 1 from public.machine_usage mu'
                || ' where mu.batch_activity_id = $1 and mu.ended_at is null)'
          into v_ok using ba.id;
      else
        v_ok := true;
      end if;

    elsif g.kind = 'GM_APPROVAL' then
      -- ── B6 · CHANGED FROM 0012's `v_ok := false`. ─────────────────────────
      -- The checkpoint number is the RULE's, not this function's: `s04` seeds `'{"checkpoint":3}'`
      -- on TN-LOAD, so which checkpoint gates which activity stays data.
      --
      -- `returned` does NOT open the gate. Only an approval does, and `approved_with_conditions` is
      -- an approval — §5 puts it beside APPROVE on the screen, and the conditions live in the
      -- mandatory reason, which the snapshot preserves.
      --
      -- The LATEST decision governs. A batch approved, returned, then approved again is at its third
      -- decision, and the first two stay on the record.
      v_cp := nullif(g.config->>'checkpoint','')::int;

      if v_cp is null then
        -- An approval rule that does not say WHICH checkpoint cannot be evaluated, and guessing at
        -- one would be inventing the process's own structure.
        v_verdict := 'unevaluable';
        v_vars := v_vars || jsonb_build_object('checkpoint', 'not stated on the rule');
      else
        v_ok := exists (
          select 1 from public.v_checkpoint_status s
           where s.master_batch_id = ba.master_batch_id
             and s.checkpoint_no = v_cp
             and s.latest_verdict in ('approved','approved_with_conditions'));
        v_vars := v_vars || jsonb_build_object('checkpoint', v_cp::text);
      end if;

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
