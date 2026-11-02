-- 0151 (applied live 27 Sep as "0149_weighbridge") · WEIGHBRIDGE — raw-material weighment (MushroomOS Weighbridge app + Admin "Weighments" tab in Tasks).
-- Owner's rules (27 Sep 2026): Admin sets, per Tasks batch and material, the required weight (tons/kg) with a
-- calculation slip and an allowed difference. Each weighbridge slip (photo + ticket + weights) is subtracted from it:
-- "need 20 t → slip 2 t → 18 t remaining". Past the requirement + tolerance → an "over" alert to Admin at once;
-- marked Finished below it → a "short" alert. Net = gross − tare (or the printed net). No conversion.
-- Weighbridge login (0150) sees only weighments; Admin may also enter slips, and alone may void, reopen and change.
-- Needs 0144 (tk_batch) and 0150 (role) applied first. Rollback: rollback_0151_weighbridge.sql.

-- ── logins: Admin can create / switch a login to the Weighbridge role (live text + one value) ───────────────────
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
  if p_role is null or p_role::text not in ('supervisor', 'lab_tech', 'gm', 'manager', 'admin', 'weighbridge') then
    raise exception 'Choose a role: Supervisor, Lab, GM, Manager, Admin or Weighbridge.' using errcode = 'check_violation';
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
  if p_role is null or p_role::text not in ('supervisor', 'lab_tech', 'gm', 'manager', 'admin', 'weighbridge') then
    raise exception 'Choose a role: Supervisor, Lab, GM, Manager, Admin or Weighbridge.' using errcode = 'check_violation';
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

-- ── materials (Admin can add) ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.wb_material (
  code       text primary key,
  name       text not null,
  active     boolean not null default true,
  sort       int not null default 100,
  created_at timestamptz not null default now()
);
insert into public.wb_material (code, name, sort) values
  ('bagasse', 'Bagasse', 10), ('paddy_local', 'Paddy (Local)', 20), ('paddy_punjab', 'Paddy (Punjab)', 30),
  ('chicken_manure', 'Chicken manure', 40), ('gypsum', 'Gypsum', 50), ('ammonium_sulphate', 'Ammonium sulphate', 60)
on conflict (code) do nothing;

-- ── what a batch needs, per material ────────────────────────────────────────────────────────────────────────────
create table if not exists public.wb_requirement (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.tk_batch(id),
  material_code   text not null references public.wb_material(code),
  required_kg     numeric(14, 3) not null check (required_kg > 0),
  tolerance_kg    numeric(14, 3) not null default 0 check (tolerance_kg >= 0),
  note            text,
  calc_slip_path  text,
  finished_at     timestamptz,
  finished_by     uuid references public.profiles(id),
  finish_note     text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  unique (batch_id, material_code)
);

-- ── every weighment slip (never deleted; a wrong one is voided with a reason) ───────────────────────────────────
create table if not exists public.wb_slip (
  id             uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.wb_requirement(id),
  ticket_no      text not null,
  vehicle_no     text,
  supplier       text,
  gross_kg       numeric(14, 3) check (gross_kg is null or gross_kg > 0),
  tare_kg        numeric(14, 3) check (tare_kg is null or tare_kg >= 0),
  net_kg         numeric(14, 3) not null check (net_kg > 0),
  photo_path     text not null unique,
  recorded_at    timestamptz not null default now(),
  recorded_by    uuid references public.profiles(id),
  voided_at      timestamptz,
  voided_by      uuid references public.profiles(id),
  void_reason    text
);
create unique index if not exists wb_slip_ticket_once on public.wb_slip (lower(trim(ticket_no))) where voided_at is null;
create index if not exists wb_slip_req on public.wb_slip (requirement_id, recorded_at);

-- ── alerts to Admin: over (past the requirement + tolerance) and short (finished below it) ───────────────────────
create table if not exists public.wb_alert (
  id             uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.wb_requirement(id),
  slip_id        uuid references public.wb_slip(id),
  kind           text not null check (kind in ('over', 'short')),
  amount_kg      numeric(14, 3) not null,
  message        text not null,
  raised_at      timestamptz not null default now(),
  ack_at         timestamptz,
  ack_by         uuid references public.profiles(id),
  ack_note       text
);

alter table public.wb_material    enable row level security;
alter table public.wb_requirement enable row level security;
alter table public.wb_slip        enable row level security;
alter table public.wb_alert       enable row level security;
do $$
declare t text;
begin
  foreach t in array array['wb_material', 'wb_requirement', 'wb_slip'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using '
                   '(public.has_role(variadic array[''admin'',''gm'',''manager'',''weighbridge'']::app_role[]))', t);
    execute format('revoke all on public.%1$s from anon, authenticated', t);
    execute format('grant select on public.%1$s to authenticated', t);
  end loop;
