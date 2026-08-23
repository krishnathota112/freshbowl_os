-- 0023 · A batch created through the UI gets an H0.  (P0)
--
-- THE DEFECT
--
-- `TIME_CONTRACT §1.1` makes `master_batch.start_at` mandatory, and `validate_batch` reports
-- `H0_NOT_SET` as BLOCKING. But `src/api/batches.ts::createBatch` never passed `p_start_at`, so
-- it defaulted to NULL on every call. **Every batch created through the Admin UI was unactivatable
-- by construction.** Every batch that exists today was made by a script passing the parameter
-- directly. Nobody noticed because nobody has used the screen.
--
-- WHY THE FIX IS HERE AND NOT IN THE CLIENT
--
-- The obvious client fix is `new Date(`${date}T${time}`)`. That composes the instant in the
-- BROWSER's timezone. The factory's is `Asia/Kolkata` (+05:30), so an admin in any other zone —
-- or a CI runner on UTC — would silently create a batch whose H0 is hours out, and every derived
-- timestamp in the whole baseline would inherit the error.
--
-- `factory_h0_instant(date)` already exists (0011) and already does this correctly, reading
-- `factory_clock` for both the hour and the zone. The server owns the clock; the client asks.
--
-- NO OVERRIDE IS OFFERED, deliberately. `Book1.xlsx` shows all three batches starting in the same
-- hour-of-day slot, and no source anywhere describes a batch starting at a non-standard hour. An
-- override would be a field with no factory behind it. If one is ever needed it is a new
-- parameter, not a text box wired to browser-local time.

create or replace function public.create_master_batch(
  p_code       text,
  p_label      text,
  p_start_date date,
  p_config     jsonb,
  p_roles      jsonb,
  p_supervisor text        default null,
  p_weather    text        default null,
  p_start_at   timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_batch uuid;
  def_id    uuid;
  r         jsonb;
  h0        timestamptz;
begin
  select id into def_id from process_definition
   where code = 'PROCESS-2026B' and status = 'published'
   order by version desc limit 1;
  if def_id is null then
    raise exception 'No published process definition found';
  end if;

  -- An explicit H0 wins; otherwise the factory clock decides. `factory_h0_instant` returns NULL
  -- while `factory_clock.timezone` is unset, and a NULL here would recreate the exact defect this
  -- migration exists to fix — so it is refused loudly, naming the one call that fixes it.
  h0 := coalesce(p_start_at, public.factory_h0_instant(p_start_date));
  if h0 is null then
    raise exception
      'Cannot create %: the factory timezone is not set, so H0 cannot be computed. '
      'Run select public.set_factory_timezone(''<IANA zone>'') once.', p_code
      using errcode = 'invalid_parameter_value';
  end if;

  insert into master_batch (code, label, process_definition_id, start_date, start_at, status,
                            supervisor_name, weather_note, config, created_by)
  values (p_code, p_label, def_id, p_start_date, h0, 'draft', p_supervisor, p_weather,
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
$$;

revoke execute on function public.create_master_batch(text,text,date,jsonb,jsonb,text,text,timestamptz)
  from anon;
grant execute on function public.create_master_batch(text,text,date,jsonb,jsonb,text,text,timestamptz)
  to authenticated;
