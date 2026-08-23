-- s11 · A3 — three staggered master batches. docs/BUILD_SEQUENCE_KIRO.md §A3.
--
-- IDEMPOTENT. Creates the three batches only if they are absent, so `npm run db:seed` twice is a
-- no-op rather than a duplication. Every other statement is an update or an on-conflict.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE STAGGER, AND WHY THE THREE POSITIONS ARE 8 DAYS APART
--
-- §A3 asks for a 48-hour stagger per Book1 AND for three positions — one early, one mid-yard, one
-- in tunnel hold. Those cannot both mean "three consecutive batches": consecutive batches at a
-- 48-hour stagger sit at Day n, n+2 and n+4, which is entirely inside Stage 0.
--
-- The 48 hours is the CADENCE. `TIME_MODEL_CONFIRMED §2.4` describes ~12 batches alive at once, a
-- new one every 48 hours. These three are three of those twelve, not the first three: their H0s are
-- 0, 8 and 16 days back, which are 0, 4 and 8 multiples of the 48-hour cadence. So the cadence is
-- honoured exactly and the positions land where §A3 asks:
--
--     EARLY  H0 = today            → Day 0   · weighment
--     MID    H0 = today − 8 days   → Day 8   · turner passes, the yard
--     LATE   H0 = today − 16 days  → Day 16  · tunnel process
--
-- H0 is `factory_h0_instant(date)`, so every one lands on the factory's own start hour rather than
-- on a midnight. No time literal appears in this file.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · TBD-50 is closed. The factory answered: Asia/Kolkata, and it observes no DST.
--
-- Recorded, not chosen. `factory_clock.timezone` already carries the value; this closes the
-- register entry so the two cannot disagree about whether the question is still open.
--
-- Asia/Kolkata has no DST transitions in the IANA database, which is what makes Book1's assumption
-- safe: H0 + 552 h and "23 days later at the same wall clock" ARE the same instant, all year.
-- ─────────────────────────────────────────────────────────────────────────────
update public.conflict_register set
  status = 'resolved',
  ship_with_default =
    'CLOSED 22 Aug 2026. The factory clock is Asia/Kolkata and observes no daylight saving. '
    || 'Stored in factory_clock.timezone, validated against pg_timezone_names. Because the zone has '
    || 'no DST transitions, H0 + the baseline and "the same wall clock N days later" are the same '
    || 'instant all year, which is what Book1.xlsx assumes.'
where conflict_id = 'TBD-50';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · C-37 · NEW. The tunnel hold has two durations, and they differ by six hours.
--
-- Found while supplying Day-0 durations for A3. Not resolved here — carried, marked, and the
-- Day-0 value on every batch says which reading it followed.
--
--   144 h · PROCESS-2026B's own day map. TN-HOLD starts at H384 (Day 16) and TN-UNLOAD at H528
--           (Day 22). This is the reading the hour axis and Book1's 552-hour grid are built on.
--   150 h · phase2_control_band, which tiles 0→150 contiguously across seven thermal stages
--           (0–14, 15–28, 29–40, 41–54, 55–102, 103–142, 143–150), all sourced to S1c. A
--           contiguous tile is a duration claim, not a set of windows.
--
-- Related but distinct from C-05, which is about Conditioning-2 overrunning its own spec, and from
-- C-27, which is about Days 16–21 carrying no walkthrough content.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.conflict_register
  (conflict_id, kind, severity, question, sources, ship_with_default, status, blocks_phase)
values
('C-37','conflict','blocks_behaviour','Tunnel hold duration: 144 hours or 150 hours?',
 'PROCESS-2026B day map puts TN-HOLD at Day 16 and TN-UNLOAD at Day 22, which is 144 h. '
 'phase2_control_band tiles 0-150 h contiguously across seven S1c thermal stages, which is 150 h.',
 'The Day-0 duration follows the day map (144 h), because the hour axis and Book1''s 552-hour grid '
 'are derived from it and 150 h would put tunnel unloading past H552. The 150 h reading is retained '
 'in phase2_control_band unchanged and this row is marked on every affected batch. THE FACTORY HAS '
 'NOT CHOSEN.',
 'open','A3')
on conflict (conflict_id) do update set
  kind = excluded.kind, severity = excluded.severity, question = excluded.question,
  sources = excluded.sources, ship_with_default = excluded.ship_with_default,
  status = excluded.status, blocks_phase = excluded.blocks_phase;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Dispose of the three pre-A2 batches. REPLACED, not completed.
