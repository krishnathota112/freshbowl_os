-- ─────────────────────────────────────────────────────────────────────────────
-- 0047 · A hold has nobody to assign, and a template with no role resolves to a role.
--
-- TWO DEFECTS, BOTH FOUND BY GENERATING THE FIRST PROCESS-2026C BATCH.
--
-- ── 1 · validate_batch demands an assignee for material that is resting ─────
--   `NO_ASSIGNEE` is BLOCKING and excludes only `is_time_gate`. PROCESS-2026C carries
--   seventeen holds — six on the main rail, six bunker conditionings, the tunnel phases — and
--   none of them is a time gate in the 2026B sense, because 2026C STATES their durations
--   rather than asking Admin for one at Day 0.
--
--   So the first 2026C batch raised a blocking finding on "Material rest", on "Conditioning
--   hold 1 — bunker 1" and on "Pasteurisation": the factory was being asked which person is
--   performing sixty-three hours of compost sitting in a bunker at temperature.
--
--   The honest answer is nobody, and 0043 put that in the schema as `is_hold`. This teaches
--   the validator to read it. `is_time_gate` stays in the predicate — 2026B's rests are time
--   gates and are excluded for their own reason, which is a different reason.
--
--   THIS IS NOT A WEAKENING. An activity someone performs still blocks activation until it has
--   a person. What changed is that a hold is no longer counted as one.
--
-- ── 2 · '{role_lead}' with no role resolved to the word "Material" ──────────
--   `resolve_activity_label` substitutes the bound material's name for `{role_lead}`, and
--   falls back to the material_role's own name when nothing is bound. With material_role NULL
--   the fallback is `initcap('material')` — so `MIX-CM-ADD` rendered as
--
--       "Add Material mix to conditioned fibre + loader mix + flip 1 + flip 2"
--
--   That is not a missing translation, it is a modelling error in 0043: adding the nitrogen mix
--   genuinely requires the nitrogen source, so the activity belongs to that role. Binding it
--   also means a batch that binds no nitrogen source does not generate the activity — which is
--   correct, and is what `generate_activity_plan` has always done with an unbound role.
--
--   Fixed at the definition, not in the label resolver: the resolver behaved exactly as
--   specified, and softening its fallback would hide the next activity that loses its role.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The validator. ──────────────────────────────────────────────────────
-- Patched against the DEPLOYED body for the reason 0046 gives: validate_batch has been
-- redefined by four migrations and retyping it is how one of those checks goes missing.

do $mig$
declare
  src     text;
  patched text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'validate_batch';

  if src is null then
    raise exception 'validate_batch() is not deployed.';
  end if;

  -- Matched with a regex rather than an exact string. The clause spans two lines and its
  -- indentation is whatever four successive redefinitions left it as, so the whitespace between
  -- the two predicates is the one part that must not be guessed. Anchored on
  -- `assigned_person_id is null`, which appears exactly once in the whole body.
  patched := regexp_replace(
    src,
    '(and\s+not\s+ba\.is_time_gate)(\s+)(and\s+ba\.assigned_person_id\s+is\s+null)',
    '\1\2-- 0047. Material resting in a bunker is not work, and nobody performs it.'
      || '\2and not ba.is_hold\2\3',
    'i');

  if patched = src then
    if src like '%and not ba.is_hold%' then
      raise notice 'validate_batch() already excludes holds from NO_ASSIGNEE.';
      return;
    end if;
    raise exception
      'validate_batch()''s NO_ASSIGNEE clause is not in the form 0047 recognises. The body has '
      'moved — patch it by hand rather than letting this file report success.';
  end if;

  execute patched;
end
$mig$;


-- ── 2 · The activity that adds the nitrogen mix belongs to the nitrogen role. ──
-- A published definition's activities are frozen by 0044's trigger, so the standard goes back
-- to draft for the length of this statement and is published again below. The window is inside
-- this migration and no batch can be created during it.

do $mig$
declare
  d_id uuid;
begin
  select id into d_id from public.process_definition
   where code = 'PROCESS-2026C' and version = 1;
  if d_id is null then
    raise notice 'PROCESS-2026C v1 is not present — nothing to correct.';
    return;
  end if;

  update public.process_definition set status = 'draft' where id = d_id;

  update public.process_activity
     set material_role = 'NITROGEN_SOURCE'::material_role_code
   where process_definition_id = d_id
     and code = 'MIX-CM-ADD'
     and material_role is null;

  update public.process_definition
     set status = 'published', published_at = coalesce(published_at, now())
   where id = d_id;
end
$mig$;

-- Any batch already planned against the old row carries the resolved label in
-- `batch_activity.title`, frozen. Correcting a generated title would be rewriting a plan, which
-- DEC-002 forbids — so drafts are regenerated by their owner and active batches keep the title
-- they were activated with. Stated here so the next reader does not "fix" it.
