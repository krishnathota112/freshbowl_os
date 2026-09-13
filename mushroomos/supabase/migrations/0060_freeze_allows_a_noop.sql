-- ─────────────────────────────────────────────────────────────────────────────
-- 0060 · A published definition refuses a CHANGE, not an UPDATE that changes nothing.
--
-- THE SYMPTOM
--   `tests/eventTrail.test.ts` proves that the audit trigger stays quiet when nothing moved —
--   the seeds re-run `on conflict do update` with identical values on every `db:seed`, and without
--   that guard each run would write ~130 audit rows saying nothing happened. It demonstrates it
--   with the most honest possible no-op:
--
--       update process_activity set label_template = label_template;
--
--   0044's freeze refused it: "PROCESS-2026C v1 is published — its activities are frozen."
--
-- WHY THE REFUSAL WAS WRONG
--   The freeze exists so that the hours a batch was planned against cannot move under it. An
--   UPDATE that sets every column to the value it already holds moves nothing. Refusing it does
--   not protect a single batch, and it makes an unrelated statement across the table impossible —
--   which is how somebody ends up dropping the trigger to run a migration.
--
--   `fn_audit` already draws exactly this line, with `is distinct from`. The freeze now draws the
--   same one, in the same words, so the two agree about what counts as a change.
--
-- WHAT IS UNCHANGED
--   An INSERT or a DELETE on a published definition is still refused outright: adding an activity
--   or removing one changes the standard whatever the other columns say. And an UPDATE that alters
--   any value at all is refused exactly as before.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_definition_is_frozen()
returns trigger language plpgsql as $fn$
declare
  st process_status;
  cd text;
  vn int;
begin
  -- An update that changes nothing is not a change. `is distinct from` on the whole row, which is
  -- the same test `fn_audit` applies before deciding whether anything happened worth recording.
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;

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

comment on function public.fn_definition_is_frozen() is
  'A published definition''s activities cannot change. An UPDATE that sets every column to the '
  'value it already holds is allowed, because it changes nothing — the same line fn_audit draws '
  'before deciding whether anything happened. 0044 / 0060.';
