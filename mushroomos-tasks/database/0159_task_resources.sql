-- 0159 · Task labour and machine usage. Additive: no existing task, answer, photo or batch is rewritten.
-- Resource corrections append a new revision; the previous entry remains available for audit.

create table public.tk_machine (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('machine', 'heavy_machine')),
  has_odometer boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz,
  updated_by uuid references public.profiles(id)
);
create unique index tk_machine_name_ci on public.tk_machine(lower(name));

create table public.tk_task_resource_revision (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tk_task(id) on delete restrict,
  labour_count integer check (labour_count between 0 and 10000),
  machines jsonb not null default '[]'::jsonb check (jsonb_typeof(machines) = 'array'),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id)
);
create index tk_task_resource_latest on public.tk_task_resource_revision(task_id, id desc);

-- Litres are recorded where physically measured: at refuelling, not imputed to tasks from km.
create table public.tk_machine_refuel (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.tk_machine(id) on delete restrict,
  machine_name text not null,
  litres numeric(12,3) not null check (litres > 0 and litres <= 100000),
  fuel_type text not null check (length(trim(fuel_type)) between 2 and 40),
  event_at timestamptz not null,
  note text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text
);
create index tk_machine_refuel_recent on public.tk_machine_refuel(event_at desc,id);

alter table public.tk_machine enable row level security;
alter table public.tk_task_resource_revision enable row level security;
alter table public.tk_machine_refuel enable row level security;
create policy tk_machine_read on public.tk_machine for select to authenticated using
  (public.has_role(variadic array['supervisor','operator','admin','gm','manager','lab_tech']::app_role[]));
create policy tk_task_resource_read on public.tk_task_resource_revision for select to authenticated using
  (public.has_role(variadic array['supervisor','operator','admin','gm','manager','lab_tech']::app_role[]));
create policy tk_machine_refuel_read on public.tk_machine_refuel for select to authenticated using
  (public.has_role(variadic array['supervisor','operator','admin','gm','manager']::app_role[]));
revoke all on public.tk_machine, public.tk_task_resource_revision, public.tk_machine_refuel from anon, authenticated;
grant select on public.tk_machine, public.tk_task_resource_revision, public.tk_machine_refuel to authenticated;

create function public.tk_machine_save(p_machine uuid, p_name text, p_kind text,
  p_has_odometer boolean, p_active boolean) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare v uuid; old_state jsonb;
begin
  perform public.assert_role(array['admin']::app_role[], 'manage machines');
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(p_name)) > 100 then
    raise exception 'Enter a machine name of 2–100 characters.';
  end if;
  if p_kind not in ('machine','heavy_machine') then raise exception 'Choose Machine or Heavy machine.'; end if;
  if p_machine is null then
    insert into tk_machine(name,kind,has_odometer,active,created_by)
    values(trim(p_name),p_kind,coalesce(p_has_odometer,false),coalesce(p_active,true),auth.uid()) returning id into v;
  else
    select to_jsonb(m) into old_state from tk_machine m where m.id=p_machine for update;
    if old_state is null then raise exception 'No such machine.'; end if;
    update tk_machine set name=trim(p_name),kind=p_kind,has_odometer=coalesce(p_has_odometer,false),
      active=coalesce(p_active,true),updated_at=now(),updated_by=auth.uid()
    where id=p_machine;
    v:=p_machine;
  end if;
  perform public.tk_log('tk_machine_save','tk_machine',v,jsonb_build_object(
    'before',old_state,'after',(select to_jsonb(m) from tk_machine m where m.id=v)));
  return v;
end $fn$;

create function public.tk_refuel_record(p_entry uuid, p_machine uuid, p_litres numeric, p_fuel_type text,
  p_event_at timestamptz, p_note text) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare machine tk_machine; existing tk_machine_refuel; new_id uuid;
