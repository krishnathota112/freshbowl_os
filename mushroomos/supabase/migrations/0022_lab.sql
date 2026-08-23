-- 0022 · Lab logic.  (B5 · K7)
-- docs/BUILD_SEQUENCE_KIRO.md §B5, docs/LAB_MODEL.md §2 · §5 · §9,
-- lab_technician_batch_process.md §14 · §15, docs/UI_DATA_CONTRACTS.md §12 · §13.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS STEP IS FOR
--
-- `lab_spec` (38 acceptance ranges) and `lab_method` (9 SOPs) have existed since `0003` and are
-- well seeded. What has never existed is the EXECUTION side: a sample, a requested test, a result,
-- a retest that supersedes without erasing. `CONTRACT_AUDIT §3.4` — "no versioning, no supersede,
-- no retest, no instrument/calibration binding, no decision on a result".
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE THREE REFUSALS THIS FILE IMPLEMENTS — `LAB_MODEL §9`
--
--   1  NO RESULT WITHOUT A SAMPLE. "A number with no `lab_sample` is not traceable and is
--      rejected at the database level." Enforced by NOT NULL down the chain
--      `lab_result → lab_test → lab_sample`. There is no path to a floating number.
--   2  NO INVENTED THRESHOLD. A result whose frozen band is null-null is `no_spec`. It is
--      recorded, trended and shown, and it NEVER auto-fails. TBD-13.
--   3  NO SILENT RE-JUDGEMENT. `target_min/max` are frozen onto the TEST at request time and
--      copied onto every result version. Editing `lab_spec` later cannot change a historical
--      verdict.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT DECIDE
--
-- C-32 · WHO APPROVES A LAB SUBMISSION. The lab dictation §15 says the GM approves or rejects
--        every one. `ROLE_AND_APPROVAL_MODEL` says the GM never approves per-activity work — at
--        ~10 concurrent batches that is ~400 open approvals — and the Supervisor holds
--        release/hold/return. §B5: "leave the approver configurable; report the block."
--
--        BOTH READINGS ARE CARRIED as `lab_approval_reading` rows, neither enabled. While neither
--        is enabled, a decision from EITHER named role is accepted and the row RECORDS WHICH
--        READING AUTHORISED IT. A role named by neither reading is refused. So the state is
--        reachable under both readings, nothing is chosen, and answering C-32 later turns the
--        other reading's decisions into history rather than invalidating them.
--
--        Refusing every decision until C-32 is answered was the alternative, and it would have
--        recreated exactly the defect B1 found in `GM_APPROVAL`: a state nothing can reach.
--
-- C-33 · WHICH CHECKPOINT MAP IS AUTHORITATIVE. `lab_checkpoint` carries BOTH maps, distinguished
--        by `checkpoint_map`, every row on the disputed points marked C-33. §B5: "Do not merge,
--        do not pick." A sample is filed under a checkpoint FROM A NAMED MAP, so which map a
--        number was filed under is always visible.
--
--        CONSEQUENCE, reported rather than worked around: `LAB_MODEL §6`'s automatic task
--        generation cannot be built. "0A submitted → generate BAGASSE_BL" requires knowing which
--        map is authoritative. So tests are requested explicitly and auto-generation waits on C-33.
--
-- TBD-36 · WHICH CHECKPOINT ATTACHES TO WHICH SPEC. The register already states the interim
--        behaviour — "Map the unambiguous ones; leave the rest unmapped and visible" — so
--        `lab_checkpoint.spec_checkpoint_code` is set only where the code is identical in both
--        vocabularies, and is NULL + marked everywhere else. `lab_spec` uses a THIRD vocabulary
--        (S4a phase names: FIBRE_WETTING, TURNING_0_1 …) which overlaps the S4b map on three
--        codes only. Nothing here reconciles them.
--
-- TBD-13 · COMPOST EC HAS NO BAND. Already seeded as two null-null `lab_spec` rows. This file
--        makes them produce `no_spec` rather than a verdict.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Enums. Every member comes from a source; none is invented here.
-- ─────────────────────────────────────────────────────────────────────────────

-- LAB_MODEL §2 · lab_instrument.kind
do $$ begin
  create type lab_instrument_kind as enum
    ('ph_meter','ec_meter','balance','muffle_furnace','micro_oven',
     'kjeldahl_digestion','kjeldahl_distillation','hardness_kit','tds');
exception when duplicate_object then null; end $$;

-- LAB_MODEL §2 · lab_test.state
do $$ begin
  create type lab_test_state as enum
    ('requested','in_progress','reported','superseded','cancelled');
exception when duplicate_object then null; end $$;

