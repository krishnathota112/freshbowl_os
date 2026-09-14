-- 0089 — mark a draft batch as DEMO / TEST.
--
-- `master_batch` has no UPDATE grant for `authenticated` (writes go through functions), so the
-- DEMO / TEST checkbox on New Batch could not set `is_demo` directly: the batch was created and then
-- the label was refused with "permission denied". This is the smallest writer for that one flag.
--
-- Admin only. Draft only — the label is decided before activation, like the rest of the batch
-- identity. One way: a demo batch is never relabelled as real. Audited.

create or replace function public.mark_batch_demo(p_batch uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b master_batch;
begin
  perform public.assert_role(array['admin']::app_role[], 'mark a batch as DEMO / TEST');

  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch: %', p_batch; end if;

  if b.is_demo then return; end if;
  if b.status <> 'draft' then
    raise exception 'Batch % is %. Only a draft batch can be marked DEMO / TEST', b.code, b.status;
  end if;

  update master_batch set is_demo = true where id = p_batch;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'mark_batch_demo', 'master_batch', p_batch::text,
          jsonb_build_object('is_demo', true), 'Created as a DEMO / TEST batch');
end;
$function$;

revoke all on function public.mark_batch_demo(uuid) from public, anon;
grant execute on function public.mark_batch_demo(uuid) to authenticated;
