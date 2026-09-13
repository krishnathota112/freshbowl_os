-- ─────────────────────────────────────────────────────────────────────────────
-- 0057 · An unauthenticated caller may execute nothing.
--
-- WHAT WAS FOUND, BY CALLING IT
--   Fifty-eight `SECURITY DEFINER` functions carried `EXECUTE` for `anon`. Probed over HTTP with
--   nothing but the publishable key — no sign-in, no token, no role:
--
--       advance_batch          200  [{"opened":0,"resting":0}]
--       repair_plan_states     200  [{"drafts_closed":0,"clocks_cleared":0}]
--       release_elapsed_rests  200  0
--       start_activity         204
--       current_process_definition  200  "8892d71b-…"
--
--   Those are not refusals. They ran. They returned zero because the probe passed a batch id that
--   does not exist — with a real one, an anonymous caller starts activities, opens rests and walks
--   the state machine of a live batch.
--
-- WHY RLS DID NOT SAVE IT
--   RLS worked perfectly: `select` on `master_batch` as anon returns `[]`. And it was irrelevant,
--   because **`SECURITY DEFINER` runs as the owner and bypasses RLS by design.** The grant is the
--   whole boundary for these functions, and the grant said yes to everybody.
--
--   This is F1 again in a different costume. `repoint_batch_activities` was found granted to
--   `anon` and `PUBLIC`, was fixed in place, and the CLASS of defect was never swept. Fifty-eight
--   more of them were sitting behind the same door.
--
-- WHAT THIS DOES
--   Revokes `EXECUTE` from `anon` and `PUBLIC` on **every** function in `public`, then grants it
--   back to `authenticated` for exactly the set that had it before. A signed-in user loses nothing.
--   An anonymous one loses everything, which is the point.
--
--   Swept programmatically rather than listed, because a list is what let fifty-eight accumulate:
--   the next migration to add a function is covered by re-running this, and a test asserts the
--   invariant rather than the roll-call.
--
-- WHAT IT IS NOT
--   Not a role model. Whether a LAB TECHNICIAN may call `activate_batch` is a different question
--   and 0058 answers it. This one only says that somebody who has not signed in may call nothing.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  f        record;
  n_revoke int := 0;
  n_grant  int := 0;
begin
  for f in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('authenticated', p.oid, 'execute') as authed
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       -- Extension-owned functions (pgcrypto, btree_gist) are left exactly as their extension
       -- installed them. Re-granting somebody else's function is how an upgrade starts failing.
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function public.%I(%s) from anon, public',
                   f.proname, f.args);
    n_revoke := n_revoke + 1;

    -- Whatever `authenticated` could call before, it can still call. This migration changes who
    -- may call, not what.
    if f.authed then
      execute format('grant execute on function public.%I(%s) to authenticated',
                     f.proname, f.args);
      n_grant := n_grant + 1;
    end if;
  end loop;

  raise notice 'execute revoked from anon/public on % functions; % re-granted to authenticated.',
    n_revoke, n_grant;
end
$mig$;


-- ── The invariant, checked here and asserted again in the suite. ───────────
-- A migration that swept once and let the next function through would be the same defect with a
-- date on it.

do $$
declare leftovers int;
begin
  select count(*) into leftovers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('anon', p.oid, 'execute');

  if leftovers > 0 then
    raise exception
      '% function(s) in public are still executable by anon. SECURITY DEFINER bypasses RLS, so the '
      'grant is the whole boundary.', leftovers;
  end if;
end $$;
