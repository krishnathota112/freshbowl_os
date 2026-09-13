-- ─────────────────────────────────────────────────────────────────────────────
-- 0044 · The process is chosen, not compiled in.
--
-- THE DEFECT
--   create_master_batch, since 0005 and through every redefinition since:
--
--       select id into def_id from process_definition
--        where code = 'PROCESS-2026B' and status = 'published'
--        order by version desc limit 1;
--
--   A process code, as a string literal, inside the function that starts every batch.
--   CLAUDE.md rule 4 — "the process is data" — with the single most important process
--   fact in the product held in code. PROCESS-2026C could be seeded, published and
--   correct, and every batch created would still be a 552-hour batch.
--
-- WHAT REPLACES IT
--   A catalogue. One row, one pointer, one RPC to move it:
--
--       PROCESS CATALOGUE → PROCESS VERSION → BATCH → H0 → GENERATED BASELINE
--
--   `create_master_batch` gains an explicit definition parameter. Passed, it is used —
--   so a batch can deliberately be created on an older standard. Omitted, the catalogue
--   decides. Neither path contains a process code.
--
-- WHY A POINTER AND NOT "THE NEWEST PUBLISHED ONE"
--   Two definitions are published the moment 2026C lands beside 2026B. "Newest" would
--   then be decided by a version number that means nothing across codes, or by
--   published_at, which would make the standard change because somebody re-ran a seed.
--   A pointer is a decision, it has an owner, and moving it is an audited act.
--
-- AND WHY A PUBLISHED DEFINITION FREEZES
--   ARCH-003 / F-open: a definition an active batch was generated from is still editable,
--   so "the standard" can change under a batch that already ran and the frozen baseline
--   would then be protecting a number nobody stated. Publishing closes it. To change a
--   published standard you publish the next version — which is the whole point of having
--   versions.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The catalogue. ──────────────────────────────────────────────────────

create table if not exists public.process_catalogue (
  id                    int primary key default 1 check (id = 1),
  current_definition_id uuid not null references public.process_definition(id),
  set_by                uuid,
  set_at                timestamptz not null default now(),
  reason                text
);

comment on table public.process_catalogue is
  'One row. Which process version a new batch is planned against when the caller does not '
  'name one. The replacement for a process code compiled into create_master_batch. 0044.';

alter table public.process_catalogue enable row level security;

drop policy if exists process_catalogue_read on public.process_catalogue;
create policy process_catalogue_read on public.process_catalogue for select to authenticated
  using (true);

-- No write policy at all. The pointer moves through set_current_process and nothing else.
revoke insert, update, delete on public.process_catalogue from authenticated, anon;
grant select on public.process_catalogue to authenticated;


-- ── 2 · Publishing, and what publishing costs you. ──────────────────────────

create or replace function public.publish_process_definition(
  p_definition uuid,
  p_reason     text default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  d process_definition;
  n int;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'publish a process definition');

  select * into d from process_definition where id = p_definition;
  if not found then
    raise exception 'No such process definition: %', p_definition;
  end if;

  if d.status = 'published' then
    return;                                   -- idempotent. Publishing twice is not an error.
  end if;

  if d.status = 'archived' then
    raise exception
      '% v% is archived. An archived standard is history — publish a new version rather than '
      'reviving this one.', d.code, d.version
      using errcode = 'check_violation';
  end if;

  select count(*) into n from process_activity where process_definition_id = p_definition;
  if n = 0 then
    raise exception
      'Refusing to publish % v%: it has no activities. A published standard with nothing in it '
      'would generate an empty baseline and freeze it.', d.code, d.version
      using errcode = 'check_violation';
  end if;

  update process_definition
     set status = 'published', published_by = auth.uid(), published_at = now()
   where id = p_definition;
end;
$fn$;

revoke execute on function public.publish_process_definition(uuid, text) from public, anon;
grant execute on function public.publish_process_definition(uuid, text) to authenticated;


-- ── 3 · A published definition is frozen, at the table. ─────────────────────
-- The guard is on the table rather than in the writer, for the reason F1 gave: a guard in
-- the writer protects the one path somebody remembered.

create or replace function public.fn_definition_is_frozen()
returns trigger language plpgsql as $fn$
declare
  st process_status;
  cd text;
  vn int;
begin
  select status, code, version into st, cd, vn
    from public.process_definition
   where id = coalesce(new.process_definition_id, old.process_definition_id);

  if st = 'published' then
    raise exception
      '% v% is published — its activities are frozen. A batch has been, or will be, planned '
      'against exactly these hours. Publish a new version instead of editing this one.', cd, vn
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists trg_definition_is_frozen on public.process_activity;
create trigger trg_definition_is_frozen
  before insert or update or delete on public.process_activity
  for each row execute function public.fn_definition_is_frozen();


-- ── 4 · Moving the pointer. ─────────────────────────────────────────────────

create or replace function public.set_current_process(
  p_definition uuid,
  p_reason     text default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  d process_definition;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'change the current process standard');

  select * into d from process_definition where id = p_definition;
  if not found then
    raise exception 'No such process definition: %', p_definition;
  end if;

  if d.status <> 'published' then
    raise exception
      'Cannot make % v% the current standard while it is %. Publish it first — '
      'select public.publish_process_definition(''%'').', d.code, d.version, d.status, p_definition
      using errcode = 'check_violation';
  end if;

  insert into process_catalogue (id, current_definition_id, set_by, set_at, reason)
  values (1, p_definition, auth.uid(), now(), p_reason)
  on conflict (id) do update set
    current_definition_id = excluded.current_definition_id,
    set_by = excluded.set_by, set_at = excluded.set_at, reason = excluded.reason;
