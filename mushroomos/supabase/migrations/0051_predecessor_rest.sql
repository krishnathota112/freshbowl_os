-- ─────────────────────────────────────────────────────────────────────────────
-- 0051 · A predecessor gate can require a REST after the predecessor's actual end.
--
-- THE DEFECT, AND IT IS MINE
--   0043 emitted six gate rules carrying
--
--       {"activity_codes": ["TRN-P1-T1"], "min_rest_hr": 8}
--
--   and `evaluate_gates` DOES NOT READ THAT KEY. Verified against the deployed body, not assumed.
--   So the Turner's T2 currently unlocks the moment T1 completes, with no rest at all, while the
--   database holds a row that reads as though the rule were built.
--
--   **An inert rule is worse than a missing one, because it looks built.** F10 is explicit that
--   the wrong reading — `T2 = T0 start + 24 h` — must never be built; a rule that enforces nothing
--   fails the same test from the other direction.
--
-- WHY NEITHER EXISTING KIND COULD EXPRESS IT
--   · `PREDECESSOR` asks only whether the predecessor is COMPLETED.
--   · `ELAPSED_TIME` measures from `ba.actual_start` — THIS activity's start. T2 has not started;
--     that is the whole question. It can never answer it.
--
--   The rule from STANDARD §3: **eight hours from THAT PILE'S OWN T1 actual end.** Honoured to the
--   minute on all six piles in the source and stated independently in the SOP prose. It is a
--   condition on an ACTUAL of another activity, and nothing in the engine could say that.
--
-- WHY IT COULD ONLY BE BUILT AFTER 0049
--   The gate reads `actual_end`. Until actuals were append-only, a gate built on one could be
--   opened early by restating the timestamp it depends on. A gate on a value anyone can rewrite
--   is not a gate.
--
-- GENERAL, NOT TURNER-SPECIFIC. `min_rest_hr` works on any PREDECESSOR rule, and the bunker holds
-- are the next obvious user. No pile number and no literal 8 appears in any function body — the 8
-- lives in the process definition, where STANDARD.md put it.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · The predecessor status also reports when it actually ended. ─────────
-- Return type changes, so this is a drop and create. `evaluate_gates` resolves it at runtime and
-- reads it into a `record`, so an extra column needs no change there.

drop function if exists public.gate_predecessor_status(uuid, integer, jsonb, text);

create or replace function public.gate_predecessor_status(
  p_batch uuid, p_instance_no integer, p_codes jsonb, p_binding text
) returns table (
  ok boolean, blocker_title text, blocker_stream text, total integer, done integer,
  -- The LATEST actual end across the matched predecessors. For SAME_SCOPE_INSTANCE — the Turner's
  -- binding — that is one row: this pile's own T1. For ALL_INSTANCES it is the last of them to
  -- finish, which is the one the rest has to be measured from.
  last_actual_end timestamptz
)
language plpgsql stable set search_path = public as $fn$
declare
  v_total   int := 0;
  v_done    int := 0;
  v_title   text;
  v_stream  text;
  v_end     timestamptz;
  v_binding text := coalesce(p_binding, 'ALL_INSTANCES');
begin
  if p_codes is null or jsonb_typeof(p_codes) <> 'array' or jsonb_array_length(p_codes) = 0 then
    return query select true, null::text, null::text, 0, 0, null::timestamptz;
    return;
  end if;

  select count(*)::int,
         count(*) filter (where ba.state in ('COMPLETED','SKIPPED'))::int,
         max(ba.actual_end)
    into v_total, v_done, v_end
  from batch_activity ba
  where ba.master_batch_id = p_batch
    and ba.code in (select jsonb_array_elements_text(p_codes))
    and (v_binding <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = p_instance_no);

  if v_total = 0 then
    return query select true, null::text, null::text, 0, 0, null::timestamptz;
    return;
  end if;

  -- Name the instance that is actually holding this up, not an arbitrary one.
  select ba.title, ba.stream::text into v_title, v_stream
  from batch_activity ba
  where ba.master_batch_id = p_batch
    and ba.code in (select jsonb_array_elements_text(p_codes))
    and (v_binding <> 'SAME_SCOPE_INSTANCE' or ba.instance_no = p_instance_no)
    and ba.state not in ('COMPLETED','SKIPPED')
  order by ba.instance_no
  limit 1;

  if v_binding = 'ANY_INSTANCE' then
    return query select v_done > 0, v_title, v_stream, v_total, v_done, v_end;
  else
    return query select v_done = v_total, v_title, v_stream, v_total, v_done, v_end;
  end if;
end;
$fn$;

grant execute on function public.gate_predecessor_status(uuid, integer, jsonb, text) to authenticated;