begin
  perform public.assert_role(array['supervisor','operator']::app_role[], 'record refuelling');
  if p_entry is null then raise exception 'A unique entry ID is required.'; end if;
  select * into existing from tk_machine_refuel where id=p_entry;
  if found then
    if existing.machine_id is distinct from p_machine or existing.litres is distinct from p_litres
      or existing.fuel_type is distinct from trim(p_fuel_type) or existing.event_at is distinct from p_event_at
      or existing.note is distinct from nullif(trim(coalesce(p_note,'')),'')
      or existing.recorded_by is distinct from auth.uid() then
      raise exception 'That refuelling entry ID was already used for different details. Refresh and review.';
    end if;
    return p_entry;
  end if;
  select * into machine from tk_machine where id=p_machine;
  if not found or not machine.active then raise exception 'Choose an active registered machine.'; end if;
  if p_litres is null or p_litres <= 0 or p_litres > 100000 or scale(p_litres) > 3 then
    raise exception 'Enter the measured litres added (up to three decimals).';
  end if;
  if length(trim(coalesce(p_fuel_type,''))) < 2 or length(trim(p_fuel_type)) > 40 then
    raise exception 'Enter the fuel type.';
  end if;
  if p_event_at is null or p_event_at > now() + interval '1 day' then
    raise exception 'Enter when this refuelling happened.';
  end if;
  if length(coalesce(p_note,'')) > 500 then raise exception 'Note is too long.'; end if;
  insert into tk_machine_refuel(id,machine_id,machine_name,litres,fuel_type,event_at,note,recorded_by)
  values(p_entry,p_machine,machine.name,p_litres,trim(p_fuel_type),p_event_at,
    nullif(trim(coalesce(p_note,'')),''),auth.uid()) on conflict(id) do nothing returning id into new_id;
  if new_id is null then
    select * into existing from tk_machine_refuel where id=p_entry;
    if existing.machine_id is distinct from p_machine or existing.litres is distinct from p_litres
      or existing.fuel_type is distinct from trim(p_fuel_type) or existing.event_at is distinct from p_event_at
      or existing.note is distinct from nullif(trim(coalesce(p_note,'')),'')
      or existing.recorded_by is distinct from auth.uid() then
      raise exception 'That refuelling entry ID was already used for different details. Refresh and review.';
    end if;
    return p_entry;
  end if;
  perform public.tk_log('tk_refuel_record','tk_machine_refuel',new_id,jsonb_build_object(
    'machine_id',p_machine,'litres',p_litres,'unit','L','event_at',p_event_at));
  return new_id;
end $fn$;

create function public.tk_refuel_void(p_refuel uuid, p_reason text) returns void
language plpgsql security definer set search_path=public as $fn$
declare entry tk_machine_refuel;
begin
  perform public.assert_role(array['admin']::app_role[], 'void a refuelling entry');
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Explain the correction (at least 5 characters).'; end if;
  select * into entry from tk_machine_refuel where id=p_refuel for update;
  if not found then raise exception 'No such refuelling entry.'; end if;
  if entry.voided_at is not null then raise exception 'Already voided.'; end if;
  update tk_machine_refuel set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=p_refuel;
  perform public.tk_log('tk_refuel_void','tk_machine_refuel',p_refuel,jsonb_build_object(
    'before',to_jsonb(entry),'reason',trim(p_reason)));
end $fn$;

