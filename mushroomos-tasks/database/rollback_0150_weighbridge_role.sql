-- Postgres cannot drop a value from an enum. To retire the role: move any weighbridge profiles to another role
-- (update public.profiles set role = 'supervisor' where role = 'weighbridge') and roll back 0151 — nothing else uses it.
select 1;
