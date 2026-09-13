-- ─────────────────────────────────────────────────────────────────────────────
-- 0034 · The batch baseline is immutable after activation.  (F1)
--
-- THE INVARIANT
--   Once master_batch.status leaves 'draft', these columns of batch_activity never
--   change again, for anyone, by any path:
--       planned_start_at, planned_end_at, baseline_start_hour, baseline_end_hour
--   and the two inputs that derive them:
--       planned_time, day0_duration_hr
--
-- WHY THIS MIGRATION EXISTS
--   The refusal was real but it lived in the CALLERS. `set_activity_plan`,
--   `set_batch_start_at` and `clear_planned_time` each check `status = 'draft'`.
--   The function that actually writes the columns — `repoint_batch_activities` —
--   checked nothing, and a probe of the deployed database showed its ACL as
--
--       =X/postgres | anon=X | authenticated=X | service_role=X
--
--   PUBLIC and anon included. Any caller holding the anon key could repoint an
--   ACTIVE batch's whole plan onto its actuals, and every variance in the product
--   would read zero. That is the one thing MushroomOS exists to prevent, so the
--   guard moves to the writer and is then restated as a table-level refusal.
--
--   `repoint_one_activity` had PUBLIC revoked in 0027 but kept its own `anon`
--   grant from Supabase's schema defaults. Revoking PUBLIC alone was never enough.
--
-- THREE LAYERS, DELIBERATELY REDUNDANT
--   1 · nobody but the owner may call the plan writers          (grants)
--   2 · the writers refuse a non-draft batch themselves         (function guard)
--   3 · the table refuses the write whatever asked for it       (trigger)
--
--   Layer 3 is what makes the claim provable. It holds against an RPC nobody has
--   written yet, and against a direct UPDATE by a table owner.
--
--   Layer 4 closes the way round: an admin may write master_batch directly under
--   `batch_admin_write`, so without a guard they could set status back to 'draft',
--   move the plan, and set it forward again. Activation is one-way.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · Nobody calls the plan writers directly. ──────────────────────────────
-- Both are SECURITY DEFINER and both are reached through a draft-guarded RPC.
-- Neither has ever needed to be callable by a client.

revoke execute on function public.repoint_batch_activities(uuid) from public, anon, authenticated;
revoke execute on function public.repoint_one_activity(uuid)     from public, anon, authenticated;

-- The draft-guarded editors are for signed-in staff. `anon` has no business in
-- the plan at all, and each of these reaches the frozen columns via
-- `trg_replan_hours`.
revoke execute on function public.set_activity_plan(uuid, jsonb)        from public, anon;
revoke execute on function public.clear_planned_time(uuid)              from public, anon;
revoke execute on function public.generate_activity_plan(uuid)          from public, anon;
revoke execute on function public.set_batch_start_at(uuid, timestamptz) from public, anon;


-- ── 2 · The guard travels with the writer. ───────────────────────────────────
-- The UPDATE bodies are 0027's, unchanged. The only edit is the refusal in front
-- of each one, worded exactly as `set_activity_plan` words it so that a user who
-- reaches the same wall by two routes reads the same sentence both times.

create or replace function public.repoint_batch_activities(p_batch uuid)
returns int language plpgsql security definer set search_path = public as $fn$
declare
  n int;
  b master_batch;
