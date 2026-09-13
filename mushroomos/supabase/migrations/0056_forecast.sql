-- ─────────────────────────────────────────────────────────────────────────────
-- 0056 · FORECAST — the fifth number, and the only one that is not a fact.
--
-- FOUR NUMBERS ALREADY EXIST AND ARE CORRECT (0036, v_activity_expectation):
--
--     planned_end_at        what the frozen baseline said
--     approved_extension_hr what was authorised, as a separate figure
--     authorised_end_at     planned + approved
--     actual_end            what happened
--
--   and `original_variance_minutes` beside them, which is the one that must never be hidden by an
--   approval. An extension is a THIRD NUMBER, NEVER AN EDIT. Nothing here touches any of that.
--
-- WHAT IS MISSING IS THE FIFTH: where is this heading?
--
--     PLAN 09:00 → 12:00
--     ACTUAL 11:00 → 14:00
--     VARIANCE +2h
--     EXTENSION +2h approved
--     FORECAST 14:00
--
--   Management needs all five, side by side, never collapsed.
--
-- ── WHAT A FORECAST IS ALLOWED TO BE HERE ───────────────────────────────────
--   Derived from RECORDED VARIANCE and nothing else. There is no optimiser, no solver and no
--   re-planner in this product, and §9 of the brief says there must not be one. So the forecast is
--   arithmetic on facts already in the table, and every row states WHICH arithmetic produced it:
--
--     finished          the work is done. The projection IS the actual. Not a forecast at all.
--     running           it started; project its own planned duration from its real start.
--     projected         not started; project the batch's current slip onto its planned end.
--     unknown           H0, the plan or the slip is not known. NULL, and it says so.
--
--   `forecast_basis` is not decoration. A projection read as a measurement is how a screen comes
--   to promise a delivery date the factory never committed to, and the difference between
--   "it ended at 14:00" and "we think it will end at 14:00" is the whole of the product's claim.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
--   · It does not write anything. Not one column, not one row. A forecast that persisted would be
--     a second plan, and DEC-002 allows exactly one.
--   · It does not re-sequence, re-assign or re-time anything.
--   · It does not add the approved extension into the projection. An authorised overrun is still
--     an overrun; folding it in would make a late batch read as on time, which is the exact
--     failure CLAUDE.md opens by forbidding.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The batch's current slip, measured on work that has actually finished. ──
-- The worst completed variance in the batch. Not an average — an average of a rail whose slow step
-- has already happened would forecast a recovery nobody has any reason to expect.

create or replace view public.v_batch_slip as
select
  mb.id                                   as master_batch_id,
  mb.code,
  mb.status::text                         as status,
  mb.start_at                             as h0,
  pd.code                                 as process_code,
  e.standard_hr,
  -- The batch's own planned end: H0 plus the standard of the version it was generated from.
  -- Never a constant, and never the day grid — see 0045.
  case when mb.start_at is null or e.standard_hr is null then null
       else mb.start_at + make_interval(secs => (e.standard_hr * 3600)::int)
  end                                     as planned_end_at,

  count(*) filter (where ba.actual_end is not null)              as finished_count,
  count(*) filter (where ba.actual_start is not null
                     and ba.actual_end is null)                  as running_count,
  count(*)                                                       as activity_count,

  -- THE SLIP. Measured only on activities that have both a plan and an actual end, because a
  -- variance against a plan that does not exist is not a variance.
  max(ba.variance_minutes) filter (
    where ba.actual_end is not null and ba.planned_end_at is not null)  as slip_minutes,
  count(*) filter (
    where ba.actual_end is not null and ba.planned_end_at is not null)  as measured_count
from public.master_batch mb
join public.process_definition pd on pd.id = mb.process_definition_id
left join public.v_process_envelope e on e.process_definition_id = pd.id
left join public.batch_activity ba on ba.master_batch_id = mb.id
group by mb.id, mb.code, mb.status, mb.start_at, pd.code, e.standard_hr;

grant select on public.v_batch_slip to authenticated;

comment on view public.v_batch_slip is
  'How far behind the batch actually is, measured on work that has FINISHED. The worst completed '
  'variance, not an average — averaging a rail whose slow step has already happened forecasts a '
  'recovery nobody has a reason to expect. 0056.';


-- ── 2 · The five numbers, per activity. ────────────────────────────────────

