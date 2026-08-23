-- 0017 · Deviations, supervisor verdicts, corrective actions.  (B2)
--
-- WHAT WAS MISSING
--
-- A deviation was a state value plus a sentence in `blocked_reason`. There was no record: no id,
-- no raiser, no reviewer, no resolution, no corrective action, and no way to accept one. The
-- system could record that a value was wrong and could stop the line, but nothing could say who
-- looked at it, what they decided, or why. docs/CONTRACT_AUDIT_2026-08-22.md §3.5.
--
-- 0016 left the marker: "B2 replaces this with a real deviation."
--
-- SPEC. docs/ROLE_AND_APPROVAL_MODEL.md §2 (authority matrix), §3.1 (verdicts), §3.2 (protected
-- gates), §3.3 (control room). There is no §7 deviation lifecycle — an earlier instruction cited
-- one and was wrong.
--
-- THE RULE THAT SHAPES EVERYTHING HERE, §3.1 verbatim:
--   ACCEPT WITH DEVIATION — "one failing condition is waived for this batch … reason text;
--   deviation stays open on the record and appears in every downstream GM package"
--
-- So `accepted` is NOT a way to make a deviation go away. It waives the condition so work can
-- continue, and the deviation remains on the record forever. Only a verified corrective action
-- `resolves` one. `v_deviation_open` below is the query every downstream surface must use, and it
-- counts accepted deviations as still standing.

-- ─────────────────────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type deviation_kind as enum (
    'VALUE_OUT_OF_SOP',       -- a recorded value fell outside the SOP band  (column ①)
    'VALUE_OFF_DAY0_TARGET',  -- no SOP band exists; outside tolerance of the Day-0 target (②)
    'GATE_WAIVED',            -- a failing gate was accepted so work could continue
    'MANUAL'                  -- raised by a person who saw something
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type deviation_state as enum (
    'open',       -- awaiting a supervisor verdict
    'accepted',   -- waived for this batch; STILL ON THE RECORD, see the header
    'escalated',  -- a protected gate; only a GM override can pass it
    'resolved'    -- a corrective action was carried out and verified
  );
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- deviation
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.deviation (
  id                uuid primary key default gen_random_uuid(),
  master_batch_id   uuid not null references public.master_batch(id) on delete cascade,
  -- Null for a batch-level deviation. Most are activity-level.
  batch_activity_id uuid references public.batch_activity(id) on delete cascade,
  kind              deviation_kind not null,
  -- One sentence a GM can read without opening anything.
  summary           text not null check (length(trim(summary)) > 0),
  -- What actually triggered it: the field, the value, the band or target it missed, the source
  -- ref, and any conflict ID attached to the bound. Self-describing, because the GM package
  -- renders this without re-deriving it months later.
  detail            jsonb not null default '{}'::jsonb,
  gate_rule_id      uuid references public.gate_rule(id),

  raised_at         timestamptz not null default now(),
  raised_by         uuid references public.profiles(id),
  raised_by_role    app_role,

  state             deviation_state not null default 'open',
  decided_at        timestamptz,
  decided_by        uuid references public.profiles(id),
  decided_by_role   app_role,
  -- Mandatory on every verdict. The supervisor's own words are quoted verbatim in the UI, so
  -- this is the sentence that ends up in front of the owner.
  decision_reason   text,

  -- A verdict must name who made it, when, and why. Enforced here rather than in the RPCs so a
  -- future writer cannot bypass it.
  constraint deviation_verdict_is_attributed check (
    state = 'open'
    or (decided_at is not null and decided_by is not null
        and coalesce(decision_reason, '') <> '')
  )
);
alter table public.deviation enable row level security;

create index if not exists idx_deviation_batch   on public.deviation (master_batch_id, state);
create index if not exists idx_deviation_activity on public.deviation (batch_activity_id)
  where batch_activity_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- corrective_action
--
-- A corrective action is what someone DID about it. Verification is separate from creation,
-- because "we added water" and "the retest came back in band" are different claims and the
-- second is the one that closes a deviation.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.corrective_action (
  id                uuid primary key default gen_random_uuid(),
  deviation_id      uuid not null references public.deviation(id) on delete cascade,
  description       text not null check (length(trim(description)) > 0),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id),
  verified_at       timestamptz,
  verified_by       uuid references public.profiles(id),
  verification_note text,
  constraint corrective_action_verification_is_attributed check (
    verified_at is null
    or (verified_by is not null and coalesce(verification_note, '') <> '')
  )
);
alter table public.corrective_action enable row level security;

