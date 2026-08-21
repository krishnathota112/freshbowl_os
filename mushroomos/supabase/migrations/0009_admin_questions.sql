-- 0009 · Plain-language questions for the admin.
--
-- "Day 2 · FIB1-REST-1" is engineer language. The admin needs to be asked what she actually
-- knows: how long the material sits before the next thing happens to it.
--
-- This lives on the process definition, not in the UI, for the same reason everything else
-- does: rewording a question must not be a code change.

alter table public.process_activity
  add column if not exists admin_question text,
  add column if not exists day_span_label text;