-- LAB_MODEL §2 · lab_result.verdict is a CHECKED TEXT column, not an enum, and deliberately.
-- The verdict is a GENERATED column, and a generation expression must be IMMUTABLE. Casting text
-- to an enum goes through `enum_in`, which Postgres marks STABLE, so `case ... end::lab_verdict`
-- is rejected outright with "generation expression is not immutable". A text column with a CHECK
-- gives the identical closed domain — and the rest of the schema already prefers that shape
-- (`conflict_register.kind`, `lab_decision.verdict`, `machine.status`).

-- LAB_MODEL §2 · lab_result.calibration_status
do $$ begin
  create type lab_calibration_status as enum ('valid','due','expired','unknown');
exception when duplicate_object then null; end $$;

-- LAB_MODEL §5 · the five retest reason codes, verbatim. A retest with no reason is unwritable.
do $$ begin
  create type lab_retest_reason as enum
    ('sampling_error','instrument_out_of_calibration','post_corrective_action',
     'supervisor_request','result_implausible');
exception when duplicate_object then null; end $$;

-- Which of the two carried maps a checkpoint belongs to. NOT a preference order — C-33.
do $$ begin
  create type lab_checkpoint_map as enum ('LAB_DICTATION','S4B_COLUMNS');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · `lab_setting` — the numbers that are stated but must not be code literals.
--
-- Non-negotiable rule 4: no hard-coded counts. `LAB_MODEL §5` states "more than 2 retests on the
-- same test escalates automatically to the GM" as a [DECISION], so the 2 is SOURCED — but a
-- sourced number still belongs in data, not in a function body. One row, with its source ref.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_setting (
  key        text primary key,
  int_value  int,
  text_value text,
  source_ref text not null,
  conflict_id text references public.conflict_register(conflict_id)
);
alter table public.lab_setting enable row level security;
drop policy if exists lab_setting_read on public.lab_setting;
create policy lab_setting_read on public.lab_setting for select to authenticated using (true);
revoke insert, update, delete on public.lab_setting from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · `lab_approval_reading` — C-32, both readings, neither chosen.
--
-- Same shape A5 used for TBD-28/29, for the same reason: a partial unique index makes the
-- ambiguous state — two enabled readings of one question — UNWRITABLE.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_approval_reading (
  reading_code text primary key,
  approver_role app_role not null,
  statement    text not null,
  source_ref   text not null,
  consequence  text not null,
  is_enabled   boolean not null default false
);
alter table public.lab_approval_reading enable row level security;
drop policy if exists lab_approval_reading_read on public.lab_approval_reading;
create policy lab_approval_reading_read on public.lab_approval_reading
  for select to authenticated using (true);
revoke insert, update, delete on public.lab_approval_reading from authenticated, anon;

-- AT MOST ONE reading may be enabled. `(true)` because there is exactly one question here.
create unique index if not exists uq_lab_approval_one_enabled
  on public.lab_approval_reading ((true)) where is_enabled;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · `lab_instrument`.
--
-- CREATED EMPTY, AND THAT IS THE HONEST STATE. No source anywhere gives an instrument list, a
-- serial, or a calibration interval in days. `lab_method.calibration_note` already carries the
-- only two cadences any source states — pH daily, EC weekly — as prose, because "daily" is not a
-- number of days until somebody says so.
--
-- So `calibration_interval_days` is nullable and unpopulated, and a result bound to an instrument
-- with no interval reports `calibration_status = 'unknown'` rather than 'valid'. Rule 2.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_instrument (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique,
  name                      text not null,
  kind                      lab_instrument_kind not null,
  serial                    text,
  last_calibrated_on        date,
  -- NULL because no source states one. Never defaulted.
  calibration_interval_days int,
  status                    text not null default 'available',
  source_ref                text,
  tbd_marker                text references public.conflict_register(conflict_id)
);
alter table public.lab_instrument enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · `lab_checkpoint` — WHERE a sample is taken. BOTH MAPS, side by side.
--
-- `unique (checkpoint_map, code)` and not `unique (code)`: the two maps deliberately contain
-- codes for the same physical moment, and collapsing them to one row is the merge §B5 forbids.
--
-- `scope` is TEXT, not `activity_scope`. `LAB_MODEL §3` uses `material_lot`, `water_source`,
-- `growing_room_load` and `standing`, none of which are in the repo's `activity_scope` enum — and
-- §2 of the same document gives a different list again. Widening a process enum to accommodate a
-- lab vocabulary that disagrees with itself would bake the disagreement into the schema.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_checkpoint (
  id             uuid primary key default gen_random_uuid(),
  checkpoint_map lab_checkpoint_map not null,
  code           text not null,
  name           text not null,
  -- The day the map places it on, where the map states one. The S4b map is column-derived and
  -- states no day, so this is null for every S4B_COLUMNS row — an absence, not a zero.
  rel_day        int,
  scope          text not null,
  parameters     text[] not null,
  -- The `lab_spec` checkpoint this maps to, WHERE THE CODE IS IDENTICAL. Null elsewhere, with
  -- TBD-36 as the marker. The register's own ship_with_default: "Map the unambiguous ones; leave
  -- the rest unmapped and visible."
  spec_checkpoint_code text,
  source_ref     text not null,
  unique (checkpoint_map, code)
);
alter table public.lab_checkpoint enable row level security;