--
-- Why replaced: `batch` is a test artefact whose code is the word "batch"; all three were generated
-- before `start_at` existed, so none has an H0 and the active one cannot be given one
-- (set_batch_start_at is draft-only, because activation freezes the baseline); and their Day-0
-- answers were whatever a test script happened to pass, which is not a demo anybody designed.
--
-- Cancelled rather than deleted. The rows, the audit trail and the one genuinely completed activity
-- on MB-2026-09-20 all survive; `cancel_batch` leaves COMPLETED and SKIPPED rows untouched.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select id, code from public.master_batch
     where code in ('batch','MB-2026-08-20','MB-2026-09-20')
       and status in ('draft','active')
  loop
    perform public.cancel_batch(
      r.id,
      'Superseded by A3''s staged demo batches. Generated before master_batch.start_at existed, so '
      || 'it has no H0 and cannot be given one after activation. Record retained; nothing deleted.');
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · The Day-0 answers.
--
-- ⚠ THE REST DURATIONS ARE THE ONE PLACE THIS FILE SUPPLIES A NUMBER, AND EVERY ONE IS SOURCED.
--
-- Frozen decision 2 is that a rest duration is Day-0 configurable, MANDATORY, and has NO DEFAULT.
-- That is about the SYSTEM: `validate_batch` still refuses to activate while any is null, and the
-- TBD marker still renders at the point of use. What the decision requires is that a human answers
-- per batch. Staging a demo means standing in for that human, so these values live in
-- `master_batch.config` — per batch, visible, and beside a `_source` key that says where each came
-- from. No default enters the process definition or the code.
--
--   band     the process definition states a range; the Day-0 value pins the top of it, matching
--            what generate_activity_plan has always used for a planned end
--   gate     no range is stated anywhere; the value is the gap on the hour axis to the activity
--            whose OWN ENTRY GATE names this rest as its predecessor — the process's own statement
--            of what the rest is holding up, read from gate_rule. It is the only reading consistent
--            with Book1's 552-hour grid, because a shorter rest leaves the successor's start
--            unexplained and a longer one pushes it past its stated day.
--
-- A stream-relative gap was tried first and was WRONG: P1-REST-2 is the last activity in the BUNKER
-- stream, so it had no successor in its own stream and the derivation correctly refused rather than
-- inventing one. What actually waits on it is TN-LOAD, in the TUNNEL stream, and gate_rule says so.
--
-- FOUR OF THESE STILL NEED THE FACTORY, and the report says so:
--   FIB1-REST-1, P1-REST-1, P1-REST-2   TBD-21 — "never stated". Axis gap used.
--   STRAW-REST-1                        TBD-24 — the register offers 2 h OR 12 h; the axis says 24 h.
--   TN-HOLD                             C-37   — 144 h or 150 h.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.demo_day0_config()
returns jsonb language plpgsql stable set search_path = public as $$
declare
  cfg jsonb;
  g   record;
  hrs numeric;
  src text;
begin
  -- The structural answers. Every one is a count the admin chooses; none is a process fact.
  -- The load count is NOT here: it is derived from quantity / capacity by evaluate_cardinality.
  cfg := jsonb_build_object(
    'primary_fibre_required_mt',  21,
    'expected_load_capacity_mt',  2,
    'bunker_line_count',          3,
    'yard_pile_count',            2,
    'mixed_pile_count',           1,
    'straw_pile_count',           2,
    'straw_bunker_count',         1,
    'turner_pile_count',          3,
    'tunnel_count',               3
  );

  for g in
    select pa.code, pa.seq, pa.standard_start_hour,
           pa.duration_target_min_hr dmin, pa.duration_target_max_hr dmax, pa.tbd_marker,
           -- The earliest activity whose entry gate names this rest as a predecessor, and the code
           -- of that activity, so the provenance can be read back.
           (select min(succ.standard_start_hour)
              from gate_rule gr
              join process_activity succ on succ.id = gr.process_activity_id
             where gr.phase = 'entry' and gr.kind = 'PREDECESSOR'
               and gr.config->'activity_codes' ? pa.code
               and succ.process_definition_id = pa.process_definition_id
               and succ.standard_start_hour > pa.standard_start_hour) as successor_hour,
           (select string_agg(distinct succ.code, ', ')
              from gate_rule gr
              join process_activity succ on succ.id = gr.process_activity_id
             where gr.phase = 'entry' and gr.kind = 'PREDECESSOR'
               and gr.config->'activity_codes' ? pa.code
               and succ.process_definition_id = pa.process_definition_id
               and succ.standard_start_hour > pa.standard_start_hour) as successor_codes
      from process_activity pa
      join process_definition pd on pd.id = pa.process_definition_id
     where pd.code = 'PROCESS-2026B' and pa.is_time_gate
     order by pa.seq
  loop
    if g.dmax is not null then
      -- A stated band. Pin the top of it.
      hrs := g.dmax;
      src := format('band %s-%s h stated in the process definition', g.dmin, g.dmax);

    elsif g.successor_hour is not null then
      -- No band anywhere. The gap to what gate_rule says is waiting on this rest.
      hrs := g.successor_hour - g.standard_start_hour;
      src := format('hour-axis gap H%s to H%s, where %s waits on this rest per gate_rule — '
                    || 'no duration is stated%s',
                    g.standard_start_hour, g.successor_hour, g.successor_codes,
                    coalesce('; ' || g.tbd_marker || ' is unresolved', ''));

    else
      -- Neither a band nor a successor. Refuse rather than invent: activation will then block on
      -- REST_NO_DURATION and name the activity, which is the correct outcome.
      continue;
    end if;

    cfg := cfg
      || jsonb_build_object('rest_hr_' || g.code, hrs)
      || jsonb_build_object('rest_src_' || g.code, src);
  end loop;

  return cfg;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Create the three batches, if they are not already there.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  slot   record;
  new_id uuid;
  roles  jsonb;
