-- s13 · PROCESS-2026B is published again, after every seed that writes its activities.
--
-- WHY THIS FILE EXISTS AND WHY IT IS LAST
--   `s03` drops PROCESS-2026B back to draft so that s05, s08, s09 and s10 can write to its
--   activities — 0044 freezes a published definition's activities at the table. This closes the
--   window, and it must run after every one of those files, which is what its number is for.
--
--   A published standard that quietly stayed a draft would be worse than the freeze it was
--   working around: `create_master_batch` refuses to plan against a draft, so every batch
--   creation in the product would fail with a message about a standard nobody had published.
--
-- WHAT IT DOES NOT DO
--   It does not touch the catalogue. PROCESS-2026C is the current standard (s12) and stays so.
--   PROCESS-2026B is published because batches exist that were generated from it and their
--   baselines are frozen against exactly these hours — a definition those batches point at
--   cannot be a draft. Published and not current is the correct state for a superseded standard.
--
-- Idempotent, and a no-op on a database where the window was never opened.

do $$
declare
  d_id uuid;
  n    int;
begin
  select id into d_id from public.process_definition
   where code = 'PROCESS-2026B' and version = 1;

  if d_id is null then
    raise notice 'PROCESS-2026B v1 is not present — nothing to publish.';
    return;
  end if;

  if (select status from public.process_definition where id = d_id) = 'published' then
    return;
  end if;

  select count(*) into n from public.process_activity where process_definition_id = d_id;
  if n = 0 then
    raise exception
      'Refusing to publish PROCESS-2026B v1: s03 left it with no activities. Publishing an '
      'empty standard would let a batch freeze an empty baseline.';
  end if;

  update public.process_definition
     set status = 'published', published_at = coalesce(published_at, now())
   where id = d_id;
end $$;
