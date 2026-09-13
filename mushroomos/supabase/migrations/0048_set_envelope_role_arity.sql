-- ─────────────────────────────────────────────────────────────────────────────
-- 0048 · set_process_envelope could never run.
--
-- THE DEFECT
--   0041 wrote its guard as
--
--       perform public.assert_role(array['admin','gm']::app_role[]);
--
--   and the deployed signature is
--
--       assert_role(p_allowed app_role[], p_action text)
--
--   Two parameters, neither defaulted. So every call to `set_process_envelope` failed on its
--   FIRST STATEMENT with `function public.assert_role(app_role[]) does not exist` — the RPC
--   was unusable by anyone, in any role, for any definition.
--
-- WHY NOBODY NOTICED
--   0041 was never applied. It sat drafted in the repository, and `tests/processEnvelope.test.ts`
--   asserted its refusals against a database where the function did not exist, so the suite
--   reported a connection-shaped failure rather than this. Applying 0041 is what made the
--   arity visible — which is the argument for applying a drafted migration rather than
--   reviewing it: a migration that has never run is a hypothesis.
--
-- WHAT THIS PRESERVES
--   Every refusal 0041 wrote, unchanged and in the same order: UNRESOLVED is refused, a missing
--   source is refused, a non-draft definition is refused. Only the guard call is corrected, and
--   the action string it now passes is what the refusal message says to the caller.
--
-- WHAT IT ADDS
--   The check 0045 made possible: an envelope that disagrees with the activities beneath it is
--   refused at the moment it is stated, rather than surviving until somebody tries to publish.
--   Failing at the point of the mistake beats failing three steps later.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_process_envelope(
  p_definition uuid,
  p_hours      int,
  p_confidence public.process_confidence,
  p_source_ref text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  d          process_definition;
  calculated numeric;
begin
  perform public.assert_role(array['admin','gm']::app_role[], 'state a process envelope');

  select * into d from process_definition where id = p_definition;
  if not found then
    raise exception 'No such process definition: %', p_definition;
  end if;

  if d.status <> 'draft' then
    raise exception
      'The standard % v% is % - its envelope is frozen. Publish a new version instead of editing this one.',
      d.code, d.version, d.status
      using errcode = 'check_violation';
  end if;

  if p_confidence = 'UNRESOLVED' then
    raise exception
      'An envelope of %h cannot be stored as UNRESOLVED. If nobody has ruled on the number, do not store the number - leave it null and the day grid stands in.',
      p_hours
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_source_ref), '') = '' then
    raise exception
      'An envelope needs a source. Who stated %h, and where? A number with no provenance is how 552 became the factory standard.',
      p_hours
      using errcode = 'check_violation';
  end if;

  -- 0045. A definition with activities already states its own length; a stated envelope that
  -- contradicts them is caught here, where the person stating it can still see why.
  select calculated_standard_hr into calculated
    from v_process_standard where process_definition_id = p_definition;

  if calculated is not null and calculated <> p_hours then
    raise exception
      'Refusing to record an envelope of %h against % v%: its own activities compute %h. '
      'The standard is what the process does. Correct the activities, or state the number the '
      'process actually produces.',
      p_hours, d.code, d.version, calculated
      using errcode = 'check_violation';
  end if;

  update process_definition
     set envelope_hours       = p_hours,
         envelope_hour_source = 'factory_stated',
         envelope_confidence  = p_confidence,
         source_ref           = p_source_ref
   where id = p_definition;
end;
$fn$;

revoke execute on function public.set_process_envelope(uuid, int, public.process_confidence, text)
  from public, anon;
grant execute on function public.set_process_envelope(uuid, int, public.process_confidence, text)
  to authenticated;
