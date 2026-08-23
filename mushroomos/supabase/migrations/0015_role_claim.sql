-- 0015 · The role claim was declared in 0001 and never populated.
-- docs/BUILD_SEQUENCE_KIRO.md §A4 (this is what blocked its gate),
-- docs/CONTRACT_AUDIT_2026-08-22.md §6 item 4, docs/ARCHITECTURE_V2.md §3.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT
--
-- `public.current_app_role()` — the ONLY role reader every policy, every guard and every RPC in
-- this system consults — is this:
--
--     select nullif(current_setting('request.jwt.claims', true)::jsonb
--                     -> 'app_metadata' ->> 'app_role', '')::app_role;
--
-- Nothing ever put `app_role` in `app_metadata`. The access token of every one of the six demo
-- accounts carries exactly this:
--
--     "app_metadata": { "provider": "email", "providers": ["email"] }
--
-- So `current_app_role()` returns NULL for every real client session, and has done since 0001.
-- Consequences, all of them live until this file runs:
--
--   · every role check in a SECURITY DEFINER RPC passes NULL into its comparison and refuses;
--   · `has_role(...)` is false for everybody, including the GM;
--   · `audit_event.actor_role` has been written NULL on every row ever recorded;
--   · A4's `can_capture_for_activity` refuses EVERY caller, which is why eight of the seventeen
--     evidence proofs failed with `new row violates row-level security policy` — including the
--     positive controls. A4 could not go green until the claim exists.
--
-- The mechanism was not missing. `public.custom_access_token_hook(jsonb)` was written in 0001,
-- granted to `supabase_auth_admin`, and derives the claim from `profiles.role` — exactly right.
-- It is simply NOT SWITCHED ON, because switching it on is a dashboard action on a hosted
-- project. `src/lib/auth.ts` and `AppShell` already say so on screen.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ WHAT TO CLICK, AND WHY THIS FILE DOES NOT WAIT FOR IT
--
-- In the Supabase dashboard for this project:
--
--   1. Authentication  →  Hooks  (left sidebar, under CONFIGURATION)
--   2. "Customize Access Token (JWT) Claims" → Enable hook
--   3. Hook type: Postgres    Schema: public    Function: custom_access_token_hook
--   4. Save
--
-- That is the whole change; nothing else on the page matters.
--
-- This file does not depend on it. GoTrue copies `auth.users.raw_app_meta_data` into the
-- `app_metadata` claim of every token it mints — that is where `provider` and `providers` above
-- come from. So writing `app_role` into `raw_app_meta_data` produces the identical claim through
-- the identical derivation, from the identical source of truth (`profiles.role`), with no
-- dashboard action.
--
-- The two mechanisms cannot disagree, because both read `profiles.role` and a trigger keeps the
-- materialised copy in step. The hook stays the durable path — CONTRACT_AUDIT §6 item 4 says it
-- must survive, and it does: it is not edited, not dropped and not replaced. Enable it anyway;
-- it recomputes the claim at mint time and so cannot go stale at all.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · profiles.role → auth.users.raw_app_meta_data.app_role
--
-- `profiles.role` remains the single source of truth. This is a derived copy, in the one place
-- GoTrue reads when it signs a token.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_role_claim(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  select role::text into r from public.profiles where id = p_user;
  if r is null then
    -- No profile, no role. A NULL claim is the honest answer and every guard fails closed on it.
    return;
  end if;

  update auth.users u
     set raw_app_meta_data =
           jsonb_set(coalesce(u.raw_app_meta_data, '{}'::jsonb), '{app_role}', to_jsonb(r))
   where u.id = p_user
     and coalesce(u.raw_app_meta_data ->> 'app_role', '') <> r;
end;
$$;

-- Not callable by a client. It would only ever re-derive from `profiles`, so it forges nothing,
-- but a role-claim writer has no business being on the public API surface.
revoke execute on function public.sync_role_claim(uuid) from authenticated, anon, public;

create or replace function public.fn_sync_role_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_role_claim(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_role_claim on public.profiles;
create trigger trg_sync_role_claim
  after insert or update of role on public.profiles
  for each row execute function public.fn_sync_role_claim();

-- Backfill. Every existing account, including any created before this file.
do $$
declare u uuid;
begin
  for u in select id from public.profiles loop
    perform public.sync_role_claim(u);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · The migration asserts its own result.
--
-- A silent no-op here would leave every role check dead and every later proof mysterious. If the
-- claim is not on every profiled account after the backfill, this migration fails.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare missing text;
begin
  select string_agg(u.email, ', ' order by u.email) into missing
    from public.profiles p
    join auth.users u on u.id = p.id
   where coalesce(u.raw_app_meta_data ->> 'app_role', '') <> p.role::text;

  if missing is not null then
    raise exception
      'role claim not materialised for: %. Without it current_app_role() is NULL and every '
      'authorisation check in the system is dead.', missing;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · The escape hatch is removed, as 0004 said it should be.
--
-- 0004 wrote, at these three policies: "The `or current_app_role() is null` clause is the
-- documented escape hatch for a project where the Customize Access Token hook is not yet
-- switched on … once the hook is enabled the clause is dead code and should be removed."
--
-- The claim now exists, so the clause is removed. Note what it was and was not: the same block in
-- 0004 also does `revoke insert, update, delete … from authenticated, anon` on all six batch
-- tables, and a policy cannot grant a privilege that has been revoked. So the hatch was already
-- unreachable and this closes no hole that was open — it removes a clause that reads
-- "if the role is unknown, allow", which is the opposite of what the rest of this step is for.
-- The revoke stays exactly as it is; CONTRACT_AUDIT §6 item 4 keeps it.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists batch_admin_write on public.master_batch;
create policy batch_admin_write on public.master_batch
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists bmr_admin_write on public.batch_material_role;
create policy bmr_admin_write on public.batch_material_role
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists cfg_admin_write on public.batch_process_config;
create policy cfg_admin_write on public.batch_process_config
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
