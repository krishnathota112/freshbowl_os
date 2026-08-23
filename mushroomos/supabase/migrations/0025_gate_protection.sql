-- 0025 · Gate protection is DERIVED, so a seed cannot switch it off.
-- docs/ROLE_AND_APPROVAL_MODEL.md §3.2, docs/BUILD_SEQUENCE_KIRO.md §B2.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT, AND IT WAS LIVE
--
-- `0017` set `gate_rule.is_protected = true` on the two gates §3.2 names, with a one-off UPDATE.
-- `s04_gates_evidence.sql` opens with
--
--     delete from public.gate_rule where process_activity_id in (...)
--
-- and rebuilds every rule from scratch — deliberately, so the seed is idempotent. But
-- `scripts/db.mjs` runs ALL MIGRATIONS AND THEN ALL SEEDS, so `0017`'s update happens BEFORE the
-- rows it updated are deleted and recreated with `is_protected` back at its `false` default.
--
-- **Every full seed run silently disarmed both protected gates.** Measured on the deployed database
-- before this migration: `select count(*) from gate_rule where is_protected` returned **0**. A
-- supervisor could `accept_with_deviation` on the tunnel fill-height gate, which is the single thing
-- §3.2 exists to forbid. `tests/deviations.test.ts` caught it; it had been passing only when a
-- migrations-only run happened to be the last thing to touch the table.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY A TRIGGER AND NOT ANOTHER UPDATE
--
-- Another UPDATE in a migration fixes it until the next seed run, i.e. not at all. Putting the
-- update at the end of the last seed fixes it until somebody adds a later seed file. Both make
-- correctness depend on file ordering.
--
-- Protection is a PROPERTY OF THE GATE — `0017` says so in as many words: "protection is a property
-- of the gate, not of whether it fires today". A property of the row belongs in a trigger that
-- derives it on every write, which is the same shape `0007` already uses to copy `responsible_role`
-- and `lab_parameters` onto a generated `batch_activity`.
--
-- The consequence worth stating plainly: `is_protected` is now SERVER-OWNED. No insert and no update
-- can set it to anything other than what the predicate says, so it cannot be turned off by a seed, a
-- migration, a client, or a hand-written UPDATE. Rule 6.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT §3.2 ASKS FOR THAT IS STILL NOT MARKED — carried forward from `0017` VERBATIM, because a
-- reader of this file must not conclude these two are the whole of §3.2:
--
--   ❌ ammonia above its ceiling      Ammonia appears in S1c but nowhere in the lab workbook —
--                                     "Is it measured? With what?" (TBD-14). Cannot be marked
--                                     without inventing the gate.
--   ❌ critical severity at a checkpoint  No severity model exists on `gate_rule` or on the
--                                     checkpoint. See TBD-51.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · The predicate. ONE definition, lifted from `0017` unchanged.
--
-- Kept as an inspectable function rather than inlined in the trigger so a test can assert WHICH
-- gates it selects, and so the answer to "why is this gate protected?" is readable SQL.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.gate_rule_is_protected(
  p_activity_code text,
  p_kind          text,
  p_config        jsonb
) returns boolean language sql immutable as $$
  select
    (p_activity_code = 'TN-HOLD' and p_kind = 'SENSOR_THRESHOLD'
     and p_config->>'parameter' = 'pasteurisation_temp_c')
    or
    (p_activity_code = 'TN-LOAD' and p_kind = 'FIELD_IN_RANGE'
     and p_config->>'field_key' = 'fill_height_m');
$$;

comment on function public.gate_rule_is_protected(text, text, jsonb) is
  'ROLE_AND_APPROVAL_MODEL §3.2 - which gates a supervisor may NOT accept-with-deviation on. Two of '
  '§3.2''s four categories are unmarkable today: ammonia has no gate (TBD-14) and no severity model '
  'exists (TBD-51). Both absences are stated in 0025''s header rather than silently narrowed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Derive it on every write.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_gate_rule_protection()
returns trigger language plpgsql security definer set search_path = public as $$
declare code text;
begin
  select pa.code into code from process_activity pa where pa.id = new.process_activity_id;
  -- Unconditional. The caller's value is not consulted, because a caller that could pass `false`
  -- here is exactly how the flag went missing in the first place.
  new.is_protected := public.gate_rule_is_protected(code, new.kind::text, new.config);
  return new;
end;
$$;

drop trigger if exists trg_gate_rule_protection on public.gate_rule;
create trigger trg_gate_rule_protection
  before insert or update on public.gate_rule
  for each row execute function public.fn_gate_rule_protection();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Repair the rows that are already there.
--
-- `where is_protected is distinct from ...` so a replay of this migration writes nothing once the
-- table is correct — otherwise every run would fire the trigger on every gate rule and, through
-- `0018`'s audit triggers, write an audit row per gate saying nothing changed.
-- ─────────────────────────────────────────────────────────────────────────────
update public.gate_rule g
   set is_protected = public.gate_rule_is_protected(pa.code, g.kind::text, g.config)
  from public.process_activity pa
 where pa.id = g.process_activity_id
   and g.is_protected
       is distinct from public.gate_rule_is_protected(pa.code, g.kind::text, g.config);