create or replace view public.v_activity_forecast as
select
  x.activity_id,
  x.master_batch_id,
  x.code,
  x.title,
  x.scope_label,

  -- 1 · PLAN — frozen at activation.
  x.planned_start_at,
  x.planned_end_at,
  -- 2 · EXTENSION — a separate figure, never folded into the plan.
  x.approved_extension_hr,
  -- 3 · AUTHORISED — plan + extension.
  x.authorised_end_at,
  -- 4 · ACTUAL — what happened.
  x.actual_start,
  x.actual_end,
  -- The variance against the ORIGINAL plan. An approval does not erase it.
  x.original_variance_minutes,
  x.within_authorisation,

  -- 5 · FORECAST.
  case
    when x.actual_end is not null then x.actual_end
    when x.actual_start is not null and x.planned_start_at is not null
         and x.planned_end_at is not null
      then x.actual_start + (x.planned_end_at - x.planned_start_at)
    when x.planned_end_at is not null and s.slip_minutes is not null
      then x.planned_end_at + make_interval(secs => (s.slip_minutes * 60)::int)
    else null
  end                                     as projected_end_at,

  case
    when x.actual_end is not null then 'finished'
    when x.actual_start is not null and x.planned_start_at is not null
         and x.planned_end_at is not null then 'running'
    when x.planned_end_at is not null and s.slip_minutes is not null then 'projected'
    else 'unknown'
  end                                     as forecast_basis,

  -- Stated in full rather than left to a screen, because the honest empty state is the one a
  -- screen is most likely to replace with a plausible guess.
  case
    when x.actual_end is not null then null
    when x.actual_start is not null and x.planned_end_at is null
      then 'The process states no duration for this activity, so its end cannot be projected.'
    when x.planned_end_at is null
      then 'This activity has no planned end, so there is nothing to project from.'
    when s.slip_minutes is null
      then 'Nothing in this batch has finished yet, so there is no measured slip to project.'
    else null
  end                                     as forecast_unknown_reason
from public.v_activity_expectation x
join public.v_batch_slip s on s.master_batch_id = x.master_batch_id;

grant select on public.v_activity_forecast to authenticated;

comment on view public.v_activity_forecast is
  'PLAN · EXTENSION · AUTHORISED · ACTUAL · FORECAST, side by side and never collapsed. '
  'forecast_basis says which arithmetic produced the projection — a projection read as a '
  'measurement is how a screen promises a date the factory never committed to. 0056.';


-- ── 3 · The same five, for the batch. ──────────────────────────────────────

create or replace view public.v_batch_forecast as
select
  s.master_batch_id,
  s.code,
  s.status,
  s.process_code,
  s.h0,
  s.standard_hr,

  s.planned_end_at,
  ext.approved_extension_hr,
  case when s.planned_end_at is null or ext.approved_extension_hr is null then s.planned_end_at
       else s.planned_end_at + make_interval(secs => (ext.approved_extension_hr * 3600)::int)
  end                                     as authorised_end_at,

  s.slip_minutes,
  s.measured_count,
  s.finished_count,
  s.running_count,
  s.activity_count,

  case when s.planned_end_at is null or s.slip_minutes is null then null
       else s.planned_end_at + make_interval(secs => (s.slip_minutes * 60)::int)
  end                                     as projected_end_at,

  case
    when s.status <> 'active'                              then 'not running'
    when s.planned_end_at is null                          then 'unknown'
    when s.slip_minutes is null                            then 'no measurement yet'
    else 'projected'
  end                                     as forecast_basis,

  -- EXPOSURE: how far past the standard this batch is heading, against the standard of ITS OWN
  -- process version. Positive is late. The number management is actually asking for.
  case when s.slip_minutes is null then null else s.slip_minutes end as exposure_minutes,

  case
    when s.h0 is null           then 'H0 is not set, so nothing can be placed on a clock.'
    when s.standard_hr is null  then 'The process version states no standard, so there is no end to project against.'
    when s.slip_minutes is null then 'No activity has both a planned end and an actual end yet, so there is no measured slip.'
    else null
  end                                     as forecast_unknown_reason
from public.v_batch_slip s
left join (
  -- Authorised time is the SUM of what has been approved on this batch, and only what is
  -- currently effective. A cancelled or expired extension authorised nothing.
  select master_batch_id, sum(approved_extension_hr) as approved_extension_hr
    from public.extension_request
   where public.extension_is_effective(status)
   group by master_batch_id
) ext on ext.master_batch_id = s.master_batch_id;

grant select on public.v_batch_forecast to authenticated;

comment on view public.v_batch_forecast is
  'The batch story in five numbers: planned end (H0 + its own process standard), approved '
  'extension, authorised end, projected end, and the exposure between plan and projection. '
  'Writes nothing — a forecast that persisted would be a second plan. 0056.';
