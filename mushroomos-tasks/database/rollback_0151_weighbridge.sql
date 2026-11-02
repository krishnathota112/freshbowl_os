-- Rollback for 0151_weighbridge.sql. Deletes all weighment data (slips, requirements, alerts, materials).
drop view if exists public.wb_v_login, public.wb_v_batch, public.wb_v_alert, public.wb_v_slip, public.wb_v_requirement;
drop policy if exists tk_batch_read_weighbridge on public.tk_batch;
drop policy if exists weighments_insert on storage.objects;
drop policy if exists weighments_delete on storage.objects;
drop policy if exists weighments_read on storage.objects;
drop function if exists public.wb_ack_alert(uuid, text), public.wb_void_slip(uuid, text), public.wb_reopen(uuid, text),
  public.wb_finish(uuid, text), public.wb_add_slip(uuid, text, text, text, numeric, numeric, numeric, text),
  public.wb_set_calc_slip(uuid, text), public.wb_requirement_update(uuid, numeric, numeric, text),
  public.wb_requirement_create(uuid, text, numeric, numeric, text), public.wb_material_add(text),
  public.wb_check_over(uuid, uuid), public.wb_req_for_update(uuid), public.wb_fmt(numeric), public.wb_received_kg(uuid),
  public.wb_log(text, text, uuid, jsonb);
drop table if exists public.wb_alert, public.wb_slip, public.wb_requirement, public.wb_material;
-- the two login functions, exactly as they were before 0151:
CREATE OR REPLACE FUNCTION public.admin_create_user(p_email text, p_password text, p_display_name text, p_role app_role, p_shift text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$;