create index if not exists idx_corrective_action_dev on public.corrective_action (deviation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Protected gates — docs/ROLE_AND_APPROVAL_MODEL.md §3.2
--
-- A supervisor may accept-with-deviation on most gates. Four categories are protected: only a
-- GM-approved override passes them. Two of the four are identifiable in the seeded rules today.
-- The other two are NOT, and are registered rather than guessed:
--
--   ✅ pasteurisation not achieved      SENSOR_THRESHOLD on TN-HOLD (pasteurisation_temp_c ≥ 58)
--   ✅ tunnel fill above SOP maximum    FIELD_IN_RANGE on TN-LOAD (fill_height_m)
--   ❌ ammonia not cleared at tunnel out  NO GATE EXISTS. TBD-14 records that ammonia appears
--                                        nowhere in the lab workbook — "Is it measured? With
--                                        what?" Cannot be marked without inventing the gate.
--   ❌ critical severity at a checkpoint  No severity model exists on gate_rule or on the
--                                        checkpoint. Needs B6. See TBD-51.
--
-- The pasteurisation rule currently ships `is_enabled = false` / `sop_inferred` because C-04 and
-- C-27 are unresolved. Marking it protected anyway is deliberate: protection is a property of the
-- gate, not of whether it fires today, and doing it now means nobody has to remember later.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.gate_rule
  add column if not exists is_protected boolean not null default false;

comment on column public.gate_rule.is_protected is
  'ROLE_AND_APPROVAL_MODEL §3.2 — a supervisor may not accept-with-deviation on this gate; '
  'only a GM-approved override passes it.';

update public.gate_rule g
   set is_protected = true
  from public.process_activity pa
 where pa.id = g.process_activity_id
   and (
     (pa.code = 'TN-HOLD' and g.kind = 'SENSOR_THRESHOLD'
      and g.config->>'parameter' = 'pasteurisation_temp_c')
     or
     (pa.code = 'TN-LOAD' and g.kind = 'FIELD_IN_RANGE'
      and g.config->>'field_key' = 'fill_height_m')
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- The one query every downstream surface uses.
--
-- "Open" means "still standing against this batch", which INCLUDES accepted. A GM package that
-- counted accepted deviations as closed would be exactly the report §3.1 forbids.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_deviation_open as
select d.*,
       (d.state in ('open', 'escalated'))            as awaiting_verdict,
       (d.state in ('open', 'escalated', 'accepted')) as stands_on_record
from public.deviation d;

grant select on public.v_deviation_open to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Guards
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.assert_role(p_allowed app_role[], p_action text)
returns void language plpgsql stable as $$
begin
  if not public.has_role(variadic p_allowed) then
    raise exception '% requires role %, not %',
      p_action, array_to_string(p_allowed, ' or '),
      coalesce(public.current_app_role()::text, 'an unauthenticated session')
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- raise_deviation · Op, Lab, Sup, GM  (§2 authority matrix)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.raise_deviation(
  p_activity uuid,
  p_summary  text,
  p_kind     deviation_kind default 'MANUAL',
  p_detail   jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare ba batch_activity; new_id uuid;
begin
  perform public.assert_role(array['operator','lab_tech','supervisor','gm']::app_role[],
                             'Raising a deviation');

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;

  insert into deviation (master_batch_id, batch_activity_id, kind, summary, detail,
                         raised_by, raised_by_role)
  values (ba.master_batch_id, p_activity, p_kind, p_summary, coalesce(p_detail, '{}'::jsonb),
          auth.uid(), public.current_app_role())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           after_state, reason)
  values (auth.uid(), public.current_app_role(), 'raise_deviation', 'deviation', new_id::text,
          p_detail, p_summary);

  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- accept_with_deviation · Sup, GM. Refused on a protected gate.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_with_deviation(p_deviation uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare d deviation; protected boolean;
begin
  perform public.assert_role(array['supervisor','gm']::app_role[], 'Accept-with-deviation');

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Accept-with-deviation needs a reason — it goes on the record permanently';
  end if;

  select * into d from deviation where id = p_deviation;
  if not found then raise exception 'No such deviation: %', p_deviation; end if;
  if d.state <> 'open' then
    raise exception 'Deviation is already %, not open', d.state;
  end if;

  -- A protected gate is the one thing a supervisor cannot wave through. §3.2.
  select coalesce(g.is_protected, false) into protected
  from gate_rule g where g.id = d.gate_rule_id;

  if protected and not public.has_role('gm') then
    raise exception
      'This gate is protected — a supervisor cannot accept it. Escalate it for a GM override.'
      using errcode = 'insufficient_privilege';
  end if;

  update deviation
     set state = 'accepted', decided_at = now(), decided_by = auth.uid(),
         decided_by_role = public.current_app_role(), decision_reason = p_reason
   where id = p_deviation;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'accept_with_deviation', 'deviation',
          p_deviation::text, p_reason);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- escalate_deviation · Sup only.  gm_decide_override · GM only.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.escalate_deviation(p_deviation uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_role(array['supervisor']::app_role[], 'Escalating a deviation');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'An escalation needs a reason — the GM is being asked to decide on it';
  end if;

  update deviation
     set state = 'escalated', decided_at = now(), decided_by = auth.uid(),
         decided_by_role = public.current_app_role(), decision_reason = p_reason
   where id = p_deviation and state = 'open';

  if not found then raise exception 'Deviation is not open, or does not exist'; end if;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'escalate_deviation', 'deviation',
          p_deviation::text, p_reason);
end;
$$;

create or replace function public.gm_decide_override(
  p_deviation uuid, p_approve boolean, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_role(array['gm']::app_role[], 'Deciding a controlled override');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'An override decision needs a reason';
  end if;

  update deviation
     set state = case when p_approve then 'accepted'::deviation_state
                      else 'open'::deviation_state end,
         decided_at = now(), decided_by = auth.uid(),
         decided_by_role = public.current_app_role(),
         decision_reason = p_reason
   where id = p_deviation and state = 'escalated';

  if not found then raise exception 'Deviation is not escalated, or does not exist'; end if;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(),
          case when p_approve then 'gm_override_approved' else 'gm_override_refused' end,
          'deviation', p_deviation::text, p_reason);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Corrective actions, and the only thing that RESOLVES a deviation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.add_corrective_action(p_deviation uuid, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform public.assert_role(array['supervisor','gm','lab_tech']::app_role[],
                             'Recording a corrective action');
  insert into corrective_action (deviation_id, description, created_by)
  values (p_deviation, p_description, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'add_corrective_action', 'corrective_action',
          new_id::text, p_description);
  return new_id;
end;
$$;

create or replace function public.verify_corrective_action(p_action uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare dev uuid;
begin
  perform public.assert_role(array['supervisor','gm']::app_role[],
                             'Verifying a corrective action');
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Verifying a corrective action needs a note saying what proved it';
  end if;

  update corrective_action
     set verified_at = now(), verified_by = auth.uid(), verification_note = p_note
   where id = p_action
  returning deviation_id into dev;
  if dev is null then raise exception 'No such corrective action'; end if;

  -- A deviation resolves only when a corrective action has been VERIFIED. Doing the work is not
  -- the same claim as the work having worked.
  update deviation
     set state = 'resolved', decided_at = now(), decided_by = auth.uid(),
         decided_by_role = public.current_app_role(),
         decision_reason = coalesce(nullif(decision_reason, ''), p_note)
   where id = dev and state in ('open', 'accepted', 'escalated');

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'verify_corrective_action',
          'corrective_action', p_action::text, p_note);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Supervisor verdicts on an activity — §3.1
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.release_activity(p_activity uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare ba batch_activity; still_open int;
begin
  perform public.assert_role(array['supervisor']::app_role[], 'Releasing an activity');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A release needs a reason';
  end if;

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity'; end if;

  -- §3.1 RELEASE requires "all exit-gate conditions satisfied, OR an accept-with-deviation on
  -- each failing one". So: nothing may still be awaiting a verdict.
  select count(*) into still_open
  from v_deviation_open
  where batch_activity_id = p_activity and awaiting_verdict;

  if still_open > 0 then
    raise exception
      'Cannot release — % deviation(s) still awaiting a verdict. Accept or resolve each one first.',
      still_open;
  end if;

  update batch_activity
     set state = 'COMPLETED', blocked_reason = null,
         actual_end = coalesce(actual_end, now())
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'release_activity', 'batch_activity',
          p_activity::text, p_reason);

  -- Whatever this was holding up is re-evaluated by the gate engine, not by this function.
  perform public.advance_batch(ba.master_batch_id);
end;
$$;

create or replace function public.hold_activity(p_activity uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_role(array['supervisor']::app_role[], 'Holding an activity');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A hold needs a reason — the card has to say why on its face';
  end if;

  update batch_activity
     set state = 'BLOCKED', blocked_reason = 'Held by supervisor — ' || p_reason
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'hold_activity', 'batch_activity',
          p_activity::text, p_reason);
end;
$$;

create or replace function public.return_activity(p_activity uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_role(array['supervisor']::app_role[], 'Returning an activity');
  if coalesce(trim(p_reason), '') = '' then
    -- §3.1 RETURN requires "reason text + what specifically to redo".
    raise exception 'A return needs a reason saying what specifically to redo';
  end if;

  update batch_activity
     set state = 'RETURNED', blocked_reason = 'Returned — ' || p_reason
   where id = p_activity;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message,
                            reason, sent_by)
  select ba.master_batch_id, ba.id, ba.responsible_role, 'returned',
         ba.title || ' — ' || ba.scope_label || ' was returned', p_reason, auth.uid()
  from batch_activity ba where ba.id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'return_activity', 'batch_activity',
          p_activity::text, p_reason);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- submit_activity · unchanged in every respect except that a variance now creates a RECORD.
--
-- Everything 0016 established is preserved: stated actuals, the separate entry clock, the
-- evidence hold that keeps what was reported, and both clocks in the audit trail. The only
-- addition is the block at the end that turns each out-of-range field into a `deviation` row.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_activity(
  p_activity     uuid,
  p_values       jsonb       default '{}'::jsonb,
  p_remarks      text        default null,
  p_actual_start timestamptz default null,
  p_actual_end   timestamptz default null
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
  entered_at  timestamptz := now();
  h0          timestamptz;
  eff_start   timestamptz;
  eff_end     timestamptz;
  -- Each failing field, captured so the deviation rows can be written after the state settles.
  fails       jsonb := '[]'::jsonb;
  f           jsonb;
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

  -- ── Recorded actuals are validated BEFORE anything is written ─────────────
  -- Carried unchanged from 0016. A refusal must leave the row exactly as it was, and a refusal an
  -- operator cannot act on is barely better than a silent one — so every message names the
  -- activity and the value it rejected.

  if p_actual_start is not null and p_actual_start > entered_at then
    raise exception
      'Cannot record a start of % for %: that is in the future. An actual is something that has '
      'already happened.', p_actual_start, ba.title
      using errcode = 'invalid_datetime_format';
  end if;

  if p_actual_end is not null and p_actual_end > entered_at then
    raise exception
      'Cannot record an end of % for %: that is in the future. An actual is something that has '
      'already happened.', p_actual_end, ba.title
      using errcode = 'invalid_datetime_format';
  end if;

  -- The EFFECTIVE pair, so a stated end earlier than an already-recorded start is refused too —
  -- start_activity may have written actual_start when the operator opened the card.
  eff_start := coalesce(p_actual_start, ba.actual_start);
  eff_end   := coalesce(p_actual_end, ba.actual_end);

  if eff_start is not null and eff_end is not null and eff_end < eff_start then
    raise exception
      'Cannot record % ending at % when it started at %: work does not end before it begins.',
      ba.title, eff_end, eff_start
      using errcode = 'invalid_datetime_format';
  end if;

  -- NEW in B2 · a STATED actual may not precede H0. `batchHour()` already throws on it —
  -- "nothing in a batch happens before H0" — so the server agrees with the domain function
  -- rather than accepting what the client would refuse to render.
  --
  -- SCOPED TO WHAT THE SUBMITTER STATES, deliberately. Applying it to the `now()` default would
  -- also refuse a live recording on a batch whose `start_at` is still in the future — and that
  -- situation is reachable today: `activate_batch` does not require H0 to have passed, and
  -- `start_activity` stamps `now()` with no H0 check, so an activity can already carry an
  -- `actual_start` a month before its own batch began. Refusing at submit would strand an
  -- operator over a value they did not state.
  --
  -- That incoherence is REAL and PRE-EXISTING, and it is registered as TBD-52 rather than
  -- resolved here: whether "active" should mean "started" is a factory question, and answering
  -- it inside a deviations migration would be the wrong place and the wrong authority.
  h0 := b.start_at;
  if h0 is not null and p_actual_start is not null and p_actual_start < h0 then
    raise exception
      'Cannot record % starting at %: the batch begins at % and nothing in it happens before '
      'that.', ba.title, p_actual_start, h0
      using errcode = 'invalid_datetime_format';
  end if;
  if h0 is not null and p_actual_end is not null and p_actual_end < h0 then
    raise exception
      'Cannot record % ending at %: the batch begins at % and nothing in it happens before '
      'that.', ba.title, p_actual_end, h0
      using errcode = 'invalid_datetime_format';
  end if;

  for k, v in select * from jsonb_each_text(p_values) loop
    select * into fld from batch_activity_value
     where batch_activity_id = p_activity and field_key = k;
    continue when not found;

    flag := 'not_applicable';

    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
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
          fails := fails || jsonb_build_object(
            'kind', 'VALUE_OUT_OF_SOP',
            'summary', fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                       || ' is outside the SOP band '
                       || coalesce(fld.sop_min::text,'') || '–' || coalesce(fld.sop_max::text,''),
            'detail', jsonb_build_object(
              'field_key', k, 'label', fld.label, 'value', v, 'unit', fld.unit,
              'sop_min', fld.sop_min, 'sop_max', fld.sop_max,
              'sop_source_ref', fld.sop_source_ref, 'conflict_id', fld.conflict_id,
              'day0_value', fld.day0_value));
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
          fails := fails || jsonb_build_object(
            'kind', 'VALUE_OFF_DAY0_TARGET',
            'summary', fld.label || ' ' || v || coalesce(' ' || fld.unit,'')
                       || ' against ' || target || coalesce(' ' || fld.unit,'')
                       || ' planned at Day 0 ('
                       || case when v::numeric > target then '+' else '' end
                       || round(v::numeric - target, 2) || ')',
            'detail', jsonb_build_object(
              'field_key', k, 'label', fld.label, 'value', v, 'unit', fld.unit,
              'target', target, 'target_source', target_src,
              'tolerance_pct', 10, 'conflict_id', fld.conflict_id,
              -- No SOP band exists here. Saying so is information: docs/LAB_MODEL.md §9.
              'sop_source_ref', fld.sop_source_ref));
        else
          flag := 'in_range';
        end if;
      end if;
    end if;

    update batch_activity_value
       set actual_value = v,
           actual_recorded_at = entered_at,
           actual_recorded_by = auth.uid(),
           variance_flag = flag,
           remarks = coalesce(nullif(p_remarks,''), remarks)
     where id = fld.id;
  end loop;

  select gv.reason into outstanding
  from public.evaluate_gates(p_activity, 'exit') gv
  where gv.kind = 'EVIDENCE_COMPLETE' and gv.verdict = 'fail'
  order by gv.ordering
  limit 1;

  if outstanding is not null then
    update batch_activity
       set state = 'IN_PROGRESS',
           actual_start = coalesce(p_actual_start, actual_start, entered_at),
           actual_end = coalesce(p_actual_end, actual_end),
           actual_recorded_at = entered_at,
           blocked_reason = null
     where id = p_activity;

    insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                             after_state, reason)
    values (auth.uid(), public.current_app_role(), 'submit_blocked_on_evidence',
            'batch_activity', p_activity::text,
            jsonb_build_object('actual_start', p_actual_start, 'actual_end', p_actual_end,
                               'recorded_at', entered_at),
            outstanding);

    return query select 'IN_PROGRESS'::text, dev_count, outstanding;
    return;
  end if;

  update batch_activity
     set state = case when dev_count > 0 then 'DEVIATION'::activity_state
                      else 'COMPLETED'::activity_state end,
         actual_start = coalesce(p_actual_start, actual_start, entered_at),
         actual_end = coalesce(p_actual_end, actual_end, entered_at),
         actual_recorded_at = entered_at,
         submitted_at = entered_at,
         submitted_by = auth.uid(),
         blocked_reason = case when dev_count > 0
           then rtrim(reasons, '; ') || ' — held for supervisor review' end
   where id = p_activity;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           after_state, reason)
  select auth.uid(), public.current_app_role(), 'submit_activity', 'batch_activity',
         p_activity::text,
         jsonb_build_object(
           'actual_start', cur.actual_start,
           'actual_end', cur.actual_end,
           'recorded_at', cur.actual_recorded_at,
           'duration_actual_min', cur.duration_actual_min,
           'variance_minutes', cur.variance_minutes,
           'stated_by_submitter', (p_actual_start is not null or p_actual_end is not null)),
         case when dev_count > 0 then 'DEVIATION · ' || rtrim(reasons,'; ')
              else coalesce(nullif(p_remarks,''), 'submitted') end
    from batch_activity cur where cur.id = p_activity;

  -- ── B2 · every failing field becomes a record someone can act on ──────────────
  -- One row per failing condition, not one per submission: §3.1 waives "one failing condition"
  -- at a time, so a supervisor must be able to accept one and refuse another.
  for f in select * from jsonb_array_elements(fails) loop
    insert into deviation (master_batch_id, batch_activity_id, kind, summary, detail,
                           raised_by, raised_by_role)
    values (ba.master_batch_id, p_activity, (f->>'kind')::deviation_kind,
            f->>'summary', f->'detail', auth.uid(), public.current_app_role());
  end loop;

  if dev_count = 0 then
    perform public.advance_batch(ba.master_batch_id);
  else
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
           and n2.state in ('LOCKED','READY','WAITING_TIME'));
  end if;

  return query
    select (select state::text from batch_activity where id = p_activity), dev_count, null::text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS and grants. Reads open to authenticated; every write goes through the RPCs above,
