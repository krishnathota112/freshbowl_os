-- 0144 · MUSHROOMOS TASKS — a separate, simple task app (own APK + web page, own tables, same logins).
-- docs/PRD_MUSHROOMOS_TASKS.md. Owner's rules (27 Sep 2026):
--   · The SOP is a table the Admin types and edits like Excel: line, H-hour (reference only), task, type, lab/control,
--     photos, what to ask. No durations, nothing is ever "late".
--   · Editing a published SOP makes a NEW VERSION; a batch picks the version it runs.
--   · A batch copies the SOP rows as its tasks. Inside one LINE a task opens only when the one before it is done;
--     lines run side by side (e.g. Main, Paddy, Cleaning). The Admin types every row, P1..P6 included.
--   · Lab rows can be done any time (before or during). A LAB GATE row blocks the tasks after it in its line until
--     the Lab has submitted and the GM has approved — the same Lab → GM rule as the main app. GM can return it.
--   · Supervisor does work; Lab enters results; GM approves; Admin configures. Times come from the server clock.
-- Nothing here touches the main app's process engine or batches. Rollback: db-rollback/pre_0144__tasks_app.sql.

-- ── tables ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.tk_sop (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null,
  name         text not null,
  version      int not null default 1,
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  note         text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  unique (family_id, version)
);

create table if not exists public.tk_sop_row (
  id             uuid primary key default gen_random_uuid(),
  sop_id         uuid not null references public.tk_sop(id) on delete cascade,
  ord            int not null,
  line           text not null default 'Main',
  h_ref          text,
  title          text not null,
  kind           text not null default 'work' check (kind in ('work', 'rest', 'cleaning', 'lab', 'lab_gate')),
  control        text,
  lab_checkpoint text,
  photos         text not null default 'both' check (photos in ('none', 'before', 'after', 'both')),
  ask            text not null default 'none' check (ask in ('none', 'bunker', 'tunnel', 'machine', 'bunker_tunnel')),
  unique (sop_id, ord)
);

create table if not exists public.tk_batch (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sop_id     uuid not null references public.tk_sop(id),
  h0         timestamptz not null,
  status     text not null default 'active' check (status in ('active', 'closed')),
  note       text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create unique index if not exists tk_batch_active_name on public.tk_batch (lower(name)) where status = 'active';

create table if not exists public.tk_task (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.tk_batch(id) on delete cascade,
  ord            int not null,
  line           text not null,
  h_ref          text,
  title          text not null,
  kind           text not null check (kind in ('work', 'rest', 'cleaning', 'lab', 'lab_gate')),
  control        text,
  lab_checkpoint text,
  photos         text not null default 'both' check (photos in ('none', 'before', 'after', 'both')),
  ask            text not null default 'none' check (ask in ('none', 'bunker', 'tunnel', 'machine', 'bunker_tunnel')),
  status         text not null default 'todo' check (status in ('todo', 'running', 'done', 'done_before', 'submitted', 'returned')),
  started_at     timestamptz,
  started_by     uuid references public.profiles(id),
  start_source   text check (start_source in ('app', 'reported')),
  ended_at       timestamptz,
  ended_by       uuid references public.profiles(id),
  answer         text,
  note           text,
  added_later    boolean not null default false,
  unique (batch_id, ord)
);
create index if not exists tk_task_batch on public.tk_task (batch_id, line, ord);

create table if not exists public.tk_photo (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tk_task(id) on delete cascade,
  kind         text not null check (kind in ('before', 'after', 'lab', 'other')),
  storage_path text not null unique,
  taken_at     timestamptz not null default now(),
  taken_by     uuid references public.profiles(id)
);

-- Lab readings: every submission is a round; nothing is overwritten.
create table if not exists public.tk_reading (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tk_task(id) on delete cascade,
  round      int not null,
  param      text not null,
  label      text not null,
  value      text not null,
  unit       text,
  entered_at timestamptz not null default now(),
  entered_by uuid references public.profiles(id)
);

create table if not exists public.tk_decision (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tk_task(id) on delete cascade,
  round      int not null,
  approved   boolean not null,
  note       text,
  decided_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id)
);

do $$
declare t text;
begin
  foreach t in array array['tk_sop', 'tk_sop_row', 'tk_batch', 'tk_task', 'tk_photo', 'tk_reading', 'tk_decision'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using '
                   '(public.has_role(variadic array[''supervisor'',''operator'',''admin'',''gm'',''manager'',''lab_tech'']::app_role[]))', t);
    execute format('revoke all on public.%1$s from anon, authenticated', t);
    execute format('grant select on public.%1$s to authenticated', t);
  end loop;
