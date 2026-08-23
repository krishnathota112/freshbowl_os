-- 0018 · The event trail.  (B3)
--
-- WHAT WAS MISSING
--
-- `fn_audit()` was written in 0001 and attached to NOTHING. Eighteen semantic events are written
-- by hand inside RPCs — which is the right shape, because contract §24's list is semantic
-- ("REST_RELEASED", "GM_APPROVED"), not row-level. But two holes mattered:
--
--   1. `advance_batch` wrote NOTHING. Every gate opening, every rest starting and every rest
--      releasing was invisible. "Why did this open when it did" had no answer in the record — on
--      the one transition class that is decided by the server rather than by a person.
--   2. Nothing recorded a batch being CREATED, a plan being GENERATED, or an admin EDITING the
--      schedule before activation. A batch could appear, and its Day-0 answers could change,
--      with nothing but `created_by` to show for it.
--
-- WHAT THIS DOES NOT DO, deliberately
--
-- It does not attach a row-level trigger to `batch_activity` or `batch_activity_value`. Those
-- carry hundreds of transitions per batch across twelve concurrent batches, each would write a
-- full before/after jsonb, and every one of them is ALREADY covered by a semantic event that says
-- *why*. A trigger there would bury the trail it was meant to complete.
--
-- The trigger goes where a SILENT change is a governance problem and the volume is low: who has
-- which role, what the process says, what the gates are, and what time the factory starts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · fn_audit gains a key-column argument.
--
-- The 0001 version hard-coded `new.id`, so it could not be attached to a table keyed on anything
-- else — `conflict_register` keys on `conflict_id`. One optional TG_ARGV keeps it general.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  key_col text := coalesce(tg_argv[0], 'id');
  rec     jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                           before_state, after_state)
  values (auth.uid(), public.current_app_role(), tg_op, tg_table_name,
          coalesce(rec ->> key_col, '(unkeyed)'),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b · A latent bug in `current_app_role()`, from 0001, that B3 exposed.
--
-- The 0001 definition casts the claim straight to jsonb:
--
--     nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'app_role', '')
--
-- The `nullif` guards the OUTPUT. Nothing guards the INPUT — and `current_setting(x, true)`
-- returns NULL only while the setting has never been defined in the session. Once anything has
-- touched it, it reverts to the EMPTY STRING, and `''::jsonb` raises
-- `invalid input syntax for type json`.
--
-- It stayed hidden because `current_app_role()` was only ever called inside RPCs, on sessions
-- that either carried a real claim or had never seen one. Attaching the audit triggers calls it
-- on every governance write, on every session — which made it fire immediately.
--
-- `auth.uid()` has the guard in the right place; this is the same shape.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.current_app_role()
returns app_role language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'app_role',
    ''
  )::app_role;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Attach it to the governance tables.
--
-- `when (old.* is distinct from new.*)` on UPDATE matters more than it looks: the seeds are
-- idempotent and re-run `on conflict do update` with identical values on every `db:seed`. Without
-- the guard, every seed run would write ~130 audit rows saying nothing changed.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t    text;
  keyc text;
  spec text[][] := array[
    -- who has which role. A silent role change is the single most dangerous edit in the system.
    ['profiles', 'id'],
    -- the batch header: status, start_at, and the Day-0 config that the baseline was built from.
    ['master_batch', 'id'],
    -- the process itself, and the rules that gate it.
    ['process_definition', 'id'],
    ['process_activity', 'id'],
    ['activity_field', 'id'],
    ['evidence_requirement', 'id'],
    ['gate_rule', 'id'],
    -- H0 and the factory timezone.
    ['factory_clock', 'id'],
    -- the register of what we have not resolved. Keyed on conflict_id, not id.
    ['conflict_register', 'conflict_id']
  ];