end $$;
drop policy if exists wb_alert_read on public.wb_alert;
create policy wb_alert_read on public.wb_alert for select to authenticated
  using (public.has_role(variadic array['admin', 'gm', 'manager']::app_role[]));
revoke all on public.wb_alert from anon, authenticated;
grant select on public.wb_alert to authenticated;

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.wb_log(p_action text, p_table text, p_id uuid, p_after jsonb) returns void
language sql security definer set search_path = public as $fn$
  insert into public.audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), p_action, p_table, p_id::text, p_after, 'weighbridge');
$fn$;
revoke all on function public.wb_log(text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.wb_received_kg(p_req uuid) returns numeric
language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(net_kg), 0) from wb_slip where requirement_id = p_req and voided_at is null
$fn$;

-- "20 t" / "20,000 kg" in one place, for alert messages
create or replace function public.wb_fmt(p_kg numeric) returns text
language sql immutable as $fn$
  select to_char(round(p_kg / 1000, 3), 'FM999999990.000') || ' t (' || to_char(round(p_kg, 0), 'FM999,999,999,990') || ' kg)'
$fn$;

create or replace function public.wb_req_for_update(p_req uuid) returns public.wb_requirement
language plpgsql security definer set search_path = public as $fn$
declare r wb_requirement; st text;
begin
  select * into r from wb_requirement where id = p_req for update;
  if not found then raise exception 'No such requirement.'; end if;
  select status into st from tk_batch where id = r.batch_id;
  if st <> 'active' then raise exception 'This batch is closed.'; end if;
  return r;
end $fn$;
revoke all on function public.wb_req_for_update(uuid) from public, anon, authenticated;

-- Raise an "over" alert if the received total is past the requirement + tolerance.
create or replace function public.wb_check_over(p_req uuid, p_slip uuid) returns boolean
language plpgsql security definer set search_path = public as $fn$
declare r wb_requirement; got numeric; v_over numeric; mname text; bname text;
begin
  select * into r from wb_requirement where id = p_req;
  got := public.wb_received_kg(p_req);
  v_over := got - r.required_kg;
  if v_over > r.tolerance_kg then
    select name into mname from wb_material where code = r.material_code;
    select name into bname from tk_batch where id = r.batch_id;
    insert into wb_alert (requirement_id, slip_id, kind, amount_kg, message)
    values (p_req, p_slip, 'over', v_over,
            bname || ' · ' || mname || ': received ' || public.wb_fmt(got) || ' against ' || public.wb_fmt(r.required_kg)
            || ' — ' || public.wb_fmt(v_over) || ' OVER.');
    return true;
  end if;
  return false;
end $fn$;
revoke all on function public.wb_check_over(uuid, uuid) from public, anon, authenticated;

-- ── Admin: materials and requirements ───────────────────────────────────────────────────────────────────────────
create or replace function public.wb_material_add(p_name text) returns text
language plpgsql security definer set search_path = public as $fn$
declare c text;
begin
  perform public.assert_role(array['admin']::app_role[], 'add a material');
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the material a name.'; end if;
  c := trim(both '_' from lower(regexp_replace(trim(p_name), '[^A-Za-z0-9]+', '_', 'g')));
  if c = '' then raise exception 'Use letters or numbers in the name.'; end if;
  if exists (select 1 from wb_material where code = c) then
    update wb_material set active = true where code = c;
  else
    insert into wb_material (code, name, sort) values (c, trim(p_name), 200);
  end if;
  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'wb_material_add', 'wb_material', c, jsonb_build_object('name', trim(p_name)), 'weighbridge');
  return c;
end $fn$;

