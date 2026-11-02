-- Refuse to remove the template once used. Existing batches and evidence are never deleted.
do $guard$ begin
 if exists(select 1 from tk_batch where sop_id='14900000-0000-4000-8000-000000000001') then
   raise exception 'This template is in use; retain it and use a forward fix.';
 end if;
end $guard$;
delete from tk_sop where id='14900000-0000-4000-8000-000000000001';
