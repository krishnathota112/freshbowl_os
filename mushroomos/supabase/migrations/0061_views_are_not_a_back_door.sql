-- ─────────────────────────────────────────────────────────────────────────────
-- 0061 · A view is not a back door.
--
-- WHAT WAS FOUND, BY CALLING IT
--   0057 swept FUNCTIONS. It never touched VIEWS. Every one of the 37 views in `public` carried
--   `SELECT`, `INSERT`, `UPDATE` and `DELETE` for both `anon` and `authenticated`, and not one of
--   them was declared `security_invoker`. A view without that option runs as its OWNER, so it
--   bypasses RLS on every base table underneath it.
--
--   Measured on the deployed database, as `anon`, with no token:
--
--       select count(*) from v_my_work         -->  320 rows
--       select count(*) from v_actual_history  -->  320 rows
--       select count(*) from v_batch_forecast  -->    4 rows
--       update v_live_batch set label='HACKED' -->  WROTE 4 ROWS
--
--   That last one is `master_batch`, written through a view, by an anonymous caller. Three views
--   are auto-updatable (`v_live_batch`, `v_deviation_open`, `v_lab_checkpoint_map`); the other 34
--   are refused by Postgres for not being auto-updatable, which is luck, not a boundary. A
--   `v_lab_checkpoint_map` delete was stopped only by a foreign key.
--
--   `anon` also holds `SELECT` on 55 base tables. Those are harmless today — RLS is enabled and
--   every read policy names `authenticated`, so `anon` matches none and sees nothing — but an
--   `anon` that has nothing is easier to reason about than an `anon` that has something inert.
--
-- WHY THIS MATTERS MORE THAN IT DID YESTERDAY
--   `VITE_SUPABASE_ANON_KEY` is meant to ship inside the browser bundle. It is a public string.
--   Until this migration it was also a read-everything, write-something credential.
--
-- WHAT THIS DOES
--   1 · Revokes every write privilege on every view from `anon`, `authenticated` and `PUBLIC`.
--       Nothing legitimate writes through a view. Rule 5 of CLAUDE.md: read from views, write
--       through RPCs.
--   2 · Revokes ALL privileges on every view and every base table from `anon` and `PUBLIC`.
--       An anonymous caller now reads nothing and writes nothing anywhere in `public`.
--   3 · Sets `security_invoker = on` for every view, so a view reads with the PERMISSIONS OF THE
--       CALLER and RLS applies to it exactly as it applies to the tables beneath.
--
-- WHAT (3) CHANGES, MEASURED BEFORE APPLYING
--   Five tables in `public` have RLS with no `using (true)` read policy for `authenticated`:
--   `audit_event`, `monthly_schedule_import`, `monthly_schedule_group`, `dev_effective_clock`,
--   `dev_environment_marker`. Exactly ONE view depends on any of them:
--
--       v_batch_event  ->  audit_event
--
--   `audit_read` restricts the audit trail to gm / manager / admin / supervisor. Today an operator
--   reads the whole trail through `v_batch_event`, because the view outranks the policy. After this
--   they read what `audit_read` always said they should. That is the policy finally taking effect,
--   not a regression — and it is the one behavioural change in this migration.
--
--   `dev_effective_clock` and `dev_environment_marker` carry no read policy at all and no view
--   depends on them. The dev clock is reached only through `get_effective_now()`, which is
--   `SECURITY DEFINER` and therefore unaffected (ARCH-008).
--
--   Every other view reads tables whose policy is `using (true)` for `authenticated`. A signed-in
--   user loses nothing.
--
-- WHAT IS DELIBERATELY NOT HERE
--   No policy is added, removed or rewritten. This migration changes who may reach a view, never
--   what a view means.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v record;
  n_views int := 0;
begin
  -- `security_invoker` landed in PostgreSQL 15. Refuse loudly rather than silently leaving the
  -- door open on an older server.
  if current_setting('server_version_num')::int < 150000 then
    raise exception
      'security_invoker requires PostgreSQL 15 or later; this server is %. '
      'Do not apply 0061 here — the read side would stay open with no sign that it had.',
      current_setting('server_version');
  end if;

  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
     order by c.relname
  loop
    -- 1 · Nobody writes through a view. Not anon, not a signed-in user, not PUBLIC.
    execute format(
      'revoke insert, update, delete, truncate, references on public.%I from anon, authenticated, public',
      v.relname);

    -- 3 · The view reads as the caller, so RLS applies to it.
    execute format('alter view public.%I set (security_invoker = on)', v.relname);

    n_views := n_views + 1;
  end loop;

  raise notice '0061 · % views: writes revoked, security_invoker on', n_views;
end $$;

-- 2 · `anon` has no business anywhere in `public`. Views and tables both.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm', 'p')
     order by c.relname
  loop
    execute format('revoke all on public.%I from anon, public', r.relname);
    n := n + 1;
  end loop;
  raise notice '0061 · anon and PUBLIC revoked on % relations', n;
end $$;

-- A signed-in user still reads every view. That is the whole product surface.
do $$
declare
  v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('grant select on public.%I to authenticated', v.relname);
  end loop;
end $$;

-- ── Assertions. A security migration that cannot prove its own end state is a comment. ────────

do $$
declare
  bad int;
  names text;
begin
  -- No write privilege on any view, for anyone but the owner.
  select count(*), string_agg(distinct table_name, ', ')
    into bad, names
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind = 'v'
     and g.grantee in ('anon', 'authenticated', 'PUBLIC')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if bad > 0 then
    raise exception '0061 failed: % write grants remain on views (%)', bad, names;
  end if;

  -- `anon` reaches nothing in `public`.
  select count(*), string_agg(distinct table_name, ', ')
    into bad, names
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where g.grantee in ('anon', 'PUBLIC');
  if bad > 0 then
    raise exception '0061 failed: anon or PUBLIC still holds % grants in public (%)', bad, names;
  end if;

  -- Every view reads as its caller.
  select count(*), string_agg(c.relname, ', ')
    into bad, names
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce(c.reloptions::text, '') not like '%security_invoker=on%';
  if bad > 0 then
    raise exception '0061 failed: % views still run as owner (%)', bad, names;
  end if;

  -- And a signed-in user can still read them all.
  select count(*)
    into bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not has_table_privilege('authenticated', c.oid, 'select');
  if bad > 0 then
    raise exception '0061 failed: % views are unreadable by authenticated', bad;
  end if;

  raise notice '0061 · asserted: no view writes, no anon grants, every view security_invoker';
end $$;

comment on schema public is
  'Views read as the CALLER (security_invoker) and nobody writes through one. anon holds no '
  'privilege here at all: the publishable key ships in the browser and is not a credential. '
  '0057 closed the same door on functions. 0061.';