begin
  for i in 1 .. array_length(spec, 1) loop
    t := spec[i][1];
    keyc := spec[i][2];
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('drop trigger if exists trg_audit_ins on public.%I', t);
    execute format('drop trigger if exists trg_audit_upd on public.%I', t);
    execute format('drop trigger if exists trg_audit_del on public.%I', t);

    execute format(
      'create trigger trg_audit_ins after insert on public.%I
         for each row execute function public.fn_audit(%L)', t, keyc);
    execute format(
      'create trigger trg_audit_upd after update on public.%I
         for each row when (old.* is distinct from new.*)
         execute function public.fn_audit(%L)', t, keyc);
    execute format(
      'create trigger trg_audit_del after delete on public.%I
         for each row execute function public.fn_audit(%L)', t, keyc);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · audit_event is append-only, and now provably so.
--
-- 0001 revoked update and delete from `authenticated` and `anon`. That leaves the owner, the
-- service role, and anything running as `security definer`. A trail that a privileged path can
-- quietly rewrite is not a trail.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_audit_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_event is append-only — % is not permitted on it', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_audit_event_immutable on public.audit_event;
create trigger trg_audit_event_immutable
  before update or delete on public.audit_event
  for each row execute function public.fn_audit_is_append_only();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · The events `advance_batch` never wrote.
--
-- THE ACTOR IS DELIBERATELY NULL. A gate opening has no human behind it — that is the entire
-- point of a server-authoritative gate, and recording whoever happened to poll would be a lie
-- about who decided. `actor_role` null plus an action naming the transition is the honest shape.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.advance_batch(p_batch uuid)
returns table (opened int, resting int)
language plpgsql security definer set search_path = public as $$
declare
  n_opened  int := 0;
  n_resting int := 0;
  cand      record;
  fail      record;
  touched   boolean;
begin
  -- 1 · A rest window that has elapsed opens.
  for cand in
    select ba.id, ba.title, ba.scope_label, ba.unblocks_at
    from batch_activity ba
    where ba.master_batch_id = p_batch and ba.state = 'WAITING_TIME'
      and ba.unblocks_at is not null
  loop
    if not exists (
      select 1 from evaluate_gates(cand.id, 'exit') v
      where v.kind = 'DAY0_DURATION' and v.verdict = 'fail'
    ) then
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      values (null, null, 'rest_released', 'batch_activity', cand.id::text,
              jsonb_build_object('unblocks_at', cand.unblocks_at, 'released_at', now()),
              cand.title || ' — ' || cand.scope_label
              || ': rest window elapsed on the server clock');
    end if;
  end loop;

  -- 2 · Anything still shut is re-evaluated against its OWN entry rules.
  for cand in
    select ba.id, ba.is_time_gate, ba.day0_duration_hr, ba.actual_start, ba.unblocks_at,
           ba.title, ba.scope_label
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
      -- Still shut, and it says why in the rule's own words. No event: nothing happened.
      update batch_activity
         set state = 'LOCKED', blocked_reason = fail.reason
       where id = cand.id and (state <> 'LOCKED' or coalesce(blocked_reason,'') <> fail.reason);
      continue;
    end if;

    if cand.is_time_gate then
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

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id,
                               after_state, reason)
      select null, null, 'rest_started', 'batch_activity', cand.id::text,
             jsonb_build_object('unblocks_at', cur.unblocks_at,
                                'day0_duration_hr', cur.day0_duration_hr),
             cur.title || ' — ' || cur.scope_label || ': ' || coalesce(cur.blocked_reason, 'resting')
        from batch_activity cur where cur.id = cand.id;
    else
      update batch_activity set state = 'READY', blocked_reason = null where id = cand.id;
      n_opened := n_opened + 1;

      insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
      values (null, null, 'gate_opened', 'batch_activity', cand.id::text,
              cand.title || ' — ' || cand.scope_label || ': every entry gate is satisfied');
    end if;
  end loop;

  return query select n_opened, n_resting;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Batch creation — why there is NO separate `plan_generated` event.
--
-- The first attempt fired an AFTER INSERT trigger on `master_batch` to record how many activities
-- the Day-0 answers produced. It always recorded zero: `create_master_batch` inserts the batch and
-- THEN calls `generate_activity_plan`, so at insert time the plan does not exist yet.
--
-- Every alternative fought the shape of the code. A statement trigger on `batch_activity` fires
-- once per row, because the generator inserts in a loop. A deferred constraint trigger never
-- fires inside a test transaction that rolls back. Editing `create_master_batch` or
-- `generate_activity_plan` to add one insert means restating two long functions that every proof
-- in the suite exercises — which is exactly how B2 silently regressed 0016's guards.
--
-- So it is not written, and nothing is lost that matters: the `master_batch` INSERT audit row
-- carries the full Day-0 `config` in `after_state`, and the activities it produced are rows. The
-- count is derivable; a second, fragile mechanism to restate it is not worth the risk.

-- 6 · v_batch_event · the chronological view every batch surface reads.
--
-- Resolves an event to its batch whatever it is attached to, names the actor, and places it on
-- the hour axis. `batch_hour` is null when the batch has no H0 yet — TIME_CONTRACT §1.1 makes
-- `start_at` mandatory at Day-0, but batches created before A2 exist and are not rewritten.
-- ─────────────────────────────────────────────────────────────────────────────

-- A join condition's regex guard does not constrain when the planner evaluates the cast beside
-- it, so `entity_id ~ '^[0-9a-f-]{36}$' and id = entity_id::uuid` still raises on a non-uuid key —
-- `factory_clock` audits as entity_id '1'. This is the standard fix: the cast itself returns null
-- rather than raising, so there is nothing left to order wrongly.
create or replace function public.safe_uuid(t text)
returns uuid language plpgsql immutable strict as $$
begin
  return t::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace view public.v_batch_event as
select
  e.id,
  e.occurred_at,
  coalesce(
    ba.master_batch_id,
    d.master_batch_id,
    cd.master_batch_id,
    case when e.entity_table = 'master_batch' then public.safe_uuid(e.entity_id) end
  )                                              as master_batch_id,
  e.action,
  e.entity_table,
  e.entity_id,
  e.reason,
  e.after_state,
  e.actor_id,
  e.actor_role,
  p.display_name                                 as actor_name,
  -- A null actor is not missing data. It means the server decided, which is what a gate is.
  (e.actor_id is null and e.action in ('rest_started','rest_released','gate_opened'))
                                                 as server_decided,
  ba.title                                       as activity_title,
  ba.scope_label,
  case
    when mb.start_at is not null and e.occurred_at >= mb.start_at
      then floor(extract(epoch from (e.occurred_at - mb.start_at)) / 3600)::int + 1
  end                                            as batch_hour
from public.audit_event e
left join public.batch_activity ba
       on e.entity_table = 'batch_activity'
      and ba.id = public.safe_uuid(e.entity_id)
left join public.deviation d
       on e.entity_table = 'deviation'
      and d.id = public.safe_uuid(e.entity_id)
left join public.corrective_action ca
       on e.entity_table = 'corrective_action'
      and ca.id = public.safe_uuid(e.entity_id)
left join public.deviation cd on cd.id = ca.deviation_id
left join public.profiles p on p.id = e.actor_id
left join public.master_batch mb
       on mb.id = coalesce(
            ba.master_batch_id, d.master_batch_id, cd.master_batch_id,
            case when e.entity_table = 'master_batch' then public.safe_uuid(e.entity_id) end);

grant select on public.v_batch_event to authenticated;

comment on view public.v_batch_event is
  'Chronological event stream per batch. `server_decided` distinguishes a gate the server opened '
  'from an action a person took — a null actor on a gate event is the point, not missing data.';
