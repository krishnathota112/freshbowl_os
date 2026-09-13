-- ─────────────────────────────────────────────────────────────────────────────
-- 0075 · Narrowing 0073's pre-H0 rule to the case it was actually about.
--
-- 0073 added "a sample cannot be dated before H0" to open_lab_sample. Running the suite afterwards
-- failed twenty tests in labGates and lab with:
--
--     A sample for Before first bunker loading cannot be dated 2026-09-09:
--     the batch begins at 2026-09-20 and nothing in it happened before that.
--
-- The fixtures were not wrong. A batch can be created with H0 in the future, and a sample taken
-- today against a batch that begins next week is "before H0" without anything being amiss. The
-- comparison is only meaningful once the clock has started.
--
-- The rule now applies only when now() >= H0. The original finding still fails: a sample backdated
-- two days on a running batch is refused exactly as before.
--
-- Worth recording plainly: 0073 was too broad, the existing suite caught it, and this is the
-- narrower rule it should have been. Generated from the deployed body.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_lab_sample(p_activity uuid, p_checkpoint uuid, p_label text DEFAULT NULL::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba     batch_activity;
  cp     lab_checkpoint;
  at_    timestamptz;
  h0_    timestamptz;
  new_id uuid;
begin
  -- 0072 · WHO MAY COLLECT A SAMPLE.
  --
  -- There was no role check here at all. An OPERATOR could open a laboratory sample — measured,
  -- HTTP 200 — which every other laboratory entry point refuses. Sampling is laboratory work.
  perform public.assert_role(
    array['lab_tech', 'supervisor', 'manager', 'admin', 'gm']::app_role[], 'collect a lab sample');

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  select * into cp from lab_checkpoint where id = p_checkpoint;
  if not found then raise exception 'No such lab checkpoint: %', p_checkpoint; end if;

  -- 0072 · A CORRECT READING FILED AGAINST THE WRONG CHECKPOINT IS A WRONG READING.
  --
  -- The activity was checked, and the checkpoint was checked, but never the two together. So a
  -- sample for one activity could be filed at any checkpoint in the catalogue — and because
  -- request_lab_test freezes the specification band from the SAMPLE's checkpoint, the same
  -- moisture reading was then judged against whichever band was chosen:
  --
  --     bound checkpoint      TUNNEL_LOAD    72.5 .. 74
  --     unrelated checkpoint  COMPOST_OUT    65   .. 68
  --
  -- Nothing about the resulting row looks wrong. That is what makes it dangerous.
  --
  -- lab_checkpoint_activity already states which checkpoints each activity performs, and every one
  -- of the 41 laboratory activities in PROCESS-2026C carries a binding, so there is always
  -- something to check against. Where an activity genuinely has no binding the rule cannot be
  -- applied and the sample is allowed, rather than inventing a pairing that the process does not
  -- state.
  if exists (select 1 from lab_checkpoint_activity lca
              where lca.process_activity_id = ba.process_activity_id)
     and not exists (
       select 1 from lab_checkpoint_activity lca
        where lca.process_activity_id = ba.process_activity_id
          and lca.checkpoint_code = cp.code
          and lca.checkpoint_map  = cp.checkpoint_map)
  then
    raise exception
      '% is not a checkpoint of %. That activity samples at %. Filing a reading under another '
      'checkpoint would judge it against that checkpoint''s band.',
      cp.code, ba.title,
      (select string_agg(distinct lca.checkpoint_code, ', ' order by lca.checkpoint_code)
         from lab_checkpoint_activity lca
        where lca.process_activity_id = ba.process_activity_id)
      using errcode = 'check_violation';
  end if;

  -- Same rule as every other recorded actual: not in the future. Consistent with 0016/0017/0021
  -- rather than a second opinion about time.
  at_ := coalesce(p_at, now());
  if at_ > now() then
    raise exception 'A sample cannot be collected in the future (% is ahead of now)', at_
      using errcode = 'invalid_datetime_format';
  end if;

  -- 0073 · NOR BEFORE THE BATCH EXISTED.
  --
  -- Only the future was refused, so a sample could be dated two days before H0 and accepted — a
  -- reading of material that had not been delivered yet, on record, feeding a checkpoint verdict.
  -- correct_actual already refuses exactly this ("the batch begins at X and nothing in it happened
  -- before that"); this is the same rule, applied where it was missing rather than a new opinion.
  --
  -- The incoming-material assay is deliberately NOT affected: it belongs before H0 by design, and
  -- it goes through open_prebatch_sample, which is a different function.
  select mb.start_at into h0_ from master_batch mb where mb.id = ba.master_batch_id;

  -- 0075 · ONLY ONCE THE CLOCK HAS ACTUALLY STARTED.
  --
  -- 0073 refused any sample dated before H0. That broke twenty existing tests, and they were right
  -- to break: a batch may be created with H0 in the FUTURE, and a sample taken today on a batch
  -- that starts next week is then "before H0" without anything being wrong. The comparison only
  -- means something once the batch clock has run — before that, "before H0" is just "now".
  --
  -- The attack the rule exists to stop is unaffected: a sample backdated two days on a batch whose
  -- H0 has already passed is still refused, because now() >= h0_ there.
  if h0_ is not null and now() >= h0_ and at_ < h0_ then
    raise exception
      'A sample for % cannot be dated %: the batch begins at % and nothing in it happened before '
      'that. The incoming-material assay is the one that precedes H0, and it is recorded '
      'separately.', ba.title, at_, h0_
      using errcode = 'invalid_datetime_format';
  end if;

  insert into lab_sample (checkpoint_id, master_batch_id, batch_activity_id, scope_ref,
                          vessel_id, sample_ref_label, collected_at, collected_by)
  values (cp.id, ba.master_batch_id, ba.id, ba.scope_label,
          ba.destination_location_id, p_label, at_, auth.uid())
  returning id into new_id;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'open_lab_sample', 'lab_sample', new_id::text,
          jsonb_build_object('checkpoint', cp.code, 'map', cp.checkpoint_map, 'activity', ba.title),
          'Sample collected at ' || cp.code || ' for ' || ba.title);
  return new_id;
end;
$function$
;

do $a$
begin
  if position('now() >= h0_ and at_ < h0_' in pg_get_functiondef(
       'public.open_lab_sample(uuid,uuid,text,timestamptz)'::regprocedure)) = 0 then
    raise exception '0075 failed: the pre-H0 rule was not narrowed';
  end if;
  -- everything 0072 and 0073 added must survive
  if position('collect a lab sample' in pg_get_functiondef('public.open_lab_sample(uuid,uuid,text,timestamptz)'::regprocedure)) = 0
     or position('is not a checkpoint of' in pg_get_functiondef('public.open_lab_sample(uuid,uuid,text,timestamptz)'::regprocedure)) = 0
     or position('cannot be collected in the future' in pg_get_functiondef('public.open_lab_sample(uuid,uuid,text,timestamptz)'::regprocedure)) = 0 then
    raise exception '0075 failed: an earlier guard was lost';
  end if;
  raise notice '0075 · the pre-H0 rule applies once the clock has started, and not before';
end $a$;
