-- ─────────────────────────────────────────────────────────────────────────────
-- 0133 · PROCESS-2026M v1 — PROCESS-2026L with ONE TUNNEL PER PART.   (owner, 25 Sep 2026)
--
-- WHY. The factory puts each part of a batch (e.g. 155 / 156 / 157 = bunker lines 1 / 2 / 3) into
-- its OWN tunnel — 155 → Tunnel 4, 156 → Tunnel 10, 157 → Tunnel 2 — and each tunnel runs its own
-- stage clock: on 25 Sep 156 was unloaded while 155 and 157 were still venting, and 162 was heating
-- while 161 and 163 were in Conditioning 2. PROCESS-2026L has ONE tunnel chain for the whole batch
-- (TN-LEVEL … TN-COOL-2 after the LAST bunker's filling), and makes bunker 2 wait for bunker 1's
-- filling and unloading 2 wait for unloading 1. It cannot represent a single running batch today;
-- onboard_batch correctly refused "unloading 1 done while cooling 2 is current".
--
-- THE DELTA, AND NOTHING ELSE.
--   · TN-PREP, TN-LEVEL, TN-HEAT, TN-PAST, TN-COOL-1, TN-COND-2, TN-COOL-2 become one copy per part:
--     TN-B<x>-PREP … TN-B<x>-COOL-2 (x = 1..3), scope BUNKER_LINE "Bunker x" — the same unit as that
--     part's BNK-B<x>-TUN-LOAD. Every rule, duration, hold flag, reading and photo requirement is
--     copied verbatim (sop_copy_activity); only the activity codes a rule names are re-pointed.
--   · BNK-B<x>-TUN-LOAD waits for its own HOLD-2 and its own TN-B<x>-PREP — no longer for the
--     previous bunker's filling. Same for its Lab check LAB-TUN-LOAD-B<x>.
--   · TN-B<x>-LEVEL starts after BNK-B<x>-TUN-LOAD (was: after BNK-B3-TUN-LOAD, for all three).
--   · TUN-DISCHARGE-<x> waits for its own TN-B<x>-COOL-2 (was: cooling 2, then the previous unloading),
--     and joins its part's unit ("Bunker x").
--   · LAB-TUN-PRE now names TN-B1-PREP (was TN-PREP); LAB-QC-FINAL unchanged (opens with unloading 1).
--
-- HOURS. The stage durations are 2026L's (owner: "follow the standard"), counted from each part's
-- own filling. The fillings keep their 2026L hours (317/319/321). So unloading 1/2/3 fall at
-- H466/468/470 and the process ends at H472 — not H476: the later ceiling came only from the three
-- unloadings queuing behind one shared cooling. Recorded as stated envelope 472, FACTORY_RANGE (the
-- durations are factory-stated; the 472 total follows from them and awaits the factory's word).
--
-- Created as DRAFT. Publishing and making it current are separate, role-guarded calls.
-- PROCESS-2026L is not touched; batches on it keep it for ever.
-- Rollback: delete the PROCESS-2026M rows (refused by FKs once a batch references it).
-- ─────────────────────────────────────────────────────────────────────────────
do $mig$
declare
  src  uuid;
  dst  uuid;
  a    record;
  x    int;
  base numeric;
  tn   text[] := array['TN-PREP','TN-LEVEL','TN-HEAT','TN-PAST','TN-COOL-1','TN-COND-2','TN-COOL-2'];
  stage_len jsonb := '{"TN-LEVEL":14,"TN-HEAT":12,"TN-PAST":8,"TN-COOL-1":14,"TN-COND-2":85,"TN-COOL-2":14}';
  t    text;
  h    numeric;
  n    int;
begin
  select id into src from process_definition where code = 'PROCESS-2026L' and version = 1 and status = 'published';
  if src is null then raise exception '0133: PROCESS-2026L v1 (published) not found'; end if;
  if exists (select 1 from process_definition where code = 'PROCESS-2026M') then
    raise exception '0133: PROCESS-2026M already exists';
  end if;

  -- the durations this file relies on must be the ones 2026L actually has
  for t in select jsonb_object_keys(stage_len) loop
    select standard_end_hour - standard_start_hour into h from process_activity where process_definition_id = src and code = t;
    if h is distinct from (stage_len->>t)::numeric then
      raise exception '0133: % lasts % h in 2026L, this file assumes %', t, h, stage_len->>t;
    end if;
  end loop;

  insert into process_definition (code, name, version, status, source_ref, anchor_day_label, total_days,
                                  envelope_confidence, envelope_hours, envelope_hour_source)
  select 'PROCESS-2026M', name, 1, 'draft',
         source_ref || ' · owner 25 Sep 2026: each part goes into its own tunnel — per-part tunnel preparation, '
                    || 'filling, levelling, heating, pasteurisation, cooling 1, conditioning 2, cooling 2 and unloading; '
                    || 'fillings no longer wait for each other; 2026L stage durations counted from each part''s own filling',
         anchor_day_label, total_days, 'FACTORY_RANGE', 472, 'factory_stated'
    from process_definition where id = src
  returning id into dst;

  -- 1 · everything, verbatim
  for a in select id, code from process_activity where process_definition_id = src loop
    perform public.sop_copy_activity(a.id, dst, a.code, true, true);
  end loop;

  -- 2 · one tunnel chain per part
  for x in 1..3 loop
    for a in select id, code from process_activity where process_definition_id = dst and code = any (tn) loop
      perform public.sop_copy_activity(a.id, dst, 'TN-B' || x || '-' || substr(a.code, 4), true, true);
    end loop;

    update process_activity
       set scope = 'BUNKER_LINE',
           cardinality_rule = jsonb_build_object('kind', 'FIXED_LABEL', 'label', 'Bunker ' || x),
           label_template = label_template || ' — bunker ' || x,
           seq = seq + x
     where process_definition_id = dst and code like 'TN-B' || x || '-%';

    -- rules of the new chain name the new chain; levelling follows THIS part's filling
    update gate_rule g
       set config = replace(replace(replace(replace(replace(replace(replace(replace(g.config::text,
                      '"TN-PREP"',   '"TN-B' || x || '-PREP"'),
                      '"TN-LEVEL"',  '"TN-B' || x || '-LEVEL"'),
                      '"TN-HEAT"',   '"TN-B' || x || '-HEAT"'),
                      '"TN-PAST"',   '"TN-B' || x || '-PAST"'),
                      '"TN-COOL-1"', '"TN-B' || x || '-COOL-1"'),
                      '"TN-COND-2"', '"TN-B' || x || '-COND-2"'),
                      '"TN-COOL-2"', '"TN-B' || x || '-COOL-2"'),
                      '"BNK-B3-TUN-LOAD"', '"BNK-B' || x || '-TUN-LOAD"')::jsonb
      from process_activity p
     where p.id = g.process_activity_id and p.process_definition_id = dst and p.code like 'TN-B' || x || '-%';

    -- filling waits for its own bunker and its own tunnel preparation only
    update gate_rule g
       set config = jsonb_set(
                      jsonb_set(g.config, '{activity_codes}',
                                jsonb_build_array('BNK-B' || x || '-HOLD-2', 'TN-B' || x || '-PREP')),
                      '{prerequisites}',
                      coalesce(jsonb_build_object('TN-B' || x || '-PREP', g.config->'prerequisites'->'TN-PREP'), '{}'::jsonb))
      from process_activity p
     where p.id = g.process_activity_id and p.process_definition_id = dst
       and p.code = 'BNK-B' || x || '-TUN-LOAD' and g.kind = 'PREDECESSOR' and g.phase = 'entry';

    update gate_rule g
       set config = jsonb_set(g.config, '{activity_codes}',
                              jsonb_build_array('BNK-B' || x || '-HOLD-2', 'TN-B' || x || '-PREP'))
      from process_activity p
     where p.id = g.process_activity_id and p.process_definition_id = dst
       and p.code = 'LAB-TUN-LOAD-B' || x and g.kind = 'PREDECESSOR' and g.phase = 'entry';

    -- unloading waits for its own cooling 2, and belongs to its part
    update gate_rule g
       set config = jsonb_set(g.config, '{activity_codes}', jsonb_build_array('TN-B' || x || '-COOL-2'))
      from process_activity p
     where p.id = g.process_activity_id and p.process_definition_id = dst
       and p.code = 'TUN-DISCHARGE-' || x and g.kind = 'PREDECESSOR' and g.phase = 'entry';

    update process_activity
       set scope = 'BUNKER_LINE',
           cardinality_rule = jsonb_build_object('kind', 'FIXED_LABEL', 'label', 'Bunker ' || x),
           label_template = 'Tunnel unloading / grow-room loading — bunker ' || x
     where process_definition_id = dst and code = 'TUN-DISCHARGE-' || x;

    -- hours: preparation ends 1 h before this part's filling (as in 2026L); the chain runs from its end
    select standard_start_hour into base from process_activity where process_definition_id = dst and code = 'BNK-B' || x || '-TUN-LOAD';
    update process_activity set standard_start_hour = base - 9, standard_end_hour = base - 1,
                                rel_day = floor((base - 9) / 24)::int, standard_hour_source = 'sop_duration_chain'
     where process_definition_id = dst and code = 'TN-B' || x || '-PREP';
    h := base + 2;
    foreach t in array tn[2:7] loop
      update process_activity set standard_start_hour = h, standard_end_hour = h + (stage_len->>t)::numeric,
                                  rel_day = floor(h / 24)::int, standard_hour_source = 'sop_duration_chain'
       where process_definition_id = dst and code = 'TN-B' || x || '-' || substr(t, 4);
      h := h + (stage_len->>t)::numeric;
    end loop;
    update process_activity set standard_start_hour = h, standard_end_hour = h + 2,
                                rel_day = floor(h / 24)::int, standard_hour_source = 'sop_duration_chain'
     where process_definition_id = dst and code = 'TUN-DISCHARGE-' || x;
  end loop;

  -- the Lab readiness check names part 1's preparation; final QC opens with unloading 1, at its new hour
  update gate_rule g set config = replace(g.config::text, '"TN-PREP"', '"TN-B1-PREP"')::jsonb
    from process_activity p
   where p.id = g.process_activity_id and p.process_definition_id = dst and p.code = 'LAB-TUN-PRE';
  update process_activity p
     set standard_start_hour = d.standard_start_hour, standard_end_hour = d.standard_start_hour,
         rel_day = floor(d.standard_start_hour / 24)::int
    from process_activity d
   where p.process_definition_id = dst and p.code = 'LAB-QC-FINAL'
     and d.process_definition_id = dst and d.code = 'TUN-DISCHARGE-1';

  -- 3 · the shared chain goes (children cascade)
  delete from process_activity where process_definition_id = dst and code = any (tn);

  -- ── self-check ─────────────────────────────────────────────────────────────
  select count(*) into n from process_activity where process_definition_id = dst;
  if n <> 113 - 7 + 21 then raise exception '0133: expected 127 activities, got %', n; end if;

  select count(*) into n
    from gate_rule g join process_activity p on p.id = g.process_activity_id
   where p.process_definition_id = dst
     and g.config::text ~ '"TN-(PREP|LEVEL|HEAT|PAST|COOL-1|COND-2|COOL-2)"';
  if n > 0 then raise exception '0133: % rule(s) still name the shared tunnel chain', n; end if;

  -- every code a rule names exists in this version
  select count(*) into n
    from gate_rule g join process_activity p on p.id = g.process_activity_id,
         jsonb_array_elements_text(coalesce(g.config->'activity_codes', '[]'::jsonb)) c(code)
   where p.process_definition_id = dst
     and not exists (select 1 from process_activity q where q.process_definition_id = dst and q.code = c.code);
  if n > 0 then raise exception '0133: % rule reference(s) to codes that do not exist', n; end if;

  -- no filling waits for another part any more
  select count(*) into n
    from gate_rule g join process_activity p on p.id = g.process_activity_id
   where p.process_definition_id = dst and p.code ~ '^(BNK-B\d-TUN-LOAD|LAB-TUN-LOAD-B\d)$'
     and g.config->'activity_codes' ?| array['BNK-B1-TUN-LOAD','BNK-B2-TUN-LOAD','BNK-B3-TUN-LOAD'];
  if n > 0 then raise exception '0133: a filling still waits for another part''s filling'; end if;

  select max(coalesce(standard_end_hour, standard_start_hour)) into h from process_activity where process_definition_id = dst;
  if h <> 472 then raise exception '0133: activities end at H%, expected H472', h; end if;

  raise notice '0133: PROCESS-2026M v1 drafted (%): 127 activities, per-part tunnel chains, ends H472', dst;
end
$mig$;
