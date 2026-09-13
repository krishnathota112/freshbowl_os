-- ─────────────────────────────────────────────────────────────────────────────
-- 0059 · Three writers that RECORD the role and never CHECK it.
--
--   set_batch_start_at    moves H0 on a draft — and H0 anchors every planned instant in the batch
--   set_factory_timezone  changes the zone EVERY batch clock is interpreted in, for all of them
--   send_alert            ARCH-009, open since 0009
--
-- Each of them writes an `audit_event` carrying `public.current_app_role()`, which reads as a
-- permission check at a glance and is the opposite of one: it faithfully records that an operator
-- changed the factory timezone. **Recording who did it is not the same as deciding who may.**
--
-- That is the pattern worth naming, because it is the one that survives review: a function that
-- mentions the role in three places and tests it in none.
--
-- `set_factory_timezone` is the widest of the three. The zone is a single row read by
-- `factory_h0_instant`, `hour_within_batch_day` and every planned instant derived from them, so one
-- unauthorised call re-interprets the clock of every batch in the factory at once.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  spec record;
  src  text;
  n    int;
  ins  text;
begin
  for spec in
    select * from (values
      ('set_batch_start_at',   'admin,gm',                        'set H0'),
      ('set_factory_timezone', 'admin,gm',                        'set the factory timezone'),
      -- ARCH-009's own note says to confirm the list against the role model before choosing, and
      -- names `src/api/schedule.ts` as a legitimate caller — the ScheduleBuilder's alert, which a
      -- supervisor sends. So supervisor is in, and operator and lab_tech are out.
      ('send_alert',           'gm,manager,admin,supervisor',     'send an alert')
    ) as t(fname, roles, action)
  loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = spec.fname;

    if src is null then
      raise warning '%() is not deployed — skipped.', spec.fname;
      continue;
    end if;
    if src like '%assert_role%' then
      raise notice '%() already carries a role guard.', spec.fname;
      continue;
    end if;

    ins := format(
      E'\n  perform public.assert_role(array[%s]::app_role[], %L);\n',
      (select string_agg(quote_literal(trim(x)), ', ')
         from unnest(string_to_array(spec.roles, ',')) x),
      spec.action);

    -- CRLF-safe: a regex to the first `begin` of the body, never a literal newline. See 0050.
    n := coalesce(nullif(regexp_instr(src, 'AS \$function\$.*?\mbegin\M', 1, 1, 1, 'ns'), 0), 0);
    if n = 0 then
      raise exception 'Could not find the body opening of %(). Patch it by hand.', spec.fname;
    end if;

    execute substr(src, 1, n - 1) || ins || substr(src, n);
    raise notice '%() now requires %.', spec.fname, spec.roles;
  end loop;
end
$mig$;


-- ── The dev clock, asserted rather than assumed. ───────────────────────────
-- ARCH-008: "If `get_effective_now()` is reachable from anything that writes ACTUAL, AUTHORIZATION
-- or AUDIT, every timestamp is deniable."
--
-- It is NOT. Only its own accessors reference it — checked here so that the day somebody wires it
-- into `start_activity` or `submit_activity`, this migration stops being a no-op and starts being
-- a failure. Written as a check rather than a test because a migration that will not apply is
-- louder than a suite somebody can skip.

do $$
declare leaked text;
begin
  select string_agg(p.proname, ', ') into leaked
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and pg_get_functiondef(p.oid) ilike '%get_effective_now%'
     and p.proname not in ('get_effective_now', 'pause_dev_clock', 'play_dev_clock',
                           'set_dev_clock_h', 'reset_dev_clock_to_live');

  if leaked is not null then
    raise exception
      'The development clock has been wired into %. Every timestamp that function writes becomes '
      'deniable — an actual is only evidence while it comes from a clock nobody can move.', leaked;
  end if;
end $$;