end $$;

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tk_log(p_action text, p_table text, p_id uuid, p_after jsonb) returns void
language sql security definer set search_path = public as $fn$
  insert into public.audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), p_action, p_table, p_id::text, p_after, 'tasks app');
$fn$;
revoke all on function public.tk_log(text, text, uuid, jsonb) from public, anon, authenticated;

-- The first task in the same line, before this one, that is not finished yet. Lab (record) rows never hold anything;
-- a lab gate holds until the GM approved it.
create or replace function public.tk_blocker(p_task uuid) returns uuid
language sql stable security definer set search_path = public as $fn$
  select e.id from tk_task t join tk_task e on e.batch_id = t.batch_id and e.line = t.line and e.ord < t.ord
   where t.id = p_task and e.kind <> 'lab' and e.status not in ('done', 'done_before')
   order by e.ord limit 1
$fn$;

create or replace function public.tk_task_for_update(p_task uuid) returns public.tk_task
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; st text;
begin
  select * into t from tk_task where id = p_task for update;
  if not found then raise exception 'No such task.'; end if;
  select status into st from tk_batch where id = t.batch_id;
  if st <> 'active' then raise exception 'This batch is closed.'; end if;
  return t;
end $fn$;
revoke all on function public.tk_task_for_update(uuid) from public, anon, authenticated;

create or replace function public.tk_clean_rows(p_rows jsonb) returns jsonb
language plpgsql immutable as $fn$
declare r jsonb; out jsonb := '[]'::jsonb; i int := 0; k text; ph text; ak text;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Rows must be a list.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(trim(r->>'title'), '') = '' then continue; end if;          -- an empty row is simply dropped
    i := i + 1;
    k := coalesce(nullif(trim(r->>'kind'), ''), 'work');
    ph := coalesce(nullif(trim(r->>'photos'), ''), case when k in ('work', 'cleaning') then 'both' else 'none' end);
    ak := coalesce(nullif(trim(r->>'ask'), ''), 'none');
    if k not in ('work', 'rest', 'cleaning', 'lab', 'lab_gate') then raise exception 'Row %: unknown type "%".', i, k; end if;
    if ph not in ('none', 'before', 'after', 'both') then raise exception 'Row %: photos must be none / before / after / both.', i; end if;
    if ak not in ('none', 'bunker', 'tunnel', 'machine', 'bunker_tunnel') then raise exception 'Row %: unknown "ask" value.', i; end if;
    out := out || jsonb_build_object('ord', i, 'line', coalesce(nullif(trim(r->>'line'), ''), 'Main'),
      'h_ref', nullif(trim(coalesce(r->>'h_ref', '')), ''), 'title', trim(r->>'title'), 'kind', k,
      'control', nullif(trim(coalesce(r->>'control', '')), ''), 'lab_checkpoint', nullif(trim(coalesce(r->>'lab_checkpoint', '')), ''),
      'photos', ph, 'ask', ak);
  end loop;
  return out;
end $fn$;

