-- 0028 · Let Admin take an hour back off an activity.
--
-- `set_activity_plan` merges its patch with `coalesce(nullif(p_patch->>'planned_time',''), ...)`,
-- so an empty string means "leave it alone", not "clear it". That is right for a partial patch and
-- wrong for the one case where the intent is deliberate: Admin typed an hour, thought better of it,
-- and wants the activity back on the process standard.
--
-- A SEPARATE FUNCTION, not a rewrite of `set_activity_plan`. That function carries the frozen-
-- baseline refusal and the reload-into-its-own-bunker check, and rewriting a guarded function to
-- change one line is how those guards get lost — it has happened in this codebase before.

create or replace function public.clear_planned_time(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b master_batch;
begin
  select mb.* into b from master_batch mb
    join batch_activity ba on ba.master_batch_id = mb.id
   where ba.id = p_activity;
  if not found then raise exception 'No such activity'; end if;

  -- The same refusal `set_activity_plan` makes, stated the same way.
  if b.status <> 'draft' then
    raise exception
      'The baseline is frozen - % is %. Change goes through a deviation or an override.',
      b.code, b.status;
  end if;

  update batch_activity set planned_time = null where id = p_activity;
  -- `trg_replan_hours` fires on planned_time and puts the activity back on the standard hour.

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'clear_planned_time', 'batch_activity',
          p_activity::text, 'Returned to the process standard hour');
end;
$$;

revoke all on function public.clear_planned_time(uuid) from public;
grant execute on function public.clear_planned_time(uuid) to authenticated;
