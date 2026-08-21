-- s07 · The six demo accounts, one per role. docs/DEMO_PLAN.md §5.
--
-- Real Supabase Auth rows. There is NO local fallback credential table — the legacy app
-- shipped four accounts with unsalted sha256 hashes in its own bundle (S8d), and that is
-- precisely what this replaces.

do $$
declare
  r record;
  uid uuid;
begin
  for r in
    select * from (values
      ('gm@freshbowl.demo',         'gm',         'A. Rao — General Manager'),
      ('manager@freshbowl.demo',    'manager',    'S. Iyer — Manager'),
      ('admin@freshbowl.demo',      'admin',      'P. Nair — Admin'),
      ('supervisor@freshbowl.demo', 'supervisor', 'Ramarao — Supervisor'),
      ('operator@freshbowl.demo',   'operator',   'Ravi — Field Operator'),
      ('lab@freshbowl.demo',        'lab_tech',   'K. Menon — Lab Technician')
    ) as t(email, role, display_name)
  loop
    select id into uid from auth.users where email = r.email;

    if uid is null then
      uid := gen_random_uuid();
      -- The token columns MUST be '' and not NULL.
      --
      -- GoTrue scans confirmation_token, recovery_token, email_change and
      -- email_change_token_new into non-nullable Go strings. A NULL there makes every
      -- password grant fail with "Database error querying schema" — which is exactly the
      -- auth.users NULL bug recorded against the legacy project in SOURCE_INVENTORY S8d.
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        r.email, extensions.crypt('mushroom2026', extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
        '', '', '', '', '', '', '', ''
      );

      insert into auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        uid::text, uid,
        json_build_object('sub', uid::text, 'email', r.email, 'email_verified', true)::jsonb,
        'email', now(), now(), now()
      );
    else
      -- Idempotent: reset the password, and repair any NULL token columns (see above).
      update auth.users
         set encrypted_password = extensions.crypt('mushroom2026', extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             confirmation_token = coalesce(confirmation_token, ''),
             recovery_token = coalesce(recovery_token, ''),
             email_change = coalesce(email_change, ''),
             email_change_token_new = coalesce(email_change_token_new, ''),
             email_change_token_current = coalesce(email_change_token_current, ''),
             phone_change = coalesce(phone_change, ''),
             phone_change_token = coalesce(phone_change_token, ''),
             reauthentication_token = coalesce(reauthentication_token, ''),
             updated_at = now()
       where id = uid;
    end if;

    insert into public.profiles (id, display_name, role, is_active)
    values (uid, r.display_name, r.role::app_role, true)
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      is_active = true;
  end loop;
end $$;