-- ── 2 · evaluate_gates honours min_rest_hr. ────────────────────────────────
-- Patched against the deployed body: `evaluate_gates` carries nine gate kinds and the skip rules
-- for unmapped confidence, and retyping it is how one of those quietly changes.

do $mig$
declare
  src     text;
  patched text;
  anchor  text;
  rest    text;
  n       int;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'evaluate_gates';

  if src is null then
    raise exception 'evaluate_gates() is not deployed.';
  end if;

  if src like '%min_rest_hr%' then
    raise notice 'evaluate_gates() already honours min_rest_hr.';
    return;
  end if;

  -- The line that ends the PREDECESSOR branch's own verdict. Unique in the body: the sub-rule
  -- path inside BOTH/EITHER_OR assigns `v_sub_ok`, not `v_ok`.
  anchor := 'v_ok := st.ok;';
  n := position(anchor in src);
  if n = 0 then
    raise exception
      'evaluate_gates() does not assign the predecessor verdict in a form 0051 recognises. '
      'The body has moved — patch it by hand rather than letting this file report success.';
  end if;

  -- ⚠ CRLF. The deployed bodies carry Windows line endings, so this builds its insert with
  -- explicit newlines and anchors on a statement rather than on a line boundary. 0050 lost a
  -- round trip to exactly that.
  rest :=
    E'\n' ||
    '      -- 0051 · A rest measured from the PREDECESSOR''S ACTUAL END.' || E'\n' ||
    '      -- The Turner: 8 h after THAT PILE''S OWN T1 end. Not T0 start + 24 h (F10),' || E'\n' ||
    '      -- and not ELAPSED_TIME, which measures from this activity''s own start.' || E'\n' ||
    '      v_hours := nullif(g.config->>''min_rest_hr'','''')::numeric;' || E'\n' ||
    '      if v_ok and v_hours is not null then' || E'\n' ||
    '        if st.last_actual_end is null then' || E'\n' ||
    '          -- Complete, but with no recorded end there is nothing to measure from. Refuse:' || E'\n' ||
    '          -- treating an unknown end as "long enough ago" is how a rest gets skipped.' || E'\n' ||
    '          v_ok := false;' || E'\n' ||
    '          v_vars := v_vars || jsonb_build_object(' || E'\n' ||
    '            ''rest_required_hr'', v_hours::text,' || E'\n' ||
    '            ''rest_remaining'', ''unknown — no finish time recorded'');' || E'\n' ||
    '        else' || E'\n' ||
    '          v_remain := greatest(' || E'\n' ||
    '            st.last_actual_end + make_interval(secs => (v_hours * 3600)::int) - now(),' || E'\n' ||
    '            interval ''0'');' || E'\n' ||
    '          v_ok := (v_remain = interval ''0'');' || E'\n' ||
    '          v_vars := v_vars || jsonb_build_object(' || E'\n' ||
    '            ''rest_required_hr'', v_hours::text,' || E'\n' ||
    '            ''rest_remaining'', to_char(v_remain, ''HH24:MI''),' || E'\n' ||
    '            ''predecessor_ended_at'', to_char(st.last_actual_end, ''DD Mon HH24:MI''));' || E'\n' ||
    '        end if;' || E'\n' ||
    '      end if;';

  patched := substr(src, 1, n + length(anchor) - 1) || rest || substr(src, n + length(anchor));
  execute patched;
end
$mig$;


-- ── 3 · The refusal says how much longer. ──────────────────────────────────
-- "A refusal must name what to do instead." "Locked" with no number tells an operator to keep
-- pressing the button.

update public.gate_rule g
   set blocked_reason_template =
       'Locked — {predecessor_label} finished at {predecessor_ended_at}. This pile rests '
       '{rest_required_hr} h after its own T1 ends; {rest_remaining} still to go.'
  from public.process_activity pa
  join public.process_definition pd on pd.id = pa.process_definition_id
 where g.process_activity_id = pa.id
   and pd.code = 'PROCESS-2026C'
   and g.config ? 'min_rest_hr';


-- ── 4 · The rule is visible without reading a function. ────────────────────

create or replace view public.v_gate_rest_rule as
select
  pd.code                            as process_code,
  pd.version                         as process_version,
  pa.code                            as activity_code,
  pa.label_template,
  g.config->'activity_codes'->>0     as waits_for,
  g.predecessor_binding,
  (g.config->>'min_rest_hr')::numeric as min_rest_hr,
  g.is_enabled
from public.gate_rule g
join public.process_activity pa on pa.id = g.process_activity_id
join public.process_definition pd on pd.id = pa.process_definition_id
where g.config ? 'min_rest_hr';

grant select on public.v_gate_rest_rule to authenticated;

comment on view public.v_gate_rest_rule is
  'Every rest-after-predecessor rule in every process version, as data. The Turner''s eight hours '
  'live here, not in a function body. 0051.';
