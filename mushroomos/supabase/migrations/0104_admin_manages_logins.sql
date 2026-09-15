-- ─────────────────────────────────────────────────────────────────────────────
-- 0104 · ADMIN MANAGES LOGINS (user, 15 Sep 2026: "admin is in web, so we need an option in admin for creating
-- ids and passwords for all the persons").
--
-- The project has no deployable server function (no service key in the app, by design), so account management is
-- a set of SECURITY DEFINER functions that only an active Admin can call:
--   admin_list_users()                              every login: name, email, role, shift, active, last sign-in
--   admin_create_user(email, password, name, role, shift)
--   admin_set_password(user, password)               e.g. replacing the published demo passwords
--   admin_set_user_role(user, role)
--   admin_set_user_active(user, active)             deactivating also blocks sign-in (banned_until)
-- Rules: roles supervisor / lab_tech / gm / manager / admin (operator is not offered: it is a supervisor);
-- passwords at least 8 characters and never written to the audit trail; an Admin cannot deactivate or demote
-- themselves, and the last active Admin cannot be removed. Every change is audited.
-- Rollback: drop the five functions.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, display_name text, role app_role, shift text, is_active boolean,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth
as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'see the login list');
  return query
    select p.id, u.email::text, p.display_name, p.role, p.shift, p.is_active, p.created_at, u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     order by p.is_active desc, p.role, p.display_name;
end;
$fn$;

create or replace function public.admin_create_user(p_email text, p_password text, p_display_name text,
                                                    p_role app_role, p_shift text default null)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions
as $fn$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform public.assert_role(array['admin']::app_role[], 'create a login');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'Enter the person''s name.' using errcode = 'check_violation';
  end if;
  if p_role is null or p_role::text not in ('supervisor', 'lab_tech', 'gm', 'manager', 'admin') then
    raise exception 'Choose a role: Supervisor, Lab, GM, Manager or Admin.' using errcode = 'check_violation';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'The password must be at least 8 characters.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'A login with % already exists.', v_email using errcode = 'unique_violation';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '', '', '', '', '', '', '', '',
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'app_role', p_role::text),
          jsonb_build_object('display_name', trim(p_display_name)), now(), now(), false, false);

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now());

  insert into public.profiles (id, display_name, role, shift, is_active)
  values (v_id, trim(p_display_name), p_role, nullif(trim(coalesce(p_shift, '')), ''), true);

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_create_user', 'profiles', v_id::text,
          jsonb_build_object('email', v_email, 'role', p_role, 'display_name', trim(p_display_name), 'shift', p_shift),
          'Login created');
  return v_id;
end;
$fn$;

create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions
as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'set a password');
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'The password must be at least 8 characters.' using errcode = 'check_violation';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  if not found then raise exception 'No such login.'; end if;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'admin_set_password', 'profiles', p_user::text, 'Password changed by Admin');
end;
$fn$;

create or replace function public.admin_set_user_role(p_user uuid, p_role app_role)
returns void
language plpgsql security definer set search_path = public, auth
as $fn$
declare old_role app_role;
begin
  perform public.assert_role(array['admin']::app_role[], 'change a role');
  if p_role is null or p_role::text not in ('supervisor', 'lab_tech', 'gm', 'manager', 'admin') then
    raise exception 'Choose a role: Supervisor, Lab, GM, Manager or Admin.' using errcode = 'check_violation';
  end if;
  select role into old_role from public.profiles where id = p_user for update;
  if not found then raise exception 'No such login.'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own Admin role. Ask another Admin.' using errcode = 'check_violation';
  end if;
  update public.profiles set role = p_role where id = p_user;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('app_role', p_role::text),
                        updated_at = now() where id = p_user;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, before_state, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'admin_set_user_role', 'profiles', p_user::text,
          jsonb_build_object('role', old_role), jsonb_build_object('role', p_role), 'Role changed by Admin');
end;
$fn$;

create or replace function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public, auth
as $fn$
declare r app_role;
begin
  perform public.assert_role(array['admin']::app_role[], 'activate or deactivate a login');
  select role into r from public.profiles where id = p_user for update;
  if not found then raise exception 'No such login.'; end if;
  if not p_active and p_user = auth.uid() then
    raise exception 'You cannot deactivate your own login.' using errcode = 'check_violation';
  end if;
  if not p_active and r = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and is_active and id <> p_user) = 0 then
    raise exception 'This is the last active Admin; it cannot be deactivated.' using errcode = 'check_violation';
  end if;
  update public.profiles set is_active = p_active where id = p_user;
  -- a deactivated login cannot sign in again; its current token already has no role (0102)
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end, updated_at = now()
   where id = p_user;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), case when p_active then 'admin_activate_user' else 'admin_deactivate_user' end,
          'profiles', p_user::text, jsonb_build_object('is_active', p_active),
          case when p_active then 'Login activated' else 'Login deactivated' end);
end;
$fn$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_create_user(text, text, text, app_role, text) from public, anon;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, app_role) from public, anon;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_create_user(text, text, text, app_role, text) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, app_role) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
