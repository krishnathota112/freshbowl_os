-- 0030 · Let Admin state the hour THIS batch actually starts.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS THERE, AND WHY IT IS BEING CHANGED
--
-- `create_master_batch` has taken `p_start_at` since 0011, and a test asserts an explicitly
-- supplied H0 beats the factory default. The capability has always existed. What did not exist was
-- a way for a person to use it: the New Batch screen printed the factory clock's hour as read-only,
-- with a note saying "no override is offered - Book1 shows all three batches starting in the same
-- hour-of-day slot and no source describes a batch starting anywhere else."
--
-- That reading of Book1 is accurate and the conclusion drawn from it was too strong. Book1 records
-- what three PLANNED batches did. It is not a rule that no batch may begin at any other hour, and
-- the factory routinely will: a truck arrives late, a bunker is not clear, the crew starts at 07:00
-- instead of 05:00.
--
-- Forcing 05:00 onto a batch that began at 07:00 does not keep the record clean - it puts EVERY
-- subsequent hour of that batch two hours out, silently, for its whole life. The standard stays the
-- default; stating something else is a decision, and the decision is recorded.
-- ─────────────────────────────────────────────────────────────────────────────

-- The instant of a given date and wall-clock time IN THE FACTORY'S ZONE.
--
-- The browser must not compute this. Turning "5 June, 07:00 in Asia/Kolkata" into an instant needs
-- that zone's offset on that date, and the usual client-side trick - format to a string, parse it
-- back - is fragile and silently wrong across a DST boundary. The database already knows the zone,
-- so it does the arithmetic and the UI asks for the answer.
--
-- Sibling of `factory_h0_instant`, which does exactly this for the clock's OWN hour.
create or replace function public.factory_instant(p_date date, p_time time)
returns timestamptz language plpgsql stable set search_path = public as $$
declare tz text;
begin
  if p_date is null or p_time is null then return null; end if;

  select timezone into tz from factory_clock where id = 1;
  if tz is null then
    -- The same refusal `factory_h0_instant` makes: no zone means no wall clock, and guessing one
    -- would place the batch against the wrong day boundary for its whole life.
    return null;
  end if;

  return (p_date + p_time) at time zone tz;
end;
$$;

grant execute on function public.factory_instant(date, time) to authenticated;

comment on function public.factory_instant(date, time) is
  'A date and a factory-local wall-clock time as an absolute instant. Returns NULL when the factory '
  'timezone is unset, exactly as factory_h0_instant does - never a guess against the server zone.';