create function public.tk_resources_record(p_task uuid, p_labour_count integer, p_machines jsonb,
  p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path=public as $fn$
declare t tk_task; item jsonb; machine tk_machine; seen uuid[] := '{}'::uuid[]; meter_allowed boolean;
  machine_id uuid; picture_id uuid; key text; number_value numeric;
  before_state jsonb; normalized jsonb := '[]'::jsonb; saved_id bigint; latest_id bigint;
begin
  perform public.assert_role(array['supervisor','operator']::app_role[], 'record task resources');
  t:=public.tk_task_for_update(p_task);
  if t.kind not in ('work','cleaning') or t.status not in ('running','done','done_before') then
    raise exception 'Resources can be recorded on started work or cleaning tasks only.';
  end if;
  if p_labour_count is not null and (p_labour_count < 0 or p_labour_count > 10000) then
    raise exception 'Labour count must be between 0 and 10000.';
  end if;
  if p_machines is null then p_machines := '[]'::jsonb; end if;
  if jsonb_typeof(p_machines) <> 'array' or jsonb_array_length(p_machines) > 20 then
    raise exception 'Enter at most 20 machines.';
  end if;
  for item in select value from jsonb_array_elements(p_machines) loop
    if jsonb_typeof(item) <> 'object' or coalesce(item->>'machine_id','') = '' then
      raise exception 'Choose a registered machine for every machine row.';
    end if;
    machine_id := (item->>'machine_id')::uuid;
    if machine_id = any(seen) then raise exception 'List each machine only once per task.'; end if;
    seen := array_append(seen,machine_id);
    select * into machine from tk_machine where id=machine_id;
    if not found then raise exception 'The selected machine does not exist.'; end if;
    select machine.has_odometer or exists (
      select 1 from tk_task_resource_revision r, lateral jsonb_array_elements(r.machines) m
      where r.task_id=p_task and m->>'machine_id'=machine_id::text and m->>'has_odometer'='true'
    ) into meter_allowed;
    -- A deactivated machine remains usable in corrections to its existing task record.
    if not machine.active and not exists (
      select 1 from tk_task_resource_revision r,
        lateral jsonb_array_elements(r.machines) m
      where r.task_id=p_task and m->>'machine_id'=machine_id::text
    ) then raise exception 'The selected machine is no longer active.'; end if;
    foreach key in array array['odometer_start_km','odometer_end_km'] loop
      if item ? key and nullif(item->>key,'') is not null then
        if not meter_allowed then raise exception '% has no odometer in the machine list.', machine.name; end if;
        number_value := (item->>key)::numeric;
        if number_value < 0 or number_value > 999999999 or scale(number_value) > 3 then
          raise exception 'Odometer reading must be 0–999999999 km, with at most three decimal places.';
        end if;
      end if;
    end loop;
    if nullif(item->>'odometer_start_km','') is not null and nullif(item->>'odometer_end_km','') is not null
      and (item->>'odometer_end_km')::numeric < (item->>'odometer_start_km')::numeric then
      raise exception 'End odometer must be at least the start reading.';
    end if;
    foreach key in array array['start_photo_id','end_photo_id'] loop
      if nullif(item->>key,'') is not null then
        picture_id := (item->>key)::uuid;
        if not exists (select 1 from tk_photo where id=picture_id and task_id=p_task and kind='other') then
          raise exception 'The odometer photo must belong to this task.';
        end if;
      end if;
    end loop;
    if nullif(item->>'odometer_start_km','') is not null and nullif(item->>'start_photo_id','') is null then
      raise exception 'Take the start odometer photo for %.',machine.name;
    end if;
    if nullif(item->>'odometer_end_km','') is not null and nullif(item->>'end_photo_id','') is null then
      raise exception 'Take the end odometer photo for %.',machine.name;
    end if;
    normalized:=normalized || jsonb_build_array(jsonb_build_object(
      'machine_id',machine_id,'machine_name',machine.name,'machine_kind',machine.kind,
      'has_odometer',meter_allowed,
      'odometer_start_km',nullif(item->>'odometer_start_km','')::numeric,
      'odometer_end_km',nullif(item->>'odometer_end_km','')::numeric,
      'start_photo_id',nullif(item->>'start_photo_id','')::uuid,
      'end_photo_id',nullif(item->>'end_photo_id','')::uuid));
  end loop;
  select to_jsonb(r) into before_state from tk_task_resource_revision r
  where r.task_id=p_task order by r.id desc limit 1;
  latest_id:=nullif(before_state->>'id','')::bigint;
  if latest_id is distinct from p_expected_revision then
    raise exception 'Labour or machine details changed since you opened this task. Refresh and review before saving.';
  end if;
  insert into tk_task_resource_revision(task_id,labour_count,machines,recorded_by)
  values(p_task,p_labour_count,normalized,auth.uid()) returning id into saved_id;
  perform public.tk_log('tk_resources_record','tk_task',p_task,jsonb_build_object(
    'previous_revision',before_state,'new_revision_id',saved_id,
    'labour_count',p_labour_count,'machines',normalized));
  return saved_id;
end $fn$;

create function public.tk_finish_with_resources(p_task uuid, p_answer text, p_note text,
  p_labour_count integer, p_machines jsonb, p_expected_revision bigint) returns timestamptz
language plpgsql security definer set search_path=public as $fn$
declare result_at timestamptz; answer_text text;
begin
  -- The optional resource record and finish are one transaction. A failed photo/role check rolls both back.
  if p_labour_count is not null or p_machines is not null and p_machines <> '[]'::jsonb then
    perform public.tk_resources_record(p_task,p_labour_count,p_machines,p_expected_revision);
  end if;
  answer_text:=p_answer;
  if coalesce(trim(answer_text),'')='' and (select ask from tk_task where id=p_task)='machine' then
    select string_agg(m.name,', ' order by x.ord) into answer_text
    from jsonb_array_elements(coalesce(p_machines,'[]'::jsonb)) with ordinality x(item,ord)
    join tk_machine m on m.id=(x.item->>'machine_id')::uuid;
  end if;
  result_at:=public.tk_finish(p_task,answer_text,p_note);
  return result_at;
end $fn$;

create view public.tk_v_task_resources with (security_invoker=on) as
select r.task_id,r.id as revision_id,r.labour_count,r.recorded_at,r.recorded_by,
  coalesce((select jsonb_agg(x.item || jsonb_build_object(
      'machine_name',coalesce(x.item->>'machine_name',m.name),
      'machine_kind',coalesce(x.item->>'machine_kind',m.kind),
      'has_odometer',coalesce((x.item->>'has_odometer')::boolean,m.has_odometer),
      'distance_km',case when x.item->>'odometer_start_km' is not null and x.item->>'odometer_end_km' is not null
        then (x.item->>'odometer_end_km')::numeric-(x.item->>'odometer_start_km')::numeric else null end)
      order by x.ord)
    from jsonb_array_elements(r.machines) with ordinality x(item,ord)
    join tk_machine m on m.id=(x.item->>'machine_id')::uuid),'[]'::jsonb) as machines
from tk_task_resource_revision r
where r.id=(select max(newest.id) from tk_task_resource_revision newest where newest.task_id=r.task_id);
grant select on public.tk_v_task_resources to authenticated;

create view public.tk_v_machine_refuel with (security_invoker=on) as
select r.id,r.machine_id,r.machine_name,r.litres,'L'::text as unit,r.fuel_type,r.event_at,r.note,
  r.recorded_at,r.recorded_by,p.display_name as recorded_by_name,r.voided_at,r.void_reason
from tk_machine_refuel r left join profiles p on p.id=r.recorded_by;
grant select on public.tk_v_machine_refuel to authenticated;

create view public.tk_v_machine_refuel_totals with (security_invoker=on) as
select m.id as machine_id,m.name as machine_name,
  coalesce(sum(r.litres) filter(where r.voided_at is null),0)::numeric(14,3) as litres_added,
  count(r.id) filter(where r.voided_at is null)::integer as refuels
from tk_machine m left join tk_machine_refuel r on r.machine_id=m.id
where public.has_role(variadic array['supervisor','operator','admin','gm','manager']::app_role[])
group by m.id,m.name;
grant select on public.tk_v_machine_refuel_totals to authenticated;

create or replace function public.tk_batch_progress(p_batch uuid) returns jsonb
language sql stable security invoker set search_path=public as $fn$
  select jsonb_build_object('batch',to_jsonb(b),'generated_at',now(),'rows',coalesce((
    select jsonb_agg(to_jsonb(t) || jsonb_build_object(
      'readings',coalesce((select jsonb_agg(jsonb_build_object('round',r.round,'label',r.label,
        'value',r.value,'unit',r.unit,'entered_at',r.entered_at) order by r.round,r.entered_at,r.id)
        from tk_reading r where r.task_id=t.id),'[]'::jsonb),
      'other_photos',(select count(*) from tk_photo p where p.task_id=t.id and p.kind='other'),
      'resources',(select to_jsonb(x) from tk_v_task_resources x where x.task_id=t.id)
    ) order by t.ord) from tk_v_task_v3 t where t.batch_id=b.id),'[]'::jsonb))
  from tk_v_batch b where b.id=p_batch;
$fn$;

revoke all on function public.tk_machine_save(uuid,text,text,boolean,boolean),
  public.tk_resources_record(uuid,integer,jsonb,bigint),
  public.tk_finish_with_resources(uuid,text,text,integer,jsonb,bigint),
  public.tk_refuel_record(uuid,uuid,numeric,text,timestamptz,text),
  public.tk_refuel_void(uuid,text) from public,anon;
grant execute on function public.tk_machine_save(uuid,text,text,boolean,boolean),
  public.tk_resources_record(uuid,integer,jsonb,bigint),
  public.tk_finish_with_resources(uuid,text,text,integer,jsonb,bigint),
  public.tk_refuel_record(uuid,uuid,numeric,text,timestamptz,text),
  public.tk_refuel_void(uuid,text) to authenticated;
notify pgrst,'reload schema';
