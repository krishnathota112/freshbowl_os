-- 0024 · The contributor list carries its conflict marker.
--
-- `UI_CONTROL_TOWER_SPEC §11.2`: the paragraph "names the conflict when one applies, and says
-- plainly that the system did not judge the value because the sources disagree."
--
-- `v_variance_contributor` (0019) had every fact that rule needs except the marker itself, so the
-- narrative could name the person, the machine and the recorded cause — and then fall silent on the
-- one thing the reader most needs to know: that nobody has decided which spec applies.
--
-- Rendering the paragraph without it would have been worse than not rendering it. A GM reading
-- "the recorded moisture was 71.4%" with no marker concludes the system judged it acceptable. The
-- system did no such thing; two sources give different specs and `MEMORY: never resolve factory
-- conflicts` is the standing rule.
--
-- `tbd_marker` is appended AFTER `rank`. `create or replace view` permits new columns only at the
-- end of the select list, so the existing column order is untouched and every current caller keeps
-- working unchanged.
--
-- ⚠ THIS MIGRATION FORCED A CHANGE TO 0019. Because `scripts/db.mjs` replays every migration on every
-- run, 0019's `create or replace view` would — on the run after this one — be asking Postgres to drop
-- the column added here, which it refuses: `cannot drop columns from view`. The whole run stopped at
-- 0019. So 0019 now does `drop view if exists ... cascade` before its create. Appending a column to a
-- view an earlier migration owns is only safe if that earlier migration drops first.

create or replace view public.v_variance_contributor as
select
  ba.master_batch_id,
  ba.id                        as activity_id,
  ba.code,
  ba.title,
  ba.scope_label,
  ba.stream::text              as stream,
  ba.seq,
  ba.baseline_start_hour,
  ba.variance_minutes,
  ba.planned_start_at,
  ba.planned_end_at,
  ba.actual_start,
  ba.actual_end,
  p.display_name               as person,
  m.code                       as machine,
  -- Recorded, not inferred.
  coalesce(
    (select d.summary from public.deviation d
      where d.batch_activity_id = ba.id
      order by d.raised_at limit 1),
    ba.blocked_reason
  )                            as cause,
  exists (
    select 1 from public.v_deviation_open d
     where d.batch_activity_id = ba.id and d.stands_on_record
  )                            as has_open_deviation,
  -- Worst first, within the batch. `seq` breaks ties so the order is stable between calls.
  row_number() over (
    partition by ba.master_batch_id
    order by ba.variance_minutes desc, ba.seq, ba.instance_no
  )::int                       as rank,
  -- NEW in 0024. The conflict or TBD this activity is carrying, if any. NULL is the common case
  -- and means the sources agree, NOT that nobody checked - `conflict_register` is FK-enforced and
  -- a marker cannot be invented at the point of use.
  ba.tbd_marker                as tbd_marker
from public.batch_activity ba
left join public.profiles p on p.id = ba.assigned_person_id
left join public.machine  m on m.id = ba.assigned_machine_id
where ba.variance_minutes is not null
  and ba.variance_minutes <> 0;

grant select on public.v_variance_contributor to authenticated;

comment on view public.v_variance_contributor is
  'One row per activity whose actual differed from its plan, ranked worst first. `cause` is the '
  'recorded reason - a deviation summary or the gate''s own blocked reason - and NULL means nothing '
  'was recorded, which is itself the finding. `tbd_marker` is the conflict this activity carries, '
  'so the narrative can name it rather than presenting a disputed value as settled.';
