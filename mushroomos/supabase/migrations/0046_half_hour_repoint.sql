-- ─────────────────────────────────────────────────────────────────────────────
-- 0046 · Placing a plan on the axis must not round it to the nearest hour.
--
-- THE DEFECT, AND HOW IT ANNOUNCED ITSELF
--   `repoint_batch_activities` and `repoint_one_activity` turn a batch hour into an instant:
--
--       mb.start_at + make_interval(hours => pa.standard_start_hour)
--
--   `make_interval(hours => ...)` takes an INTEGER. While the hour axis was `int` that was
--   invisible. 0042 widened it to numeric so PROCESS-2026C's Turner could hold H175.5, and the
--   very first batch generated against that standard failed with
--
--       function make_interval(hours => numeric) does not exist
--
--   which is the good outcome. The bad outcome was already latent: had the argument been
--   implicitly cast rather than refused, every half-hour pile-pass would have been placed on
--   the hour below it, silently, and frozen there at activation. Sixteen of the Turner's
--   twenty-four passes, each up to thirty minutes wrong, in a plan that by design can never be
--   corrected.
--
-- THE FIX
--   Seconds, which is what the ADMIN-PLANNED branch of the same two functions has always used:
--
--       make_interval(secs => (pa.standard_start_hour * 3600)::int)
--
--   0027 wrote the admin path that way and left the standard path on hours, so the two branches
--   of one function disagreed about whether a fractional hour was expressible. They now agree.
--
-- WHY THE SUBSTITUTION IS DONE AGAINST THE DEPLOYED BODY
--   These two functions have been redefined by 0011, 0027 and 0034, and 0034's guard is the one
--   that stopped `repoint_batch_activities` rewriting a frozen baseline (F1). Retyping a body
--   from a migration file is how that guard gets dropped by a hand that was only fixing an
--   interval. So the deployed definition is read, the one call form is replaced in it, and the
--   result is asserted to differ before it is applied. Nothing else in either body can move.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  fn      text;
  src     text;
  patched text;
begin
  foreach fn in array array['repoint_batch_activities', 'repoint_one_activity'] loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;

    if src is null then
      raise exception '%() is not deployed. 0046 patches an existing body; it does not create one.', fn;
    end if;

    patched := replace(
      src,
      'make_interval(hours => pa.standard_start_hour)',
      'make_interval(secs => (pa.standard_start_hour * 3600)::int)');
    patched := replace(
      patched,
      'make_interval(hours => pa.standard_end_hour)',
      'make_interval(secs => (pa.standard_end_hour * 3600)::int)');

    if patched = src then
      -- Already patched, or the body no longer contains the call this migration is about.
      -- Either way, applying it again would be a no-op — but silently doing nothing is how a
      -- migration comes to be believed to have run.
      if src ilike '%make_interval(hours =>%' then
        raise exception
          '%() still uses make_interval(hours => ...) but not in a form 0046 recognises. '
          'The body has moved. Patch it by hand rather than letting this file report success.', fn;
      end if;
      raise notice '%() already places hours in seconds — nothing to patch.', fn;
      continue;
    end if;

    execute patched;
    raise notice '%() patched: standard hours now placed to the second.', fn;
  end loop;

  -- The claim, checked rather than asserted.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('repoint_batch_activities', 'repoint_one_activity')
       and pg_get_functiondef(p.oid) ilike '%make_interval(hours =>%')
  then
    raise exception
      'A repoint function still rounds a batch hour to a whole hour. Half-hour plan positions '
      'would be truncated and then frozen.';
  end if;
end
$mig$;