end;
$fn$;

revoke execute on function public.set_current_process(uuid, text) from public, anon;
grant execute on function public.set_current_process(uuid, text) to authenticated;


-- ── 5 · What a new batch is planned against. ────────────────────────────────

create or replace function public.current_process_definition()
returns uuid language sql stable security definer set search_path = public as $fn$
  select current_definition_id from public.process_catalogue where id = 1;
$fn$;

grant execute on function public.current_process_definition() to authenticated;

create or replace view public.v_process_catalogue as
select
  e.process_definition_id,
  e.code,
  e.version,
  e.status,
  e.envelope_hr,
  e.envelope_source,
  e.envelope_confidence,
  e.envelope_is_a_derivation,
  pd.name,
  pd.anchor_day_label,
  pd.published_at,
  (select count(*) from public.process_activity pa
    where pa.process_definition_id = e.process_definition_id) as activity_count,
  (c.current_definition_id = e.process_definition_id)         as is_current
from public.v_process_envelope e
join public.process_definition pd on pd.id = e.process_definition_id
left join public.process_catalogue c on c.id = 1;

grant select on public.v_process_catalogue to authenticated;

comment on view public.v_process_catalogue is
  'Every process version, its envelope and whether it is the current standard. What the '
  'Admin process picker reads. 0044.';


-- ── 6 · create_master_batch, with no process code in it. ────────────────────
-- Dropped and recreated rather than replaced: adding a defaulted parameter would leave the
-- old eight-argument signature in place and every existing eight-argument call would then
-- be ambiguous between the two.

drop function if exists public.create_master_batch(text, text, date, jsonb, jsonb, text, text, timestamptz);

create or replace function public.create_master_batch(
  p_code       text,
  p_label      text,
  p_start_date date,
  p_config     jsonb,
  p_roles      jsonb,      -- [{"role":"PRIMARY_FIBRE","material_code":"...","lead":true}]
  p_supervisor text default null,
  p_weather    text default null,
  p_start_at   timestamptz default null,
  p_process_definition_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  new_batch uuid;
  def       process_definition;
  r         jsonb;
  h0        timestamptz;
begin
  -- WHICH STANDARD. Named by the caller, or the catalogue's. Never a literal.
  select * into def from process_definition
   where id = coalesce(p_process_definition_id, public.current_process_definition());

  if def.id is null then
    raise exception
      'No process definition to plan against. Either name one, or set the current standard: '
      'select public.set_current_process(''<definition id>'').'
      using errcode = 'invalid_parameter_value';
  end if;

  if def.status <> 'published' then
    raise exception
      'Cannot plan % against % v% — it is %. A draft standard can still change, and the '
      'baseline this batch freezes would then describe hours nobody stated.',
      p_code, def.code, def.version, def.status
      using errcode = 'check_violation';
  end if;

  -- An explicit H0 wins; otherwise the factory clock decides. `factory_h0_instant` returns
  -- NULL while `factory_clock.timezone` is unset, and a NULL here would recreate the exact
  -- defect 0030 exists to fix — so it is refused loudly, naming the one call that fixes it.
  h0 := coalesce(p_start_at, public.factory_h0_instant(p_start_date));
  if h0 is null then
    raise exception
      'Cannot create %: the factory timezone is not set, so H0 cannot be computed. '
      'Run select public.set_factory_timezone(''<IANA zone>'') once.', p_code
      using errcode = 'invalid_parameter_value';
  end if;

  insert into master_batch (code, label, process_definition_id, start_date, start_at, status,
                            supervisor_name, weather_note, config, created_by)
  values (p_code, p_label, def.id, p_start_date, h0, 'draft', p_supervisor, p_weather,
          p_config, auth.uid())
  returning id into new_batch;

  for r in select * from jsonb_array_elements(p_roles) loop
    insert into batch_material_role (master_batch_id, role, material_id, is_role_lead)
    select new_batch, (r->>'role')::material_role_code, m.id,
           coalesce((r->>'lead')::boolean, false)
    from material m where m.code = r->>'material_code'
    on conflict do nothing;
  end loop;

  perform generate_activity_plan(new_batch);
  return new_batch;
end;
$fn$;

revoke execute on function public.create_master_batch(text, text, date, jsonb, jsonb, text, text, timestamptz, uuid)
  from public, anon;
grant execute on function public.create_master_batch(text, text, date, jsonb, jsonb, text, text, timestamptz, uuid)
  to authenticated;

comment on function public.create_master_batch(text, text, date, jsonb, jsonb, text, text, timestamptz, uuid) is
  'Create a draft batch and generate its plan. The standard is named by the caller or read '
  'from process_catalogue — there is no process code in this function. 0044.';


-- ── 7 · The plan generator carries the hold flag through. ───────────────────
-- batch_activity.is_hold was added by 0043 and nothing populated it, so every generated
-- activity read as work someone performs.

create or replace function public.fn_inherit_hold()
returns trigger language plpgsql as $fn$
begin
  if new.is_hold is not distinct from false then
    select coalesce(pa.is_hold, false) into new.is_hold
      from public.process_activity pa where pa.id = new.process_activity_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_inherit_hold on public.batch_activity;
create trigger trg_inherit_hold
  before insert on public.batch_activity
  for each row execute function public.fn_inherit_hold();

comment on function public.fn_inherit_hold() is
  'A generated activity inherits is_hold from its template. A trigger rather than a column in '
  'the INSERT, so generate_activity_plan does not have to be rewritten to carry it. 0044.';
