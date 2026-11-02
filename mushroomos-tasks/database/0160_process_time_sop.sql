-- Factory-wide planned durations, separate from SOP sequence and measured task times.
-- Additive only: does not update or remove SOP, batch, task, photo, or reading rows.
create table public.tk_process_time_standard (
  process_key text primary key,
  title text not null,
  line text not null,
  kind text not null,
  turner_pass text,
  planned_duration_minutes integer check (planned_duration_minutes between 0 and 525600),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  constraint process_time_key_valid check (length(process_key) between 6 and 300),
  constraint process_time_title_valid check (length(trim(title)) between 1 and 200)
);

create table public.tk_process_time_revision (
  id bigint generated always as identity primary key,
  process_key text not null references public.tk_process_time_standard(process_key) on delete restrict,
  before_value jsonb,
  after_value jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id)
);

alter table public.tk_process_time_standard enable row level security;
alter table public.tk_process_time_revision enable row level security;
create policy process_time_standard_read on public.tk_process_time_standard for select to authenticated
  using (public.has_role(variadic array['admin','supervisor','operator','lab_tech','gm','manager']::app_role[]));
create policy process_time_revision_read on public.tk_process_time_revision for select to authenticated
  using (public.has_role(variadic array['admin']::app_role[]));
revoke all on public.tk_process_time_standard, public.tk_process_time_revision from anon, authenticated;
grant select on public.tk_process_time_standard, public.tk_process_time_revision to authenticated;

create function public.tk_process_time_save(p_rows jsonb) returns integer
language plpgsql security definer set search_path=public as $fn$
declare item jsonb; old_value jsonb; new_value jsonb; n integer := 0; mins integer; k text;
begin
  perform public.assert_role(array['admin']::app_role[], 'manage process time standards');
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Send a list of at most 1000 process times.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) is distinct from
     (select count(distinct x->>'process_key') from jsonb_array_elements(p_rows) x) then
    raise exception 'Process time keys must be unique.';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    k := item->>'process_key';
    if length(k) not between 6 and 300 or length(trim(coalesce(item->>'title',''))) not between 1 and 200
       or length(trim(coalesce(item->>'line',''))) not between 1 and 100
       or item->>'kind' not in ('work','rest','cleaning','lab','lab_gate') then
      raise exception 'Invalid process time identity or label.';
    end if;
    if item->>'planned_duration_minutes' is not null then
      if item->>'planned_duration_minutes' !~ '^[0-9]+$' then raise exception 'Duration must be whole minutes.'; end if;
      mins := (item->>'planned_duration_minutes')::integer;
      if mins > 525600 then raise exception 'Duration is too large.'; end if;
    else mins := null;
    end if;
    select to_jsonb(s) into old_value from public.tk_process_time_standard s where s.process_key=k for update;
    insert into public.tk_process_time_standard(process_key,title,line,kind,turner_pass,planned_duration_minutes,updated_by)
    values(k,trim(item->>'title'),trim(item->>'line'),item->>'kind',nullif(trim(coalesce(item->>'turner_pass','')),''),mins,auth.uid())
    on conflict(process_key) do update set title=excluded.title,line=excluded.line,kind=excluded.kind,
      turner_pass=excluded.turner_pass,planned_duration_minutes=excluded.planned_duration_minutes,
      updated_at=now(),updated_by=auth.uid();
    select to_jsonb(s) into new_value from public.tk_process_time_standard s where s.process_key=k;
    if old_value is distinct from new_value then
      insert into public.tk_process_time_revision(process_key,before_value,after_value,recorded_by)
      values(k,old_value,new_value,auth.uid());
    end if;
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function public.tk_process_time_save(jsonb) from public, anon;
grant execute on function public.tk_process_time_save(jsonb) to authenticated;