begin
  select * into b from master_batch where id = p_batch;
  if not found then
    raise exception 'No such batch: %', p_batch;
  end if;
  if b.status <> 'draft' then
    raise exception
      'The baseline is frozen - % is %. Change goes through a deviation, an override or an approved extension.',
      b.code, b.status
      using errcode = 'check_violation';
  end if;

  update batch_activity ba
     set baseline_start_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time))::int
           else pa.standard_start_hour
         end,
         baseline_end_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time)
                   + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr, 0))::int
           else pa.standard_end_hour
         end,
         planned_hour_source = case
           when ba.planned_time is not null and mb.start_at is not null then 'admin_planned'
           else 'standard'
         end::plan_hour_source,
         planned_start_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null
             then mb.start_at + make_interval(
                    secs => ((ba.rel_day * 24
                              + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                             * 3600)::int)
           when pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null then
             case when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
               then mb.start_at + make_interval(
                      secs => (((ba.rel_day * 24
                                 + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                                + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr))
                               * 3600)::int)
               else null
             end
           when pa.standard_start_hour is null then null
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.master_batch_id = p_batch
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

comment on function public.repoint_batch_activities(uuid) is
  'Recomputes the Plan register for a DRAFT batch. Refuses once the batch is activated, and is '
  'callable only by the owner - every legitimate caller is a SECURITY DEFINER RPC. 0034 / F1.';


create or replace function public.repoint_one_activity(p_activity uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare b master_batch;
begin
  select mb.* into b from master_batch mb
    join batch_activity ba on ba.master_batch_id = mb.id
   where ba.id = p_activity;
  if not found then
    raise exception 'No such activity: %', p_activity;
  end if;
  if b.status <> 'draft' then
    raise exception
      'The baseline is frozen - % is %. Change goes through a deviation, an override or an approved extension.',
      b.code, b.status
      using errcode = 'check_violation';
  end if;

  update batch_activity ba
     set baseline_start_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time))::int
           else pa.standard_start_hour
         end,
         baseline_end_hour = case
           when ba.planned_time is not null and mb.start_at is not null
             then (ba.rel_day * 24 + public.hour_within_batch_day(mb.start_at, ba.planned_time)
                   + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr, 0))::int
           else pa.standard_end_hour
         end,
         planned_hour_source = case
           when ba.planned_time is not null and mb.start_at is not null then 'admin_planned'
           else 'standard'
         end::plan_hour_source,
         planned_start_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null
             then mb.start_at + make_interval(
                    secs => ((ba.rel_day * 24
                              + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                             * 3600)::int)
           when pa.standard_start_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
         end,
         planned_end_at = case
           when mb.start_at is null then null
           when ba.planned_time is not null then
             case when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
               then mb.start_at + make_interval(
                      secs => (((ba.rel_day * 24
                                 + public.hour_within_batch_day(mb.start_at, ba.planned_time))
                                + coalesce(ba.day0_duration_hr, ba.duration_target_max_hr))
                               * 3600)::int)
               else null
             end
           when pa.standard_start_hour is null then null
           when coalesce(ba.day0_duration_hr, ba.duration_target_max_hr) is not null
             then mb.start_at + make_interval(secs => (pa.standard_start_hour * 3600)::int)
                  + make_interval(secs => (coalesce(ba.day0_duration_hr,
                                                    ba.duration_target_max_hr) * 3600)::int)
           when pa.standard_end_hour is not null
             then mb.start_at + make_interval(secs => (pa.standard_end_hour * 3600)::int)
         end
    from master_batch mb, process_activity pa
   where ba.id = p_activity
     and mb.id = ba.master_batch_id
     and pa.id = ba.process_activity_id;
end;
$fn$;

revoke execute on function public.repoint_one_activity(uuid) from public, anon, authenticated;


-- ── 3 · The table refuses the write, whoever asked for it. ───────────────────
-- BEFORE UPDATE, so nothing is written and no other trigger fires. The early
-- return means a normal execution write — actual_start, state, evidence counts —
-- pays one comparison and nothing else: the Plan register is untouched by
-- everything the Actual register does, which is the whole point of separating
-- them.

create or replace function public.fn_plan_is_frozen()
returns trigger language plpgsql as $fn$
declare
  st   batch_status;
  code text;
  moved text[] := '{}';
begin
  if new.planned_start_at    is not distinct from old.planned_start_at
 and new.planned_end_at      is not distinct from old.planned_end_at
 and new.baseline_start_hour is not distinct from old.baseline_start_hour
 and new.baseline_end_hour   is not distinct from old.baseline_end_hour
 and new.planned_time        is not distinct from old.planned_time
 and new.day0_duration_hr    is not distinct from old.day0_duration_hr
  then
    return new;                       -- the Plan register did not move
  end if;

  select mb.status, mb.code into st, code
    from master_batch mb where mb.id = old.master_batch_id;

  if st = 'draft' then
    return new;                       -- still being written; that is what draft is for
  end if;

  -- Name the columns that moved. A refusal an engineer cannot act on is half a
  -- refusal, and this one will most often be read from a server log.
  if new.planned_start_at    is distinct from old.planned_start_at    then moved := moved || 'planned_start_at'::text; end if;
  if new.planned_end_at      is distinct from old.planned_end_at      then moved := moved || 'planned_end_at'::text; end if;
  if new.baseline_start_hour is distinct from old.baseline_start_hour then moved := moved || 'baseline_start_hour'::text; end if;
  if new.baseline_end_hour   is distinct from old.baseline_end_hour   then moved := moved || 'baseline_end_hour'::text; end if;
  if new.planned_time        is distinct from old.planned_time        then moved := moved || 'planned_time'::text; end if;
  if new.day0_duration_hr    is distinct from old.day0_duration_hr    then moved := moved || 'day0_duration_hr'::text; end if;

  raise exception
    'The baseline of % is frozen (batch is %). Refused a change to %. The plan of an activated batch is evidence, not a working document - record what happened, or request an authorised extension.',
    code, st, array_to_string(moved, ', ')
    using errcode = 'check_violation';
end;
$fn$;

drop trigger if exists trg_plan_is_frozen on public.batch_activity;
create trigger trg_plan_is_frozen
  before update on public.batch_activity
  for each row execute function public.fn_plan_is_frozen();

comment on function public.fn_plan_is_frozen() is
  'Layer 3 of the baseline freeze. Refuses any change to the Plan register of a batch that has '
  'left draft, whatever RPC, role or direct statement asked for it. 0034 / F1.';


-- ── 4 · Activation is one-way. ──────────────────────────────────────────────
-- `batch_admin_write` lets an admin UPDATE master_batch directly. Without this,
-- the route round layer 3 is: status -> 'draft', move the plan, status -> 'active'.
-- A batch that must not run is cancelled, never un-activated.

create or replace function public.fn_activation_is_one_way()
returns trigger language plpgsql as $fn$
begin
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception
      'Batch % cannot return to draft from %. Activation is one-way - cancel the batch instead.',
      old.code, old.status
      using errcode = 'check_violation';
  end if;

  -- H0 anchors every planned instant in the batch. Moving it after activation
  -- shifts the whole baseline without touching a single batch_activity row.
  if old.status <> 'draft' and new.start_at is distinct from old.start_at then
    raise exception
      'H0 of % is frozen (batch is %). Every planned instant in the batch hangs off it.',
      old.code, old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_activation_is_one_way on public.master_batch;
create trigger trg_activation_is_one_way
  before update on public.master_batch
  for each row execute function public.fn_activation_is_one_way();
