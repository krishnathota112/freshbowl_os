-- ─────────────────────────────────────────────────────────────────────────────
-- 0035 · Role resolution: JWT claim first, profiles second.  (F3)
--
-- THE SYMPTOM
--   "Auth doesn't work." Sign-in succeeds and then every guarded call fails.
--
-- THE CAUSE
--   `current_app_role()` read the JWT claim and nothing else:
--
--       request.jwt.claims -> app_metadata ->> app_role
--
--   That claim exists only if the Custom Access Token hook is switched on in the
--   Supabase dashboard (Auth -> Hooks). It is console state, not schema state, so
--   no migration could ever guarantee it. With the hook off the claim is absent,
--   `current_app_role()` returns NULL, and every `assert_role`, every `has_role`
--   and every write policy in the database refuses.
--
-- THE FIX
--   Keep the claim as the fast path — it costs nothing and it is what should be
--   used in production. Fall back to `profiles.role` for the signed-in user when
--   the claim is missing. Accounts made by hand in the dashboard then work with
--   no console configuration at all.
--
-- WHY THIS IS NOT A PRIVILEGE ESCALATION
--   The fallback reads a table the user cannot write. Probed on the deployed
--   database, 2026-08-29:
--
--     profiles policies      profiles_read_self   SELECT  (id = auth.uid())
--                            profiles_read_roster SELECT  (is_active)
--                            profiles_read_auth_admin SELECT to supabase_auth_admin
--
--   Three policies, all SELECT. `authenticated` and `anon` hold the INSERT,
--   UPDATE and DELETE grants that Supabase gives every table in `public`, but RLS
--   is enabled and deny-by-default, so with no write policy the write is refused.
--   A user can read their role. Nobody but the service role can set it.
--
--   Section 3 restates that as a table-level refusal rather than leaving it as an
--   absence, because "there is no policy" is a fact that a future migration can
--   undo by accident, and this one is load-bearing.
--
--   The function stays INVOKER-rights on purpose. Making it SECURITY DEFINER
--   would let it read rows the caller cannot, which is exactly the widening this
--   fix must not perform. Under invoker rights `profiles_read_self` is what
--   permits the lookup, so the function can only ever resolve the caller's own
--   role.
--
--   No policy on `profiles` calls `current_app_role()` — checked, so the subquery
--   cannot recurse.
-- ─────────────────────────────────────────────────────────────────────────────


create or replace function public.current_app_role()
returns app_role language sql stable as $fn$
  select coalesce(
    -- FAST PATH. The signed claim, written by custom_access_token_hook from
    -- profiles.role at token-issue time. Never client-settable: app_metadata is
    -- server-controlled in Supabase.
    nullif(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
        -> 'app_metadata' ->> 'app_role',
      ''
    )::app_role,

    -- FALLBACK. The same value, read live, for when the hook is not enabled.
    -- `is_active` is required here: a deactivated member of staff has no role.
    -- Readable only under `profiles_read_self`, so only ever the caller's own.
    (select p.role from public.profiles p where p.id = auth.uid() and p.is_active)
  );
$fn$;

comment on function public.current_app_role() is
  'The role of the calling user. JWT app_metadata.app_role first, profiles.role second. The '
  'fallback exists so hand-made accounts work without the Custom Access Token hook enabled; it '
  'cannot escalate because profiles has no write policy. 0035 / F3.';


-- ── 2 · Say out loud that the roster is read-only. ───────────────────────────
-- Postgres treats a missing policy as a refusal, so these change no behaviour
-- today. They exist so that the refusal is a written decision rather than an
-- omission, and so that anyone adding a policy here has to delete a line whose
-- comment tells them what they are doing.

drop policy if exists profiles_no_self_write on public.profiles;
create policy profiles_no_self_write on public.profiles
  for update to authenticated, anon
  using (false) with check (false);

drop policy if exists profiles_no_self_insert on public.profiles;
create policy profiles_no_self_insert on public.profiles
  for insert to authenticated, anon
  with check (false);

drop policy if exists profiles_no_self_delete on public.profiles;
create policy profiles_no_self_delete on public.profiles
  for delete to authenticated, anon
  using (false);

comment on table public.profiles is
  'The staff roster and the fallback source of truth for a role. Read-only to every client role: '
  'a role is granted by the service role or by SQL, never by the user who holds it. 0035 / F3.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · assert_role must FAIL CLOSED.  (F6, found while proving F3 case 3)
--
-- `has_role` was:
--
--     select public.current_app_role() = any(roles);
--
-- For a caller with no role that is NULL = any(...) -> NULL, not false. And
-- `assert_role` was:
--
--     if not public.has_role(variadic p_allowed) then raise ... end if;
--
-- `not NULL` is NULL, the branch is not taken, and the function returns
-- normally. So `assert_role` RAISED NOTHING for any caller without a role, and
-- every RPC guarded by it — hold_activity, release_activity, return_activity,
-- accept_with_deviation, escalate_deviation, gm_decide_override,
-- add_corrective_action, verify_corrective_action, accept_lab_result — was open
-- to a caller whose token carried no app_role.
--
-- Which, with the Custom Access Token hook disabled, was EVERY caller. The two
-- halves of the security model failed in opposite directions: RLS policies read
-- `has_role` in a USING clause, where NULL is treated as false and the row is
-- denied, so RLS failed closed and was visibly "broken"; the RPC guards failed
-- open and looked like they were working.
--
-- `coalesce(..., false)` changes nothing for RLS — NULL and false already deny
-- there — and turns every guard from open to closed. Proved by case 3 and case 5
-- of tests/roleResolution.test.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.has_role(variadic roles app_role[])
returns boolean language sql stable as $fn$
  select coalesce(public.current_app_role() = any(roles), false);
$fn$;

comment on function public.has_role(app_role[]) is
  'True only when the caller HAS one of these roles. Never NULL: a three-valued answer made '
  'assert_role a no-op for callers with no role at all. 0035 / F6.';