-- MARKERS AS A JUNCTION, NOT A COLUMN.
--
-- One checkpoint routinely touches TWO open questions at once: every row in both maps sits on one
-- of C-33's nine disputed points, AND the Day-8 turning rows are also TBD-42, AND the height rows
-- are also TBD-46. A single `conflict_id` column can hold one of those, which would mean silently
-- dropping the other — and rule 1 says carry BOTH and mark BOTH.
create table if not exists public.lab_checkpoint_conflict (
  checkpoint_id uuid not null references public.lab_checkpoint(id) on delete cascade,
  conflict_id   text not null references public.conflict_register(conflict_id),
  note          text,
  primary key (checkpoint_id, conflict_id)
);
alter table public.lab_checkpoint_conflict enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · `lab_sample` — the physical, traceable object.
--
-- `LAB_MODEL §2 [DECISION]`: "the sample, not the reading, is the traceable object. S4a's methods
-- all begin 'Take X g of sample' — the sample is physical."
--
-- `batch_activity_id` is nullable because two of the dictation's measurement points have no
-- activity at all — the chicken-manure stream runs "in parallel with the paddy-soaking activities"
-- with no day, and the storage/handling observations float across every bunker and tunnel.
-- Requiring an activity would make those unrecordable.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_sample (
  id                uuid primary key default gen_random_uuid(),
  checkpoint_id     uuid not null references public.lab_checkpoint(id),
  master_batch_id   uuid not null references public.master_batch(id) on delete cascade,
  batch_activity_id uuid references public.batch_activity(id) on delete set null,
  scope_ref         text,
  vessel_id         uuid references public.location(id),
  sample_ref_label  text,
  condition_note    text,
  collected_at      timestamptz not null default now(),
  collected_by      uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
alter table public.lab_sample enable row level security;
create index if not exists idx_lab_sample_batch on public.lab_sample (master_batch_id);
create index if not exists idx_lab_sample_activity on public.lab_sample (batch_activity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · `lab_test` — one requested parameter on one sample, WITH ITS BAND FROZEN.
--
-- ⚠ THE FREEZE LIVES HERE. `LAB_MODEL §2 [DECISION]`: "`lab_result.target_min/max` are copied and
-- frozen at REQUEST TIME, like the six-column SOP values. Changing a spec must never silently
-- re-judge a historical result."
--
-- Request time is when the TEST is requested, so the band is captured onto the test and every
-- result version copies it from there. That is what makes a retest comparable to the original: v1
-- and v2 are judged against the same band even if `lab_spec` changed in between.
--
-- `spec_found` records whether a spec row was located at all. Without it, "no band" and "no spec
-- row" are indistinguishable, and they are different facts: TBD-13 is a spec row that states no
-- band, while an unmapped checkpoint has no row at all. Both give `no_spec`; only one is a
-- factory question.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_test (
  id             uuid primary key default gen_random_uuid(),
  sample_id      uuid not null references public.lab_sample(id) on delete cascade,
  parameter_code text not null,
  method_code    text references public.lab_method(code),
  state          lab_test_state not null default 'requested',
  requested_at   timestamptz not null default now(),
  requested_by   uuid references public.profiles(id),
  -- 'system' when a workflow event generated it, 'user' for an ad-hoc request. LAB_MODEL §6:
  -- an ad-hoc sample "is never allowed to satisfy a gate that an auto-generated sample was
  -- created for".
  requested_via  text not null default 'user' check (requested_via in ('system','user')),
  -- FROZEN AT REQUEST TIME.
  target_min     numeric,
  target_max     numeric,
  target_unit    text,
  spec_source_ref text,
  spec_conflict_id text references public.conflict_register(conflict_id),
  spec_found     boolean not null default false,
  unique (sample_id, parameter_code)
);
alter table public.lab_test enable row level security;
create index if not exists idx_lab_test_sample on public.lab_test (sample_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · `lab_result` — immutable, versioned, superseding.
--
-- `LAB_MODEL §5 [DECISION]`: "Results are immutable and versioned. A retest never edits; it
-- creates `version = n+1` with `supersedes_result_id` pointing back." And: "v1 is never hidden.
-- The batch timeline and every decision package show `MC 76.4 → 73.8 (retest)`, because 'we
-- measured it twice' is itself a material fact."
--
-- ⚠ `verdict` IS GENERATED. It cannot be written, so no client can assert a pass. The order of the
-- branches is the whole of refusal 2:
--
--   invalid_reason present     → 'invalid'.  A declared-unusable reading is never a fail.
--   no band at all             → 'no_spec'.  TBD-13. NEVER auto-fails.
--   band present, no number    → 'invalid'.  A limit cannot be applied to an absent reading, and
--                                            calling that a fail would invent a judgement. This
--                                            mirrors `evaluate_gates`' `unevaluable`; `invalid`
--                                            is the only member of LAB_MODEL's four-verdict enum
--                                            that means "this cannot be judged".
--   inside the band            → 'pass'
--   otherwise                  → 'fail'
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_result (
  id                  uuid primary key default gen_random_uuid(),
  test_id             uuid not null references public.lab_test(id) on delete cascade,
  version             int not null default 1 check (version > 0),
  value_numeric       numeric,
  value_text          text,
  unit                text,
  -- Copied from `lab_test`, which froze them at request time.
  target_min          numeric,
  target_max          numeric,
  invalid_reason      text,
  measured_at         timestamptz not null default now(),
  technician_id       uuid references public.profiles(id),
  instrument_id       uuid references public.lab_instrument(id),
  calibration_status  lab_calibration_status not null default 'unknown',
  calibrated_on       date,
  raw_readings        jsonb,
  retest_reason       lab_retest_reason,
  supersedes_result_id   uuid references public.lab_result(id),
  superseded_by_result_id uuid references public.lab_result(id),
  accepted            boolean not null default false,
  accepted_by         uuid references public.profiles(id),
  accepted_at         timestamptz,
  deviation_id        uuid references public.deviation(id),
  created_at          timestamptz not null default now(),
  -- A result must say something. A row with neither a number nor a text value is not a result.
  constraint lab_result_has_a_value
    check (value_numeric is not null or value_text is not null or invalid_reason is not null),
  -- v1 supersedes nothing; every later version must say what it replaces. LAB_MODEL §5.
  constraint lab_result_v1_supersedes_nothing
    check ((version = 1) = (supersedes_result_id is null)),
  -- A retest carries a reason code, and only a retest does.
  constraint lab_result_retest_needs_reason
    check ((version > 1) = (retest_reason is not null)),
  unique (test_id, version),
  verdict text generated always as (
    case
      when invalid_reason is not null then 'invalid'
      when target_min is null and target_max is null then 'no_spec'
      when value_numeric is null then 'invalid'
      when (target_min is null or value_numeric >= target_min)
       and (target_max is null or value_numeric <= target_max) then 'pass'
      else 'fail'
    end) stored,
  -- The closed domain LAB_MODEL §2 names. A CHECK on a generated column is belt-and-braces: the
  -- CASE cannot produce anything else, and if a later migration edits the CASE carelessly the
  -- constraint refuses rather than letting a fifth verdict appear.
  constraint lab_result_verdict_domain
    check (verdict in ('pass','fail','no_spec','invalid'))
);
alter table public.lab_result enable row level security;
create index if not exists idx_lab_result_test on public.lab_result (test_id, version);

-- The current version of a test is the one nothing supersedes. A partial unique index makes two
-- live heads on one test unwritable, which is what keeps "the current result" a single row.
create unique index if not exists uq_lab_result_one_head
  on public.lab_result (test_id) where superseded_by_result_id is null;

-- ⚠ THE SELF-FK MUST BE DEFERRABLE, and the reason is the index above.
--
-- A partial unique index is checked at the END OF EVERY STATEMENT and cannot be deferred. So the
-- outgoing head has to stop being a head BEFORE the incoming one is written — which means updating
-- `superseded_by_result_id` to an id that does not exist yet. The first version of `order_retest`
-- inserted first and updated second, and this index refused it on every retest; that is what the
-- exit proof caught.
alter table public.lab_result drop constraint if exists lab_result_superseded_by_result_id_fkey;
alter table public.lab_result drop constraint if exists lab_result_superseded_fk;
alter table public.lab_result
  add constraint lab_result_superseded_fk
  foreign key (superseded_by_result_id) references public.lab_result(id)
  deferrable initially deferred;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9 · `lab_decision` — the submission verdict, under whichever reading authorised it.
--
-- `seq bigserial`, and NOT `order by decided_at`. B6 learned this the hard way: `now()` is frozen
-- for a whole transaction, so two decisions in one transaction tie and the later one is lost.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lab_decision (
  id                uuid primary key default gen_random_uuid(),
  seq               bigserial not null,
  batch_activity_id uuid not null references public.batch_activity(id) on delete cascade,
  verdict           text not null check (verdict in ('approved','rejected')),
  reason            text not null,
  decided_by        uuid references public.profiles(id),
  decided_role      app_role,
  -- WHICH READING OF C-32 permitted this decision. Never null: a decision that cannot name its
  -- authority is the thing C-32 is about.
  authorised_under_reading text not null references public.lab_approval_reading(reading_code),
  reading_was_enabled boolean not null,
  decided_at        timestamptz not null default now()
);
alter table public.lab_decision enable row level security;
create index if not exists idx_lab_decision_activity
  on public.lab_decision (batch_activity_id, seq desc);

do $$
declare t text;
begin
  foreach t in array array['lab_instrument','lab_checkpoint','lab_checkpoint_conflict',
                           'lab_sample','lab_test','lab_result','lab_decision'] loop
    execute format('drop policy if exists lab_read on public.%I', t);
    execute format(
      'create policy lab_read on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10 · Opening a sample and requesting its tests.
--
-- The band is looked up ONCE, here, and frozen. `p_checkpoint` is explicit rather than derived,
-- because deriving it means picking a map — C-33.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.open_lab_sample(
  p_activity   uuid,
  p_checkpoint uuid,
  p_label      text default null,
  p_at         timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ba     batch_activity;
  cp     lab_checkpoint;
  at_    timestamptz;
  new_id uuid;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  select * into cp from lab_checkpoint where id = p_checkpoint;
  if not found then raise exception 'No such lab checkpoint: %', p_checkpoint; end if;

  -- Same rule as every other recorded actual: not in the future. Consistent with 0016/0017/0021
  -- rather than a second opinion about time.
  at_ := coalesce(p_at, now());
  if at_ > now() then
    raise exception 'A sample cannot be collected in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  insert into lab_sample (checkpoint_id, master_batch_id, batch_activity_id, scope_ref,
                          vessel_id, sample_ref_label, collected_at, collected_by)
  values (cp.id, ba.master_batch_id, ba.id, ba.scope_label,
          ba.destination_location_id, p_label, at_, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'open_lab_sample', 'lab_sample', new_id::text,
          jsonb_build_object('checkpoint', cp.code, 'map', cp.checkpoint_map, 'activity', ba.title),
          'Sample collected at ' || cp.code || ' for ' || ba.title);
  return new_id;
end;
$$;

create or replace function public.request_lab_test(
  p_sample    uuid,
  p_parameter text,
  p_via       text default 'user'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  s      lab_sample;
  cp     lab_checkpoint;
  spec   lab_spec;
  m      text;
  new_id uuid;
begin
  select * into s from lab_sample where id = p_sample;
  if not found then raise exception 'No such sample: %', p_sample; end if;
  select * into cp from lab_checkpoint where id = s.checkpoint_id;

  -- ── THE FREEZE ────────────────────────────────────────────────────────────
  -- Looked up only through `spec_checkpoint_code`, which is null wherever TBD-36 leaves the
  -- mapping unstated. So an unmapped checkpoint freezes NO band, `spec_found` stays false, and
  -- every result on it is `no_spec`. That is the honest outcome of an unanswered mapping — not a
  -- reason to guess which spec row was meant.
  if cp.spec_checkpoint_code is not null then
    select * into spec from lab_spec
     where checkpoint_code = cp.spec_checkpoint_code and parameter_code = p_parameter;
  end if;

  -- The method, where one exists for the parameter. `lab_method` is keyed by an upper-case code
  -- and the parameter vocabulary is lower-case; the join is by name, not by a mapping table,
  -- because no source states a parameter → method mapping beyond the shared name.
  select code into m from lab_method where code = upper(p_parameter);

  insert into lab_test (sample_id, parameter_code, method_code, requested_by, requested_via,
                        target_min, target_max, target_unit, spec_source_ref, spec_conflict_id,
                        spec_found)
  values (s.id, p_parameter, m, auth.uid(),
          case when p_via = 'system' then 'system' else 'user' end,
          spec.min_value, spec.max_value, spec.unit, spec.source_ref, spec.conflict_id,
          spec.id is not null)
  on conflict (sample_id, parameter_code) do update set
    -- Re-requesting the same parameter on the same sample must not silently re-freeze a band
    -- against a spec that may have changed. Only the method is refreshed.
    method_code = excluded.method_code
  returning id into new_id;

  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11 · Recording a result, and superseding it with a retest.
--
-- `record_lab_result` writes v1 and refuses to write a second one — that is what `order_retest` is
-- for. Overwriting is the thing `LAB_MODEL §5` forbids, so there is no code path that does it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_lab_result(
  p_test           uuid,
  p_numeric        numeric default null,
  p_text           text    default null,
  p_instrument     uuid    default null,
  p_invalid_reason text    default null,
  p_raw            jsonb   default null,
  p_measured_at    timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  t        lab_test;
  inst     lab_instrument;
  cal      lab_calibration_status := 'unknown';
  at_      timestamptz;
  existing int;
  new_id   uuid;
begin
  select * into t from lab_test where id = p_test;
  if not found then raise exception 'No such lab test: %', p_test; end if;

  select count(*) into existing from lab_result where test_id = p_test;
  if existing > 0 then
    raise exception
      'A result already exists for this test. Results are immutable and versioned — order a '
      'retest instead, which preserves the original (LAB_MODEL §5).'
      using errcode = 'unique_violation';
  end if;

  at_ := coalesce(p_measured_at, now());
  if at_ > now() then
    raise exception 'A measurement cannot be recorded in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  -- Calibration status is DERIVED where it can be, and 'unknown' where it cannot. No source gives
  -- a calibration interval in days, so an instrument without one reports 'unknown' — never
  -- 'valid'. Rule 2: the absence is stated, not defaulted away.
  if p_instrument is not null then
    select * into inst from lab_instrument where id = p_instrument;
    if not found then raise exception 'No such instrument: %', p_instrument; end if;
    if inst.last_calibrated_on is null or inst.calibration_interval_days is null then
      cal := 'unknown';
    elsif inst.last_calibrated_on + inst.calibration_interval_days >= current_date then
      cal := 'valid';
    else
      cal := 'expired';
    end if;
  end if;

  insert into lab_result (test_id, version, value_numeric, value_text, unit,
                          target_min, target_max, invalid_reason, measured_at, technician_id,
                          instrument_id, calibration_status, calibrated_on, raw_readings)
  values (t.id, 1, p_numeric, p_text, t.target_unit,
          t.target_min, t.target_max, p_invalid_reason, at_, auth.uid(),
          p_instrument, cal, inst.last_calibrated_on, p_raw)
  returning id into new_id;

  update lab_test set state = 'reported' where id = t.id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  select auth.uid(), public.current_app_role(), 'record_lab_result', 'lab_result', new_id::text,
         jsonb_build_object('parameter', t.parameter_code, 'value',
                            coalesce(p_numeric::text, p_text), 'verdict', r.verdict),
         t.parameter_code || ' = ' || coalesce(p_numeric::text, p_text, 'invalid')
           || ' · ' || r.verdict
  from lab_result r where r.id = new_id;
  return new_id;
end;
$$;

-- A retest. NEVER an edit.
create or replace function public.order_retest(
  p_test           uuid,
  p_reason         lab_retest_reason,
  p_numeric        numeric default null,
  p_text           text    default null,
  p_instrument     uuid    default null,
  p_invalid_reason text    default null,
  p_measured_at    timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  t        lab_test;
  head     lab_result;
  inst     lab_instrument;
  cal      lab_calibration_status := 'unknown';
  at_      timestamptz;
  new_id   uuid;
  n_prior  int;
  escalate int;
begin
  select * into t from lab_test where id = p_test;
  if not found then raise exception 'No such lab test: %', p_test; end if;

  select * into head from lab_result
   where test_id = p_test and superseded_by_result_id is null;
  if not found then
    raise exception
      'There is nothing to retest — no result has been recorded for this test yet.'
      using errcode = 'no_data_found';
  end if;

  -- ROLE. `ROLE_AND_APPROVAL_MODEL` ticks "Order retest" for Lab and Supervisor and nobody else,
  -- and `LAB_MODEL §5` says why: "An operator cannot make a failing number go away."
  if public.current_app_role() is not null
     and public.current_app_role() not in ('lab_tech','supervisor') then
    raise exception
      'A % may not order a retest. ROLE_AND_APPROVAL_MODEL ticks this for the lab technician and '
      'the supervisor only — an operator cannot make a failing number go away.',
      public.current_app_role()
      using errcode = 'insufficient_privilege';
  end if;

  at_ := coalesce(p_measured_at, now());
  if at_ > now() then
    raise exception 'A measurement cannot be recorded in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  if p_instrument is not null then
    select * into inst from lab_instrument where id = p_instrument;
    if not found then raise exception 'No such instrument: %', p_instrument; end if;
    if inst.last_calibrated_on is null or inst.calibration_interval_days is null then
      cal := 'unknown';
    elsif inst.last_calibrated_on + inst.calibration_interval_days >= current_date then
      cal := 'valid';
    else
      cal := 'expired';
    end if;
  end if;

  -- ⚠ ORDER MATTERS. `uq_lab_result_one_head` is a partial unique index, checked at the end of
  -- every statement and impossible to defer, so the outgoing head must be demoted BEFORE the new
  -- one is inserted. That means knowing the new id first, and pointing at a row that does not exist
  -- yet — which is why `lab_result_superseded_fk` is DEFERRABLE INITIALLY DEFERRED.
  new_id := gen_random_uuid();

  -- The original is PRESERVED and pointed forward. It is never deleted and never hidden.
  update lab_result set superseded_by_result_id = new_id where id = head.id;

  -- The new version carries the SAME frozen band as the original. That is the point of freezing:
  -- v1 and v2 are comparable because they were judged against one band.
  insert into lab_result (id, test_id, version, value_numeric, value_text, unit,
                          target_min, target_max, invalid_reason, measured_at, technician_id,
                          instrument_id, calibration_status, calibrated_on,
                          retest_reason, supersedes_result_id)
  values (new_id, t.id, head.version + 1, p_numeric, p_text, t.target_unit,
          t.target_min, t.target_max, p_invalid_reason, at_, auth.uid(),
          p_instrument, cal, inst.last_calibrated_on, p_reason, head.id);

  select count(*) into n_prior from lab_result where test_id = p_test and version > 1;
  select int_value into escalate from lab_setting where key = 'retest_escalation_above';

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'order_retest', 'lab_result', new_id::text,
          jsonb_build_object('parameter', t.parameter_code, 'version', head.version + 1,
                             'reason', p_reason, 'supersedes', head.id),
          t.parameter_code || ' retested (' || p_reason || '), v' || head.version
            || ' preserved'
          || case when escalate is not null and n_prior > escalate
                  then ' · escalates to the GM: ' || n_prior || ' retests on one test'
                  else '' end);
  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12 · The submission decision — C-32, carried.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.decide_lab_submission(
  p_activity uuid,
  p_verdict  text,
  p_reason   text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ba      batch_activity;
  role_   app_role;
  reading lab_approval_reading;
  n_en    int;
  new_id  uuid;
  roles   text;
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

  insert into lab_decision (batch_activity_id, verdict, reason, decided_by, decided_role,
                            authorised_under_reading, reading_was_enabled)
  values (p_activity, p_verdict, p_reason, auth.uid(), role_,
          reading.reading_code, reading.is_enabled)
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), role_, 'decide_lab_submission', 'batch_activity', p_activity::text,
          jsonb_build_object('verdict', p_verdict, 'under_reading', reading.reading_code,
                             'reading_enabled', reading.is_enabled),
          p_verdict || ': ' || p_reason);
  return new_id;
end;
$$;

revoke execute on function public.open_lab_sample(uuid, uuid, text, timestamptz) from anon;
revoke execute on function public.request_lab_test(uuid, text, text) from anon;
revoke execute on function public.record_lab_result(
  uuid, numeric, text, uuid, text, jsonb, timestamptz) from anon;
revoke execute on function public.order_retest(
  uuid, lab_retest_reason, numeric, text, uuid, text, timestamptz) from anon;
revoke execute on function public.decide_lab_submission(uuid, text, text) from anon;

grant execute on function public.open_lab_sample(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.request_lab_test(uuid, text, text) to authenticated;
grant execute on function public.record_lab_result(
  uuid, numeric, text, uuid, text, jsonb, timestamptz) to authenticated;
grant execute on function public.order_retest(
  uuid, lab_retest_reason, numeric, text, uuid, text, timestamptz) to authenticated;
grant execute on function public.decide_lab_submission(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13 · Views. `UI_DATA_CONTRACTS §12` and §13 are the shape.
-- ─────────────────────────────────────────────────────────────────────────────

-- Every version of every result, oldest first. §5: "v1 is never hidden."
create or replace view public.v_lab_result_history as
select
  s.master_batch_id,
  mb.code            as batch_code,
  s.batch_activity_id,
  cp.checkpoint_map,
  cp.code            as checkpoint_code,
  t.id               as test_id,
  t.parameter_code,
  r.id               as result_id,
  r.version,
  r.value_numeric,
  r.value_text,
  r.unit,
  r.verdict,
  r.target_min,
  r.target_max,
  t.spec_found,
  t.spec_source_ref,
  t.spec_conflict_id,
  r.retest_reason,
  r.supersedes_result_id,
  r.superseded_by_result_id,
  (r.superseded_by_result_id is null) as is_current,
  r.measured_at,
  p.display_name     as technician_name,
  i.code             as instrument_code,
  r.calibration_status,
  r.accepted,
  r.accepted_at
from public.lab_result r
join public.lab_test t on t.id = r.test_id
join public.lab_sample s on s.id = t.sample_id
join public.lab_checkpoint cp on cp.id = s.checkpoint_id
join public.master_batch mb on mb.id = s.master_batch_id
left join public.profiles p on p.id = r.technician_id
left join public.lab_instrument i on i.id = r.instrument_id;

grant select on public.v_lab_result_history to authenticated;

comment on view public.v_lab_result_history is
  'EVERY version of every lab result, with the superseding chain intact. LAB_MODEL §5 - "v1 is '
  'never hidden ... because we measured it twice is itself a material fact." Filter is_current '
  'for the head; do not filter it out of a decision package.';

-- The current head only.
create or replace view public.v_lab_result_current as
select * from public.v_lab_result_history where is_current;

grant select on public.v_lab_result_current to authenticated;

-- The technician's queue. `UI_DATA_CONTRACTS §12` keys this on `batch_activity`, not on a sample.
--
-- ⚠ `band` HAS NO 'overdue' MEMBER, and that is not an omission. §12 asks for
-- 'overdue' | 'today' | 'retest', but NO SOURCE ANYWHERE gives a lab turnaround time, an SLA or a
-- due-by. `LAB_MODEL §8`'s mock shows "requested 6 h ago" as illustrative prose, not a spec.
-- Computing 'overdue' would mean inventing a duration, so the band reports what it can prove and
-- `overdue_unknown_reason` says why the third value is absent.
create or replace view public.v_lab_queue as
select
  ba.master_batch_id,
  mb.code            as batch_code,
  mb.label           as batch_label,
  ba.rel_day         as current_day,
  ba.id              as activity_id,
  ba.title           as activity_title,
  ba.scope_label,
  ba.lab_parameters  as parameters,
  ba.state::text     as state,
  (ba.state in ('READY','IN_PROGRESS','RETURNED')) as action_required,
  (select d.verdict from public.lab_decision d
    where d.batch_activity_id = ba.id order by d.seq desc limit 1) as last_submission,
  case
    when exists (select 1 from public.lab_result r
                   join public.lab_test t on t.id = r.test_id
                   join public.lab_sample s on s.id = t.sample_id
                  where s.batch_activity_id = ba.id and r.retest_reason is not null
                    and r.superseded_by_result_id is null) then 'retest'
    else 'today'
  end as band,
  'No source gives a lab turnaround time, so an overdue band cannot be computed without '
    || 'inventing a duration' as overdue_unknown_reason,
  (select count(*) from public.lab_sample s where s.batch_activity_id = ba.id) as samples,
  (select count(*) from public.lab_result r
     join public.lab_test t on t.id = r.test_id
     join public.lab_sample s on s.id = t.sample_id
    where s.batch_activity_id = ba.id and r.superseded_by_result_id is null) as results
from public.batch_activity ba
join public.master_batch mb on mb.id = ba.master_batch_id
where ba.responsible_role = 'lab_tech'
  and mb.status = 'active';

grant select on public.v_lab_queue to authenticated;

comment on view public.v_lab_queue is
  'The lab technician queue, keyed on batch_activity per UI_DATA_CONTRACTS §12. `band` carries no '
  '"overdue" member: no source states a lab turnaround time, and inventing one is forbidden. '
  '`overdue_unknown_reason` names the gap so the absence is visible in the UI.';

-- Both readings of C-32, for the screen that must NOT name an approver.
create or replace view public.v_lab_approval_question as
select
  r.reading_code,
  r.approver_role,
  r.statement,
  r.source_ref,
  r.consequence,
  r.is_enabled,
  cr.question,
  cr.status as conflict_status,
  (select count(*) from public.lab_approval_reading where is_enabled) = 0 as still_open
from public.lab_approval_reading r
left join public.conflict_register cr on cr.conflict_id = 'C-32';

grant select on public.v_lab_approval_question to authenticated;

-- Both checkpoint maps, side by side, each row carrying every open question it touches.
--
-- This is the view that makes C-33 visible instead of resolved. A reader can see that the same
-- physical moment appears in both maps under different codes with different parameter panels, and
-- that nothing in the system prefers one.
create or replace view public.v_lab_checkpoint_map as
select
  cp.checkpoint_map,
  cp.code,
  cp.name,
  cp.rel_day,
  cp.scope,
  cp.parameters,
  cp.spec_checkpoint_code,
  (cp.spec_checkpoint_code is not null) as spec_mapped,
  cp.source_ref,
  coalesce(
    (select array_agg(cc.conflict_id order by cc.conflict_id)
       from public.lab_checkpoint_conflict cc where cc.checkpoint_id = cp.id),
    '{}'::text[]) as conflict_ids,
  (select count(*) from public.lab_spec ls
    where ls.checkpoint_code = cp.spec_checkpoint_code) as spec_rows,
  (select count(*) from public.lab_spec ls
    where ls.checkpoint_code = cp.spec_checkpoint_code
      and ls.min_value is null and ls.max_value is null) as spec_rows_without_a_band
from public.lab_checkpoint cp;

grant select on public.v_lab_checkpoint_map to authenticated;

comment on view public.v_lab_checkpoint_map is
  'BOTH lab checkpoint maps, carried side by side per BUILD_SEQUENCE_KIRO §B5 - "Do not merge, do '
  'not pick." checkpoint_map names which map a row belongs to; conflict_ids carries every open '
  'question the row touches, C-33 among them. spec_mapped is false wherever TBD-36 leaves the '
  'mapping to lab_spec unstated, and a test on such a checkpoint freezes no band at all.';
