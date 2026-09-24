-- Rollback for 0130_sop_editing_and_batch_amendments.sql
-- Refuses while any batch carries an amendment: an amended batch's re-wired tasks point at rows in its
-- AMEND-<batch> definition, and removing them would orphan real work. Cancel/delete those batches first.
do $rb$
begin
  if exists (select 1 from public.batch_amendment) then
    raise exception 'pre_0130: % batch amendment(s) exist; roll back only after those batches are removed.',
      (select count(*) from public.batch_amendment);
  end if;
  if exists (select 1 from public.process_definition pd
              where pd.code like 'AMEND-%'
                and exists (select 1 from public.process_activity pa join public.batch_activity ba on ba.process_activity_id = pa.id
                             where pa.process_definition_id = pd.id)) then
    raise exception 'pre_0130: an AMEND- definition is still referenced by batch tasks.';
  end if;
end
$rb$;

drop view if exists public.v_batch_amendment;
drop function if exists public.amend_batch_add_activity(uuid, uuid, text, text, numeric, boolean, text, text, text);
drop function if exists public.discard_draft_process(uuid);
drop function if exists public.draft_insert_activity(uuid, text, text, text, numeric, boolean);
drop function if exists public.sop_push_downstream(uuid, text, numeric, numeric);
drop function if exists public.clone_process_definition(uuid, text, text);
drop function if exists public.sop_copy_activity(uuid, uuid, text, boolean, boolean);
delete from public.process_definition where code like 'AMEND-%';
drop table if exists public.batch_amendment;
-- Draft SOP versions created through clone_process_definition are ordinary process_definition rows and are
-- kept; published versions are never removed.
notify pgrst, 'reload schema';
