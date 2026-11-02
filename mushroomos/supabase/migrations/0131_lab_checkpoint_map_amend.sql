-- 0131 · A checkpoint map for Lab checks the Admin adds on a batch amendment (used by 0132).
-- Its own file: Postgres cannot use a new enum value in the transaction that adds it (same as 0127).
-- Rollback: none needed — an unused enum label changes nothing (Postgres cannot drop one in place).
alter type public.lab_checkpoint_map add value if not exists 'AMEND';