create or replace function public.wb_requirement_create(p_batch uuid, p_material text, p_required_kg numeric,
  p_tolerance_kg numeric default 0, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v uuid; st text;
begin
  perform public.assert_role(array['admin']::app_role[], 'set a weighment requirement');
  select status into st from tk_batch where id = p_batch;
  if st is distinct from 'active' then raise exception 'Choose an open batch.'; end if;
  if not exists (select 1 from wb_material where code = p_material and active) then raise exception 'Choose a material.'; end if;
  if coalesce(p_required_kg, 0) <= 0 then raise exception 'Enter the required weight.'; end if;
  if coalesce(p_tolerance_kg, 0) < 0 then raise exception 'The allowed difference cannot be negative.'; end if;
  if exists (select 1 from wb_requirement where batch_id = p_batch and material_code = p_material) then
    raise exception 'This batch already has a requirement for that material — open it and change the weight instead.';
  end if;
  insert into wb_requirement (batch_id, material_code, required_kg, tolerance_kg, note, created_by)
  values (p_batch, p_material, round(p_required_kg, 3), round(coalesce(p_tolerance_kg, 0), 3), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v;
  perform public.wb_log('wb_requirement_create', 'wb_requirement', v,
    jsonb_build_object('batch', p_batch, 'material', p_material, 'required_kg', p_required_kg, 'tolerance_kg', p_tolerance_kg));
  return v;
end $fn$;

create or replace function public.wb_requirement_update(p_req uuid, p_required_kg numeric, p_tolerance_kg numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $fn$
declare r wb_requirement;
begin
  perform public.assert_role(array['admin']::app_role[], 'change a weighment requirement');
  r := public.wb_req_for_update(p_req);
  if coalesce(p_required_kg, 0) <= 0 then raise exception 'Enter the required weight.'; end if;
  if coalesce(p_tolerance_kg, 0) < 0 then raise exception 'The allowed difference cannot be negative.'; end if;
  update wb_requirement set required_kg = round(p_required_kg, 3), tolerance_kg = round(coalesce(p_tolerance_kg, 0), 3),
         note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
   where id = p_req;
  perform public.wb_log('wb_requirement_update', 'wb_requirement', p_req,
    jsonb_build_object('required_kg', p_required_kg, 'tolerance_kg', p_tolerance_kg, 'was_required_kg', r.required_kg, 'was_tolerance_kg', r.tolerance_kg));
  perform public.wb_check_over(p_req, null);
end $fn$;

-- The calculation slip (photo or PDF): uploaded to weighments/<requirement>/calc-..., then attached here.
create or replace function public.wb_set_calc_slip(p_req uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'attach a calculation slip');
  perform public.wb_req_for_update(p_req);
  if split_part(p_path, '/', 1) <> p_req::text then raise exception 'The file is not filed under this requirement.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'weighments' and o.name = p_path and coalesce((o.metadata->>'size')::bigint, 0) > 0) then
    raise exception 'The file did not arrive. Upload it again.';
  end if;
  update wb_requirement set calc_slip_path = p_path where id = p_req;
  perform public.wb_log('wb_set_calc_slip', 'wb_requirement', p_req, jsonb_build_object('path', p_path));
end $fn$;

-- ── the weighbridge: add a slip ─────────────────────────────────────────────────────────────────────────────────
-- Net = gross − tare when both are given; otherwise the net printed on the slip. The photo must already be uploaded
-- to weighments/<requirement>/slip-... Returns what the screen shows next.
create or replace function public.wb_add_slip(p_req uuid, p_ticket text, p_vehicle text, p_supplier text,
  p_gross_kg numeric, p_tare_kg numeric, p_net_kg numeric, p_photo_path text) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r wb_requirement; net numeric; v uuid; got numeric; v_is_over boolean;
begin
  perform public.assert_role(array['weighbridge', 'admin']::app_role[], 'record a weighment slip');
  r := public.wb_req_for_update(p_req);
  if r.finished_at is not null then raise exception 'This material is marked finished. Ask Admin to reopen it.'; end if;
  if coalesce(trim(p_ticket), '') = '' then raise exception 'Enter the ticket number from the slip.'; end if;
  if exists (select 1 from wb_slip where lower(trim(ticket_no)) = lower(trim(p_ticket)) and voided_at is null) then
    raise exception 'Ticket % is already recorded.', trim(p_ticket);
  end if;
  if p_gross_kg is not null and p_tare_kg is not null then
    if p_tare_kg >= p_gross_kg then raise exception 'Tare must be less than gross.'; end if;
    net := p_gross_kg - p_tare_kg;
    if p_net_kg is not null and abs(p_net_kg - net) > 1 then
      raise exception 'Net % kg does not match gross − tare = % kg. Check the slip.', round(p_net_kg), round(net);
    end if;
  else
    net := p_net_kg;
  end if;
  if coalesce(net, 0) <= 0 then raise exception 'Enter the net weight (or gross and tare).'; end if;
  if split_part(p_photo_path, '/', 1) <> p_req::text then raise exception 'The photo is not filed under this requirement.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'weighments' and o.name = p_photo_path and coalesce((o.metadata->>'size')::bigint, 0) > 0) then
    raise exception 'The slip photo did not arrive. Take it again.';
  end if;
  insert into wb_slip (requirement_id, ticket_no, vehicle_no, supplier, gross_kg, tare_kg, net_kg, photo_path, recorded_by)
  values (p_req, trim(p_ticket), nullif(trim(coalesce(p_vehicle, '')), ''), nullif(trim(coalesce(p_supplier, '')), ''),
          round(p_gross_kg, 3), round(p_tare_kg, 3), round(net, 3), p_photo_path, auth.uid())
  returning id into v;
  v_is_over := public.wb_check_over(p_req, v);
  got := public.wb_received_kg(p_req);
  perform public.wb_log('wb_add_slip', 'wb_slip', v, jsonb_build_object('ticket', trim(p_ticket), 'net_kg', net, 'received_kg', got));
  return jsonb_build_object('slip_id', v, 'net_kg', round(net, 3), 'received_kg', got, 'required_kg', r.required_kg,
                            'remaining_kg', r.required_kg - got, 'over', v_is_over);
end $fn$;

-- Finished: no more slips for this material. Below the requirement (beyond tolerance) → a "short" alert.
create or replace function public.wb_finish(p_req uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r wb_requirement; got numeric; v_short numeric; mname text; bname text;
begin
  perform public.assert_role(array['weighbridge', 'admin']::app_role[], 'finish a material');
  r := public.wb_req_for_update(p_req);
  if r.finished_at is not null then raise exception 'Already finished.'; end if;
  got := public.wb_received_kg(p_req);
  update wb_requirement set finished_at = now(), finished_by = auth.uid(), finish_note = nullif(trim(coalesce(p_note, '')), '') where id = p_req;
  v_short := r.required_kg - got;
  if v_short > r.tolerance_kg then
    select name into mname from wb_material where code = r.material_code;
    select name into bname from tk_batch where id = r.batch_id;
    insert into wb_alert (requirement_id, kind, amount_kg, message)
    values (p_req, 'short', v_short, bname || ' · ' || mname || ': finished at ' || public.wb_fmt(got) || ' against '
            || public.wb_fmt(r.required_kg) || ' — ' || public.wb_fmt(v_short) || ' SHORT.');
  end if;
  perform public.wb_log('wb_finish', 'wb_requirement', p_req, jsonb_build_object('received_kg', got, 'required_kg', r.required_kg));
  return jsonb_build_object('received_kg', got, 'required_kg', r.required_kg, 'short', v_short > r.tolerance_kg);
end $fn$;

create or replace function public.wb_reopen(p_req uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'reopen a material');
  perform public.wb_req_for_update(p_req);
  if coalesce(trim(p_reason), '') = '' then raise exception 'Say why it is reopened.'; end if;
  update wb_requirement set finished_at = null, finished_by = null where id = p_req;
  perform public.wb_log('wb_reopen', 'wb_requirement', p_req, jsonb_build_object('reason', trim(p_reason)));
end $fn$;

create or replace function public.wb_void_slip(p_slip uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $fn$
declare s wb_slip;
begin
  perform public.assert_role(array['admin']::app_role[], 'void a weighment slip');
  select * into s from wb_slip where id = p_slip;
  if not found then raise exception 'No such slip.'; end if;
  perform public.wb_req_for_update(s.requirement_id);
  if s.voided_at is not null then raise exception 'Already voided.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Say why this slip is wrong.'; end if;
  update wb_slip set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_slip;
  perform public.wb_log('wb_void_slip', 'wb_slip', p_slip, jsonb_build_object('reason', trim(p_reason), 'net_kg', s.net_kg));
end $fn$;

create or replace function public.wb_ack_alert(p_alert uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'acknowledge a weighment alert');
  update wb_alert set ack_at = now(), ack_by = auth.uid(), ack_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_alert and ack_at is null;
  if not found then raise exception 'No such open alert.'; end if;
  perform public.wb_log('wb_ack_alert', 'wb_alert', p_alert, jsonb_build_object('note', p_note));
end $fn$;

do $$
declare f text;
begin
  foreach f in array array[
    'wb_material_add(text)', 'wb_requirement_create(uuid, text, numeric, numeric, text)', 'wb_requirement_update(uuid, numeric, numeric, text)',
    'wb_set_calc_slip(uuid, text)', 'wb_add_slip(uuid, text, text, text, numeric, numeric, numeric, text)', 'wb_finish(uuid, text)',
    'wb_reopen(uuid, text)', 'wb_void_slip(uuid, text)', 'wb_ack_alert(uuid, text)', 'wb_received_kg(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── storage: slip photos and calculation slips, under weighments/<requirement>/<file> ───────────────────────────
insert into storage.buckets (id, name, public) values ('weighments', 'weighments', false) on conflict (id) do nothing;
drop policy if exists weighments_insert on storage.objects;
create policy weighments_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'weighments'
  and array_length(path_tokens, 1) = 2
  and public.has_role(variadic array['weighbridge', 'admin']::app_role[])
  and exists (select 1 from public.wb_requirement r where r.id::text = path_tokens[1])
);
drop policy if exists weighments_delete on storage.objects;
create policy weighments_delete on storage.objects for delete to authenticated using (
  bucket_id = 'weighments' and owner = auth.uid()
  and not exists (select 1 from public.wb_slip s where s.photo_path = name)
  and not exists (select 1 from public.wb_requirement r where r.calc_slip_path = name)
);
drop policy if exists weighments_read on storage.objects;
create policy weighments_read on storage.objects for select to authenticated using (
  bucket_id = 'weighments' and public.has_role(variadic array['weighbridge', 'admin', 'gm', 'manager']::app_role[])
);

-- ── views ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- This project makes every view security_invoker (a database event trigger), so a view reads with the viewer's own
-- rights. The weighbridge login therefore gets ONE extra read: batch names (tk_batch). It still cannot read tasks,
-- SOPs, photos of tasks, or anything in the main app.
drop policy if exists tk_batch_read_weighbridge on public.tk_batch;
create policy tk_batch_read_weighbridge on public.tk_batch for select to authenticated
  using (public.has_role(variadic array['weighbridge']::app_role[]));

create or replace view public.wb_v_requirement with (security_invoker = on) as
select r.id, r.batch_id, b.name as batch_name, b.status as batch_status, r.material_code, m.name as material_name, m.sort,
       r.required_kg, r.tolerance_kg, r.note, r.calc_slip_path, r.finished_at, r.finish_note, r.created_at,
       g.received_kg, r.required_kg - g.received_kg as remaining_kg, g.slips,
       case when g.received_kg - r.required_kg > r.tolerance_kg then 'over'
            when r.required_kg - g.received_kg <= r.tolerance_kg then 'complete'
            when r.finished_at is not null then 'short'
            else 'receiving' end as state,
       (select count(*) from wb_alert a where a.requirement_id = r.id and a.ack_at is null)::int as open_alerts
  from wb_requirement r
  join tk_batch b on b.id = r.batch_id
  join wb_material m on m.code = r.material_code
  cross join lateral (select coalesce(sum(s.net_kg), 0) as received_kg, count(*)::int as slips
                        from wb_slip s where s.requirement_id = r.id and s.voided_at is null) g
 where public.has_role(variadic array['admin', 'gm', 'manager', 'weighbridge']::app_role[]);

create or replace view public.wb_v_slip with (security_invoker = on) as
select s.*, r.batch_id, b.name as batch_name, r.material_code, m.name as material_name,
       p.display_name as recorded_by_name, pv.display_name as voided_by_name
  from wb_slip s
  join wb_requirement r on r.id = s.requirement_id
  join tk_batch b on b.id = r.batch_id
  join wb_material m on m.code = r.material_code
  left join profiles p on p.id = s.recorded_by
  left join profiles pv on pv.id = s.voided_by
 where public.has_role(variadic array['admin', 'gm', 'manager', 'weighbridge']::app_role[]);

create or replace view public.wb_v_alert with (security_invoker = on) as
select a.*, r.batch_id, b.name as batch_name, m.name as material_name, s.ticket_no, pa.display_name as ack_by_name
  from wb_alert a
  join wb_requirement r on r.id = a.requirement_id
  join tk_batch b on b.id = r.batch_id
  join wb_material m on m.code = r.material_code
  left join wb_slip s on s.id = a.slip_id
  left join profiles pa on pa.id = a.ack_by
 where public.has_role(variadic array['admin', 'gm', 'manager']::app_role[]);

-- Open batches (for the Admin's requirement form and the weighbridge's list).
create or replace view public.wb_v_batch with (security_invoker = on) as
select b.id, b.name, b.h0, b.created_at from tk_batch b
 where b.status = 'active' and public.has_role(variadic array['admin', 'gm', 'manager', 'weighbridge']::app_role[]);

-- Weighbridge logins, for the Admin's list
create or replace view public.wb_v_login with (security_invoker = on) as
select p.id, p.display_name, p.is_active, p.created_at from profiles p
 where p.role::text = 'weighbridge' and public.has_role(variadic array['admin']::app_role[]);

revoke all on public.wb_v_requirement, public.wb_v_slip, public.wb_v_alert, public.wb_v_batch, public.wb_v_login from anon;
grant select on public.wb_v_requirement, public.wb_v_slip, public.wb_v_alert, public.wb_v_batch, public.wb_v_login to authenticated;
notify pgrst, 'reload schema';