begin
  -- The role bindings are READ from material_role_eligibility.is_default_lead, not written here.
  --
  -- Hard-coded codes were tried first and were wrong: the code `PADDY_STRAW` does not exist — the
  -- materials are PADDY_PUNJAB and PADDY_LOCAL — so STRUCTURAL_STRAW went unbound and
  -- generate_activity_plan correctly skipped the entire straw stream, ten activities, silently and
  -- by design. Reading the defaults makes that class of mistake impossible, and it keeps rule 3:
  -- changing which material leads a role is a change to the eligibility seed, not to this file.
  --
  -- Roles with no default lead are deliberately left unbound. SECONDARY_FIBRE is one — TBD-39 ships
  -- it disabled with no activities seeded — and an unbound role means its stream does not run.
  select jsonb_agg(jsonb_build_object('role', mre.role, 'material_code', m.code, 'lead', true))
    into roles
    from material_role_eligibility mre
    join material m on m.id = mre.material_id
   where mre.is_default_lead;

  if roles is null then
    raise exception 'No default role leads in material_role_eligibility — s02 has not run';
  end if;

  for slot in
    select * from (values
      -- days_back is a multiple of the 48-hour cadence in every row. See the header.
      ('MB-DEMO-EARLY', 'Demo · Day 0 · weighment',            0,  'Ramarao', 'Clear, humid'),
      ('MB-DEMO-MID',   'Demo · Day 8 · yard and turner',      8,  'Ramarao', 'Clear'),
      ('MB-DEMO-LATE',  'Demo · Day 16 · tunnel process',      16, 'Ramarao', 'Overcast')
    ) as s(code, label, days_back, supervisor, weather)
  loop
    if exists (select 1 from master_batch where code = slot.code) then
      continue;
    end if;

    new_id := public.create_master_batch(
      slot.code,
      slot.label,
      (current_date - slot.days_back),
      public.demo_day0_config(),
      roles,
      slot.supervisor,
      slot.weather,
      public.factory_h0_instant(current_date - slot.days_back)
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · Who is responsible for each row.
--
-- By `responsible_role`, which 0007 already carries onto every instance from the template. A time
-- gate gets nobody, deliberately: a rest is not somebody's task, and `validate_batch` excludes them
-- from NO_ASSIGNEE for that reason.
-- ─────────────────────────────────────────────────────────────────────────────
update public.batch_activity ba
   set assigned_person_id = p.id
  from public.master_batch mb, public.profiles p
 where mb.id = ba.master_batch_id
   and mb.code like 'MB-DEMO-%'
   and p.role = ba.responsible_role
   and p.is_active
   and not ba.is_time_gate
   and ba.assigned_person_id is null;

-- The two turner passes must be different machines — one turner cannot do T1 and T2 on the same
-- pile, and validate_batch blocks on it. The seed leaves them blank because choosing them is the
-- admin's decision; staging a demo makes it, from the recorded fleet, in code order.
update public.batch_activity ba
   set assigned_machine_id = m.id
  from public.master_batch mb, public.machine m
 where mb.id = ba.master_batch_id
   and mb.code like 'MB-DEMO-%'
   and ba.code = 'TR-T1'
   and m.code = (select min(code) from public.machine where kind = 'TURNER');

update public.batch_activity ba
   set assigned_machine_id = m.id
  from public.master_batch mb, public.machine m
 where mb.id = ba.master_batch_id
   and mb.code like 'MB-DEMO-%'
   and ba.code = 'TR-T2'
   and m.code = (select max(code) from public.machine where kind = 'TURNER');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · Vessels.
--
-- Assigned by a greedy pass in planned-instant order across all three batches, taking the
-- lowest-coded vessel that is free. "Free" is stricter here than `validate_batch`'s check: this one
-- ignores batch status, so the allocation still holds once all three are active, where the
-- heuristic only compares against batches that are already running.
--
-- IT RAISES RATHER THAN OVERBOOKING. If the recorded fleet cannot host the stagger, that is a
-- finding about the factory's capacity and it must stop the seed, not be papered over. As seeded it
-- does not: peak cross-batch demand in any 48-hour window is 7 bunkers against 11 recorded, and the
-- three tunnel loads are 192 hours apart so they never contend.
--
-- Only BUNKER and TUNNEL are assigned. `validate_batch` requires a destination for exactly those,
-- and it is right to: there is one YARD location for the whole factory, so a yard destination would
-- make every pair of concurrent batches collide on it. Yard piles are `scope_label` plus the
-- movement rule's `creates_locations`, and modelling them as occupancy is A5.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  r        record;
  chosen   uuid;
  src      uuid;
  recorded int;
begin
  -- FULL RECOMPUTE, not a top-up. The allocation is deterministic — a fixed iteration order and
  -- always the lowest free code — so clearing first makes re-running the seed produce exactly the
  -- same result, which a partial pass does not.
  --
  -- The first version only ever ASSIGNED, and re-running the seed broke every batch: a destination was
  -- reassigned while `coalesce(source_location_id, src)` kept the stale source, so three reloads ended
  -- up pointing at the bunker they came from and `validate_batch` reported SAME_VESSEL on all three
  -- batches. The A3 gate test caught it on the second seed run.
  select count(*) into recorded
  from batch_activity ba join master_batch mb on mb.id = ba.master_batch_id
   where mb.code like 'MB-DEMO-%' and ba.state in ('COMPLETED','SKIPPED','IN_PROGRESS','SUBMITTED');

  if recorded > 0 then
    -- Somebody has worked against these assignments. Reallocating would rewrite where recorded work
    -- happened, so stop instead.
    raise notice 'Vessel allocation skipped: % activities carry recorded work on the demo batches', recorded;
    return;
  end if;

  update batch_activity ba
     set destination_location_id = null, source_location_id = null
    from master_batch mb
   where mb.id = ba.master_batch_id and mb.code like 'MB-DEMO-%';

  for r in
    select ba.id, ba.master_batch_id, ba.code, ba.title, ba.scope_label, ba.instance_no, ba.seq,
           ba.planned_start_at, mr.destination_kind, mr.requires_distinct_vessel
      from batch_activity ba
      join master_batch mb on mb.id = ba.master_batch_id
      join movement_rule mr on mr.process_activity_id = ba.process_activity_id
     where mb.code like 'MB-DEMO-%'
       and mr.destination_kind in ('BUNKER','TUNNEL')
     order by ba.planned_start_at, ba.master_batch_id, ba.seq, ba.instance_no
  loop
    -- A reload inherits its source from whatever this same line used last, and must move elsewhere.
    select prev.destination_location_id into src
      from batch_activity prev
     where prev.master_batch_id = r.master_batch_id
       and prev.instance_no = r.instance_no
       and prev.seq < r.seq
       and prev.destination_location_id is not null
     order by prev.seq desc
     limit 1;

    select l.id into chosen
      from location l
     where l.kind = r.destination_kind
       -- not held by another batch inside the window the double-booking check uses
       and not exists (
         select 1 from batch_activity o
          where o.destination_location_id = l.id
            and o.master_batch_id <> r.master_batch_id
            and o.planned_start_at between r.planned_start_at - interval '2 days'
                                       and r.planned_start_at + interval '2 days')
       -- and not already taken by another instance of this same step in this same batch
       and not exists (
         select 1 from batch_activity o
          where o.destination_location_id = l.id
            and o.master_batch_id = r.master_batch_id
            and o.code = r.code)
       -- a reload must move the material somewhere else
       and (not r.requires_distinct_vessel or src is null or l.id <> src)
     order by l.code
     limit 1;

    if chosen is null then
      raise exception
        'No free % for % (%) at %. The recorded fleet cannot host this stagger — that is a capacity '
        'finding, not something to overbook.',
        r.destination_kind, r.code, r.scope_label, r.planned_start_at;
    end if;

    -- Both written together, from the same pass. `src` is whatever this line's previous stint chose
    -- earlier in this very loop, so the pair can never drift the way it did before.
    update batch_activity
       set destination_location_id = chosen,
           source_location_id = src
     where id = r.id;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · Activate. `activate_batch` refuses while any blocking finding stands, so this line IS the
--     exit proof: if a destination, an assignee, an H0 or a rest duration were missing, it raises.
--
-- NO WORK HISTORY IS STAGED. Nothing here completes an activity, satisfies an evidence requirement,
-- or records a lab result. Every batch's state is whatever `advance_batch` derives from its own
-- gates — see docs/REPORTS/A3.md for what that means for the board, and for the one question it
-- raises.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select id, code from public.master_batch where code like 'MB-DEMO-%' and status = 'draft'
  loop
    perform public.activate_batch(r.id);
  end loop;
end $$;
