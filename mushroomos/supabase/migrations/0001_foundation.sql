-- 0001 · Foundation: extensions, roles, the JWT role claim, audit.
-- docs/STEP_1_2_BUILD_SPEC.md §1.2–§1.5

create extension if not exists pgcrypto;
create extension if not exists btree_gist;   -- Step 3 needs it for the exclusion constraints

-- ─────────────────────────────────────────────────────────────────────────────
-- Roles
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type app_role as enum ('gm','manager','admin','supervisor','operator','lab_tech');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         app_role not null,
  shift        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated using (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- The role is a signed CLAIM, not a value fetched after login.
--
-- The legacy app read the role with a REST call and cached it in localStorage
-- (SOURCE_INVENTORY S8d), which is trivially forged. This hook is the fix.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  user_role text;
begin
  select role::text into user_role
  from public.profiles
  where id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if user_role is not null then
    if claims ? 'app_metadata' then
      claims := jsonb_set(claims, '{app_metadata,app_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{app_metadata}', json_build_object('app_role', user_role)::jsonb);
    end if;
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;

drop policy if exists profiles_read_auth_admin on public.profiles;
create policy profiles_read_auth_admin on public.profiles
  for select to supabase_auth_admin using (true);

-- The only role readers policies and guards use.
create or replace function public.current_app_role()
returns app_role language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'app_role', ''
  )::app_role;
$$;

create or replace function public.has_role(variadic roles app_role[])
returns boolean language sql stable as $$
  select public.current_app_role() = any(roles);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit — insert by trigger only, never updatable, never deletable.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_event (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_role   app_role,
  action       text not null,
  entity_table text not null,
  entity_id    text not null,
  before_state jsonb,
  after_state  jsonb,
  reason       text,
  request_id   text
);
alter table public.audit_event enable row level security;

drop policy if exists audit_read on public.audit_event;
create policy audit_read on public.audit_event
  for select to authenticated
  using (public.has_role('gm','manager','admin','supervisor'));

revoke insert, update, delete on public.audit_event from authenticated, anon;

create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_event(actor_id, actor_role, action, entity_table, entity_id,
                          before_state, after_state)
  values (auth.uid(), public.current_app_role(), tg_op, tg_table_name,
          coalesce(new.id::text, old.id::text),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