-- which carry their own role assertions.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['deviation','corrective_action'] loop
    execute format('drop policy if exists dev_read on public.%I', t);
    execute format(
      'create policy dev_read on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

revoke execute on function public.raise_deviation(uuid, text, deviation_kind, jsonb) from anon;
revoke execute on function public.accept_with_deviation(uuid, text) from anon;
revoke execute on function public.escalate_deviation(uuid, text) from anon;
revoke execute on function public.gm_decide_override(uuid, boolean, text) from anon;
revoke execute on function public.release_activity(uuid, text) from anon;
revoke execute on function public.hold_activity(uuid, text) from anon;
revoke execute on function public.return_activity(uuid, text) from anon;

grant execute on function public.raise_deviation(uuid, text, deviation_kind, jsonb) to authenticated;
grant execute on function public.accept_with_deviation(uuid, text) to authenticated;
grant execute on function public.escalate_deviation(uuid, text) to authenticated;
grant execute on function public.gm_decide_override(uuid, boolean, text) to authenticated;
grant execute on function public.add_corrective_action(uuid, text) to authenticated;
grant execute on function public.verify_corrective_action(uuid, text) to authenticated;
grant execute on function public.release_activity(uuid, text) to authenticated;
grant execute on function public.hold_activity(uuid, text) to authenticated;
grant execute on function public.return_activity(uuid, text) to authenticated;