-- ── SOPs (Admin) ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tk_sop_create(p_name text, p_note text default null, p_rows jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v uuid := gen_random_uuid();
begin
  perform public.assert_role(array['admin']::app_role[], 'create an SOP');
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the SOP a name.'; end if;
  insert into tk_sop (id, family_id, name, version, note, created_by)
  values (v, v, trim(p_name), 1, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  insert into tk_sop_row (sop_id, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask)
  select v, (x->>'ord')::int, x->>'line', x->>'h_ref', x->>'title', x->>'kind', x->>'control', x->>'lab_checkpoint', x->>'photos', x->>'ask'
    from jsonb_array_elements(public.tk_clean_rows(p_rows)) x;
  perform public.tk_log('tk_sop_create', 'tk_sop', v, jsonb_build_object('name', trim(p_name)));
  return v;
end $fn$;

-- Saving the table replaces the draft's rows as a whole — the way a spreadsheet is saved.
create or replace function public.tk_sop_save(p_sop uuid, p_name text, p_note text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $fn$
declare s tk_sop; n int;
begin
  perform public.assert_role(array['admin']::app_role[], 'edit an SOP');
  select * into s from tk_sop where id = p_sop for update;
  if not found then raise exception 'No such SOP.'; end if;
  if s.status <> 'draft' then raise exception 'v% is published and frozen. Make a new version to change it.', s.version; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the SOP a name.'; end if;
  update tk_sop set name = trim(p_name), note = nullif(trim(coalesce(p_note, '')), '') where id = p_sop;
  delete from tk_sop_row where sop_id = p_sop;
  insert into tk_sop_row (sop_id, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask)
  select p_sop, (x->>'ord')::int, x->>'line', x->>'h_ref', x->>'title', x->>'kind', x->>'control', x->>'lab_checkpoint', x->>'photos', x->>'ask'
    from jsonb_array_elements(public.tk_clean_rows(p_rows)) x;
  get diagnostics n = row_count;
  perform public.tk_log('tk_sop_save', 'tk_sop', p_sop, jsonb_build_object('rows', n));
  return n;
end $fn$;

create or replace function public.tk_sop_publish(p_sop uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare s tk_sop;
begin
  perform public.assert_role(array['admin']::app_role[], 'publish an SOP');
  select * into s from tk_sop where id = p_sop for update;
  if not found then raise exception 'No such SOP.'; end if;
  if s.status = 'published' then return; end if;
  if s.status <> 'draft' then raise exception 'This version is %.', s.status; end if;
  if not exists (select 1 from tk_sop_row where sop_id = p_sop) then raise exception 'Add at least one row before publishing.'; end if;
  update tk_sop set status = 'published', published_at = now(), published_by = auth.uid() where id = p_sop;
  perform public.tk_log('tk_sop_publish', 'tk_sop', p_sop, jsonb_build_object('version', s.version));
end $fn$;

-- Any change to a published SOP is a new version (a draft copy); the old version stays usable.
create or replace function public.tk_sop_new_version(p_from uuid) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare s tk_sop; v uuid := gen_random_uuid(); nv int;
begin
  perform public.assert_role(array['admin']::app_role[], 'make a new SOP version');
  select * into s from tk_sop where id = p_from;
  if not found then raise exception 'No such SOP.'; end if;
  if exists (select 1 from tk_sop where family_id = s.family_id and status = 'draft') then
    raise exception 'This SOP already has a draft version. Open it, or publish or delete it first.';
  end if;
  select max(version) + 1 into nv from tk_sop where family_id = s.family_id;
  insert into tk_sop (id, family_id, name, version, note, created_by) values (v, s.family_id, s.name, nv, s.note, auth.uid());
  insert into tk_sop_row (sop_id, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask)
  select v, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask from tk_sop_row where sop_id = p_from;
  perform public.tk_log('tk_sop_new_version', 'tk_sop', v, jsonb_build_object('from_version', s.version, 'version', nv));
  return v;
end $fn$;

create or replace function public.tk_sop_delete_draft(p_sop uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'delete an SOP draft');
  delete from tk_sop where id = p_sop and status = 'draft';
  if not found then raise exception 'Only a draft can be deleted.'; end if;
end $fn$;

-- ── batches (Admin) ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tk_batch_create(p_name text, p_sop uuid, p_h0 timestamptz default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare s tk_sop; b uuid;
begin
  perform public.assert_role(array['admin']::app_role[], 'create a batch');
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the batch a name (e.g. 182,183,184).'; end if;
  select * into s from tk_sop where id = p_sop;
  if not found or s.status <> 'published' then raise exception 'Choose a published SOP version.'; end if;
  if exists (select 1 from tk_batch where status = 'active' and lower(name) = lower(trim(p_name))) then
    raise exception 'A batch named % is already open.', trim(p_name);
  end if;
  if p_h0 is not null and p_h0 > now() + interval '30 days' then raise exception 'H0 is too far in the future.'; end if;
  insert into tk_batch (name, sop_id, h0, note, created_by)
  values (trim(p_name), p_sop, coalesce(p_h0, now()), nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into b;
  insert into tk_task (batch_id, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask)
  select b, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask from tk_sop_row where sop_id = p_sop;
  perform public.tk_log('tk_batch_create', 'tk_batch', b, jsonb_build_object('name', trim(p_name), 'sop', s.name, 'version', s.version));
  return b;
end $fn$;

create or replace function public.tk_batch_close(p_batch uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public.assert_role(array['admin']::app_role[], 'close a batch');
  update tk_batch set status = 'closed', closed_at = now() where id = p_batch and status = 'active';
  if not found then raise exception 'No such open batch.'; end if;
  perform public.tk_log('tk_batch_close', 'tk_batch', p_batch, '{}'::jsonb);
end $fn$;

-- Add a task to a running batch (after a given task, or at the end of its line).
create or replace function public.tk_task_add(p_batch uuid, p_after uuid, p_row jsonb) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare r jsonb; pos int; v uuid; st text; a_ord int; a_line text;
begin
  perform public.assert_role(array['admin']::app_role[], 'add a task');
  select status into st from tk_batch where id = p_batch;
  if st is distinct from 'active' then raise exception 'No such open batch.'; end if;
  if p_after is not null then
    select ord, line into a_ord, a_line from tk_task where id = p_after and batch_id = p_batch;
    if a_ord is null then raise exception 'That task is not on this batch.'; end if;
    pos := a_ord + 1;
  else
    select coalesce(max(ord), 0) + 1 into pos from tk_task where batch_id = p_batch;
  end if;
  -- a task added after another joins that task's line unless a line is given
  r := public.tk_clean_rows(jsonb_build_array(p_row || jsonb_build_object('line', coalesce(nullif(trim(p_row->>'line'), ''), a_line, 'Main')))) -> 0;
  if r is null then raise exception 'Give the task a name.'; end if;
  update tk_task set ord = ord + 100000 where batch_id = p_batch and ord >= pos;
  update tk_task set ord = ord - 100000 + 1 where batch_id = p_batch and ord >= 100000;
  insert into tk_task (batch_id, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask, added_later)
  values (p_batch, pos, r->>'line', r->>'h_ref', r->>'title', r->>'kind', r->>'control', r->>'lab_checkpoint', r->>'photos', r->>'ask', true)
  returning id into v;
  perform public.tk_log('tk_task_add', 'tk_task', v, r);
  return v;
end $fn$;

-- Change a task that has not started: its name, type, notes, photos, question.
create or replace function public.tk_task_edit(p_task uuid, p_row jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; r jsonb;
begin
  perform public.assert_role(array['admin']::app_role[], 'change a task');
  t := public.tk_task_for_update(p_task);
  if t.status <> 'todo' then raise exception 'It has started; what happened stays as it happened.'; end if;
  r := public.tk_clean_rows(jsonb_build_array(p_row || jsonb_build_object('line', coalesce(p_row->>'line', t.line)))) -> 0;
  if r is null then raise exception 'Give the task a name.'; end if;
  update tk_task set line = r->>'line', h_ref = r->>'h_ref', title = r->>'title', kind = r->>'kind', control = r->>'control',
         lab_checkpoint = r->>'lab_checkpoint', photos = r->>'photos', ask = r->>'ask'
   where id = p_task;
  perform public.tk_log('tk_task_edit', 'tk_task', p_task, r);
end $fn$;

create or replace function public.tk_task_remove(p_task uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare t tk_task;
begin
  perform public.assert_role(array['admin']::app_role[], 'remove a task');
  t := public.tk_task_for_update(p_task);
  if t.status <> 'todo' or exists (select 1 from tk_photo where task_id = p_task) or exists (select 1 from tk_reading where task_id = p_task) then
    raise exception 'Something is already recorded on it, so it stays.';
  end if;
  delete from tk_task where id = p_task;
  perform public.tk_log('tk_task_remove', 'tk_task', p_task, jsonb_build_object('title', t.title));
end $fn$;

-- Catch-up for a batch that was already running: this task and every earlier one in its line happened before the app.
create or replace function public.tk_done_before(p_task uuid) returns int
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; n int;
begin
  perform public.assert_role(array['admin']::app_role[], 'mark earlier work');
  t := public.tk_task_for_update(p_task);
  update tk_task set status = 'done_before'
   where batch_id = t.batch_id and line = t.line and ord <= t.ord and status in ('todo', 'returned')
     and not exists (select 1 from tk_photo p where p.task_id = tk_task.id)
     and not exists (select 1 from tk_reading r where r.task_id = tk_task.id);
  get diagnostics n = row_count;
  perform public.tk_log('tk_done_before', 'tk_task', p_task, jsonb_build_object('rows', n));
  return n;
end $fn$;

-- Catch-up: this task has been running since a stated time (Admin only, not in the future).
create or replace function public.tk_running_since(p_task uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $fn$
declare t tk_task;
begin
  perform public.assert_role(array['admin']::app_role[], 'state when work began');
  t := public.tk_task_for_update(p_task);
  if t.kind in ('lab', 'lab_gate') then raise exception 'A Lab row is entered by the Lab.'; end if;
  if t.status <> 'todo' then raise exception 'It is already %.', t.status; end if;
  if p_at is null or p_at > now() then raise exception 'Give a time that has already passed.'; end if;
  if public.tk_blocker(p_task) is not null then raise exception 'Mark the earlier tasks in this line done first.'; end if;
  update tk_task set status = 'running', started_at = p_at, started_by = auth.uid(), start_source = 'reported' where id = p_task;
  perform public.tk_log('tk_running_since', 'tk_task', p_task, jsonb_build_object('at', p_at));
end $fn$;

-- ── the floor (Supervisor) ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public.tk_start(p_task uuid) returns timestamptz
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; b uuid;
begin
  perform public.assert_role(array['supervisor', 'operator']::app_role[], 'start a task');
  t := public.tk_task_for_update(p_task);
  if t.kind in ('lab', 'lab_gate') then raise exception 'This is a Lab row — the Lab enters it.'; end if;
  if t.status = 'running' then return t.started_at; end if;
  if t.status <> 'todo' then raise exception 'It is already %.', t.status; end if;
  b := public.tk_blocker(p_task);
  if b is not null then
    raise exception 'Finish "%" first — it comes before this in the % line.', (select title from tk_task where id = b), t.line;
  end if;
  update tk_task set status = 'running', started_at = now(), started_by = auth.uid(), start_source = 'app' where id = p_task;
  perform public.tk_log('tk_start', 'tk_task', p_task, '{}'::jsonb);
  return now();
end $fn$;

create or replace function public.tk_finish(p_task uuid, p_answer text default null, p_note text default null) returns timestamptz
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; missing text;
begin
  perform public.assert_role(array['supervisor', 'operator']::app_role[], 'finish a task');
  t := public.tk_task_for_update(p_task);
  if t.status <> 'running' then raise exception 'Start it first.'; end if;
  if t.photos in ('before', 'both') and not exists (select 1 from tk_photo where task_id = p_task and kind = 'before') then missing := 'the before photo'; end if;
  if t.photos in ('after', 'both') and not exists (select 1 from tk_photo where task_id = p_task and kind = 'after') then
    missing := coalesce(missing || ' and ', '') || 'the after photo';
  end if;
  if missing is not null then raise exception 'Take % first.', missing; end if;
  if t.ask <> 'none' and coalesce(trim(p_answer), '') = '' then
    raise exception 'Enter the % number.', replace(replace(t.ask, 'bunker_tunnel', 'bunker / tunnel'), '_', ' ');
  end if;
  update tk_task set status = 'done', ended_at = now(), ended_by = auth.uid(),
         answer = nullif(trim(coalesce(p_answer, '')), ''), note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
   where id = p_task;
  perform public.tk_log('tk_finish', 'tk_task', p_task, jsonb_build_object('answer', p_answer));
  return now();
end $fn$;

-- Photos: uploaded to tasks/<batch>/<task>/<file>, then bound here. The object must exist and not be empty.
create or replace function public.tk_add_photo(p_task uuid, p_kind text, p_path text) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; v uuid;
begin
  perform public.assert_role(array['supervisor', 'operator', 'lab_tech']::app_role[], 'add a photo');
  t := public.tk_task_for_update(p_task);
  if p_kind not in ('before', 'after', 'lab', 'other') then raise exception 'Unknown photo kind.'; end if;
  if split_part(p_path, '/', 1) <> t.batch_id::text or split_part(p_path, '/', 2) <> p_task::text then raise exception 'The photo is not filed under this task.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'tasks' and o.name = p_path and coalesce((o.metadata->>'size')::bigint, 0) > 0) then
    raise exception 'The photo did not arrive. Take it again.';
  end if;
  if p_kind in ('before', 'after') and t.status <> 'running' then raise exception 'Start the task before its % photo.', p_kind; end if;
  insert into tk_photo (task_id, kind, storage_path, taken_by) values (p_task, p_kind, p_path, auth.uid()) returning id into v;
  return v;
end $fn$;

create or replace function public.tk_note(p_task uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public.assert_role(array['supervisor', 'operator', 'lab_tech', 'admin', 'gm']::app_role[], 'add a note');
  perform public.tk_task_for_update(p_task);
  update tk_task set note = concat_ws(E'\n', note, to_char(now() at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ' · ' || trim(p_note)) where id = p_task;
end $fn$;

-- ── Lab and GM (the same rule as the main app) ──────────────────────────────────────────────────────────────────
-- p_readings: [{"param":"moisture_pct","label":"Moisture","value":"68.4","unit":"%"}, ...]
create or replace function public.tk_lab_submit(p_task uuid, p_readings jsonb, p_note text default null) returns int
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; rnd int; x jsonb; n int := 0;
begin
  perform public.assert_role(array['lab_tech']::app_role[], 'submit a Lab result');
  t := public.tk_task_for_update(p_task);
  if t.kind not in ('lab', 'lab_gate') then raise exception 'This is not a Lab row.'; end if;
  if t.status not in ('todo', 'returned') and not (t.kind = 'lab' and t.status = 'done') then
    raise exception 'The result is already % — waiting for the GM.', t.status;
  end if;
  select coalesce(max(round), 0) + 1 into rnd from tk_reading where task_id = p_task;
  for x in select * from jsonb_array_elements(coalesce(p_readings, '[]'::jsonb)) loop
    if coalesce(trim(x->>'value'), '') = '' then continue; end if;
    insert into tk_reading (task_id, round, param, label, value, unit, entered_by)
    values (p_task, rnd, coalesce(nullif(x->>'param', ''), lower(regexp_replace(x->>'label', '\W+', '_', 'g'))),
            coalesce(nullif(x->>'label', ''), x->>'param'), trim(x->>'value'), nullif(x->>'unit', ''), auth.uid());
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Enter at least one reading.'; end if;
  update tk_task set status = case when t.kind = 'lab_gate' then 'submitted' else 'done' end,
         started_at = coalesce(started_at, now()), started_by = coalesce(started_by, auth.uid()), start_source = coalesce(start_source, 'app'),
         ended_at = now(), ended_by = auth.uid(),
         note = case when coalesce(trim(p_note), '') = '' then note else concat_ws(E'\n', note, 'Lab: ' || trim(p_note)) end
   where id = p_task;
  perform public.tk_log('tk_lab_submit', 'tk_task', p_task, jsonb_build_object('round', rnd, 'readings', n));
  return rnd;
end $fn$;

create or replace function public.tk_gm_decide(p_task uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $fn$
declare t tk_task; rnd int;
begin
  perform public.assert_role(array['gm']::app_role[], 'approve a Lab gate');
  t := public.tk_task_for_update(p_task);
  if t.kind <> 'lab_gate' then raise exception 'Only a Lab gate is approved.'; end if;
  if t.status <> 'submitted' then raise exception 'There is no submitted result to decide.'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'Say why it is returned, so the Lab knows what to redo.'; end if;
  select max(round) into rnd from tk_reading where task_id = p_task;
  insert into tk_decision (task_id, round, approved, note, decided_by) values (p_task, rnd, p_approve, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  update tk_task set status = case when p_approve then 'done' else 'returned' end where id = p_task;
  perform public.tk_log(case when p_approve then 'tk_gm_approve' else 'tk_gm_return' end, 'tk_task', p_task, jsonb_build_object('round', rnd, 'note', p_note));
end $fn$;

do $$
declare f text;
begin
  foreach f in array array[
    'tk_sop_create(text, text, jsonb)', 'tk_sop_save(uuid, text, text, jsonb)', 'tk_sop_publish(uuid)', 'tk_sop_new_version(uuid)',
    'tk_sop_delete_draft(uuid)', 'tk_batch_create(text, uuid, timestamptz, text)', 'tk_batch_close(uuid)', 'tk_task_add(uuid, uuid, jsonb)',
    'tk_task_edit(uuid, jsonb)', 'tk_task_remove(uuid)', 'tk_done_before(uuid)', 'tk_running_since(uuid, timestamptz)', 'tk_start(uuid)',
    'tk_finish(uuid, text, text)', 'tk_add_photo(uuid, text, text)', 'tk_note(uuid, text)', 'tk_lab_submit(uuid, jsonb, text)',
    'tk_gm_decide(uuid, boolean, text)', 'tk_blocker(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── photos bucket ───────────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('tasks', 'tasks', false) on conflict (id) do nothing;
drop policy if exists tasks_insert on storage.objects;
create policy tasks_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'tasks'
  and array_length(path_tokens, 1) = 3
  and public.has_role(variadic array['supervisor', 'operator', 'lab_tech']::app_role[])
  and exists (select 1 from public.tk_task t where t.id::text = path_tokens[2] and t.batch_id::text = path_tokens[1])
);
drop policy if exists tasks_delete on storage.objects;
create policy tasks_delete on storage.objects for delete to authenticated using (
  bucket_id = 'tasks' and owner = auth.uid()
  and not exists (select 1 from public.tk_photo p where p.storage_path = name)
);
drop policy if exists tasks_read on storage.objects;
create policy tasks_read on storage.objects for select to authenticated using (
  bucket_id = 'tasks'
  and public.has_role(variadic array['supervisor', 'operator', 'admin', 'gm', 'manager', 'lab_tech']::app_role[])
);

-- ── views the app reads ─────────────────────────────────────────────────────────────────────────────────────────
create or replace view public.tk_v_sop with (security_invoker = on) as
select s.*, (select count(*) from tk_sop_row r where r.sop_id = s.id)::int as row_count,
       (select count(*) from tk_batch b where b.sop_id = s.id)::int as batch_count,
       (s.version = (select max(x.version) from tk_sop x where x.family_id = s.family_id and x.status = 'published')) as is_latest_published
  from tk_sop s;

create or replace view public.tk_v_task with (security_invoker = on) as
select t.*, b.name as batch_name, b.status as batch_status, b.h0,
       s.name as sop_name, s.version as sop_version,
       bl.id as blocked_by_id, bl.title as blocked_by,
       (t.kind in ('work', 'rest', 'cleaning') and t.status = 'todo' and bl.id is null) as can_start,
       (t.kind in ('lab', 'lab_gate') and (t.status in ('todo', 'returned') or (t.kind = 'lab' and t.status = 'done'))) as lab_can_enter,
       (select count(*) from tk_photo p where p.task_id = t.id and p.kind = 'before')::int as before_photos,
       (select count(*) from tk_photo p where p.task_id = t.id and p.kind = 'after')::int as after_photos,
       ps.display_name as started_by_name, pe.display_name as ended_by_name,
       (select d.approved from tk_decision d where d.task_id = t.id order by d.decided_at desc limit 1) as last_decision,
       (select d.note from tk_decision d where d.task_id = t.id order by d.decided_at desc limit 1) as last_decision_note
  from tk_task t
  join tk_batch b on b.id = t.batch_id
  join tk_sop s on s.id = b.sop_id
  left join lateral (select e.id, e.title from tk_task e
                      where e.batch_id = t.batch_id and e.line = t.line and e.ord < t.ord
                        and e.kind <> 'lab' and e.status not in ('done', 'done_before')
                      order by e.ord limit 1) bl on true
  left join profiles ps on ps.id = t.started_by
  left join profiles pe on pe.id = t.ended_by;

create or replace view public.tk_v_batch with (security_invoker = on) as
select b.*, s.name as sop_name, s.version as sop_version,
       (select count(*) from tk_task t where t.batch_id = b.id)::int as tasks,
       (select count(*) from tk_task t where t.batch_id = b.id and t.status in ('done', 'done_before'))::int as done,
       (select count(*) from tk_task t where t.batch_id = b.id and t.status = 'running')::int as running,
       (select count(*) from tk_task t where t.batch_id = b.id and t.status = 'submitted')::int as awaiting_gm,
       (select array_agg(distinct t.line) from tk_task t where t.batch_id = b.id) as lines
  from tk_batch b join tk_sop s on s.id = b.sop_id;

-- The Lab register, for the checkpoint picker and the Lab form: same checkpoints and parameters as the main app.
create or replace view public.tk_v_checkpoint as
select c.code, c.name, c.kind, c.stage,
       coalesce((select jsonb_agg(jsonb_build_object('param', p.code, 'label', p.label, 'unit', p.unit, 'kind', p.value_kind, 'choices', p.choices)
                                  order by array_position(c.parameters, p.code))
                   from lab_parameter p where p.code = any(c.parameters)), '[]'::jsonb) as params
  from lab_checkpoint c
 where c.checkpoint_map = 'LAB_2026A';

grant select on public.tk_v_sop, public.tk_v_task, public.tk_v_batch, public.tk_v_checkpoint to authenticated;
