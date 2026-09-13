-- ─────────────────────────────────────────────────────────────────────────────
-- 0052 · The LAB_2026A checkpoint map value. Nothing else.
--
-- ONE STATEMENT, ON PURPOSE. Postgres refuses to USE a new enum value in the transaction that
-- added it — "unsafe use of new value" — and scripts/db.mjs sends each migration file as a
-- single query, which is a single implicit transaction. So the value is added here and used in
-- 0053. Merging the two files back together fails on a fresh database and passes on one where
-- the value already exists, which is the worst of both.
--
-- LAB_DICTATION and S4B_COLUMNS are untouched. Batches reference them, and a lab result points
-- at the checkpoint it was taken against.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'lab_checkpoint_map' and e.enumlabel = 'LAB_2026A') then
    alter type public.lab_checkpoint_map add value 'LAB_2026A';
  end if;
end $$;
