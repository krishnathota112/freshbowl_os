/**
 * THE PARAGRAPH.  `UI_CONTROL_TOWER_SPEC §11`.
 *
 * "The highest-value feature in the management layer and it is nearly free." The factory already
 * writes this by hand after every batch (`S3a`–`S3f`); every fact in it is now a column.
 *
 * L3 — takes data as props. No query, no `api/`. It renders identically from a fixture and from a
 * live row, which is what lets the gallery be the regression surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * §11.2, AND WHAT EACH RULE COSTS TO KEEP
 *
 * · GENERATED FROM THE RECORD, NEVER AUTHORED. There is no template string with a blank in it that
 *   gets filled with a guess. Every clause below is guarded by the presence of the fact it states,
 *   and a missing fact removes the clause rather than softening it.
 *
 * · NAMES PEOPLE AND MACHINES. "The operator" is useless; "Ravi with JCB-02" is accountability.
 *   Where `person` is null the paragraph SAYS SO — an unattributed delay is a finding, not a gap
 *   to paper over.
 *
 * · QUOTES THE REASON VERBATIM. `cause` is rendered exactly as recorded, inside quotation marks.
 *   Never summarised, sentence-cased or truncated: a supervisor's own words carry more weight than
 *   any status chip, and editing them makes them somebody else's words.
 *
 * · NAMES THE CONFLICT. 0024 put `tbd_marker` on the contributor row for this sentence alone.
 *   Without it a GM reading a disputed value concludes the system judged it acceptable. It did
 *   not — two sources disagree and nobody has decided.
 *
 * · NULL IS NOT ZERO. A batch with nothing measured reads "nothing has been recorded against it
 *   yet", never "on plan". `UI_ACCEPTANCE_CRITERIA §E` item 4.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY
 *   · a percentage complete (§8.3, and rule E.1 fails the workstream for it)
 *   · a forecast stated as a fact — the finish line is prefixed "at this rate", and it appears only
 *     when there is a measured variance to project
 *   · anything about a stream other than the worst one, because the headline came from that stream
 *     and minutes from elsewhere do not add up to it
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { BatchBar, BatchVariance, Contributor } from '../../../domain/contracts';
import { batchInstant } from '../../../domain/time';
import { humanDuration } from '../domain/HumanDuration';
import { ConflictMarker } from '../primitives';

export type NarrativeProps = {
  bar: BatchBar;
  variance: BatchVariance;
  /**
   * Scrub the shared playhead to an hour. §11.2's "every noun is a link" — until the evidence
   * panel lands (S3) the link moves the playhead, which is a real navigation rather than a stub.
   */
  onScrubToHour?: (hour: number) => void;
  /** S3's panel. Optional: the noun is still a link without it, it just scrubs and stops there. */
  onOpenActivity?: (activityId: string) => void;
};

export function Narrative({ bar, variance, onScrubToHour, onOpenActivity }: NarrativeProps) {
  const { varianceMinutes, contributors, remainderMinutes } = variance;

  const open = (c: Contributor) => {
    if (c.baselineStartHour !== null) onScrubToHour?.(c.baselineStartHour);
    onOpenActivity?.(c.activityId);
  };

  return (
    <p className="max-w-[70ch] text-[14px] leading-[1.75]" style={{ color: 'var(--ink)' }}>
      <Headline code={bar.code} variance={variance} />

      {varianceMinutes !== null &&
        contributors.map((c, i) => (
          <Clause
            key={c.activityId}
            c={c}
            index={i}
            headline={varianceMinutes}
            onOpen={() => open(c)}
          />
        ))}

      {varianceMinutes !== null && remainderMinutes !== 0 && (
        <>
          {' '}
          The rest of the {streamName(variance.worstStream)} stream accounts for{' '}
          <strong>{humanDuration(remainderMinutes)}</strong>
          {remainderMinutes < 0 ? ' recovered' : ''}.
        </>
      )}

      <Verdicts variance={variance} />
      <Finish bar={bar} varianceMinutes={varianceMinutes} />
    </p>
  );
}

/* ── 1 · the headline ───────────────────────────────────────────────────────────────────────── */

function Headline({ code, variance }: { code: string; variance: BatchVariance }) {
  const { varianceMinutes, measuredCount, activityCount, worstStream } = variance;

  // NOTHING MEASURED. Not "on plan" — the two are different answers, and 0019 was rewritten
  // specifically so the database could tell them apart. Throwing that away here would undo it.
  if (varianceMinutes === null) {
    return (
      <>
        <strong>Nothing has been recorded against {code} yet</strong>, so there is nothing to
        compare it against.{' '}
        {activityCount > 0
          ? `Its plan has ${activityCount} activities and none of them has both a planned and an actual end.`
          : 'It has no plan yet either.'}
      </>
    );
  }

  const measured =
    activityCount > 0 ? ` Measured on ${measuredCount} of ${activityCount} activities.` : '';

  if (varianceMinutes === 0) {
    return (
      <>
        <strong>{code} is running exactly to plan.</strong>
        {measured}
      </>
    );
  }

  const behind = varianceMinutes > 0;
  return (
    <>
      <strong>
        {code} is {humanDuration(varianceMinutes)} {behind ? 'behind' : 'ahead of'} plan
      </strong>
      {/*
        "the slowest of the four" is what this said, and four is a NUMBER THIS FILE DOES NOT KNOW.
        `PROCESS-2026B` has four streams today; the stream list comes from the process definition
        and a fifth would make the sentence false without anything failing. Same class as the
        baseline-hours literal rule 4 bans, in prose instead of code.
      */}
      , on the {streamName(worstStream)} stream — the slowest one, which is the one that sets the
      batch.{measured}
    </>
  );
}

/* ── 2 · where the time went, one contributor at a time ─────────────────────────────────────── */

function Clause({
  c,
  index,
  headline,
  onOpen,
}: {
  c: Contributor;
  index: number;
  headline: number;
  onOpen: () => void;
}) {
  // "Most of it" is a claim about proportion, so it is only made when it is true.
  const lead =
    index === 0
      ? headline !== 0 && Math.abs(c.varianceMinutes) >= Math.abs(headline) / 2
        ? 'Most of it — '
        : 'The largest single piece — '
      : 'A further ';
  const tail = index === 0 ? ' — came from ' : ' came from ';

  return (
    <>
      {' '}
      {lead}
      <strong>{humanDuration(c.varianceMinutes)}</strong>
      {tail}
      <button
        type="button"
        onClick={onOpen}
        className="underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline focus-visible:outline-1"
        style={{ color: 'var(--accent-ink)' }}
      >
        {c.title} · {c.scopeLabel}
      </button>
      {c.person !== null ? (
        <>
          , run by <strong>{c.person}</strong>
          {c.machine !== null ? (
            <>
              {' '}
              with <strong>{c.machine}</strong>
            </>
          ) : null}
        </>
      ) : (
        // An unattributed delay is a finding. Saying nothing would hide the question.
        <>, with nobody recorded against it</>
      )}
      {c.cause !== null ? (
        <>
          {' '}
          — <q className="italic">{c.cause}</q>
        </>
      ) : (
        // 0019's own words: a null cause means the delay has no explanation on file, and that is
        // exactly the question a GM should be asking.
        <>, and no reason was recorded for it</>
      )}
      {c.conflictId !== null && (
        <>
          {' '}
          <ConflictMarker
            id={c.conflictId}
            note="The sources disagree on this activity, and the system did not judge the value. It is carried as recorded, with the conflict named."
          />
        </>
      )}
      {c.hasOpenDeviation && <> A deviation on it still stands on the record.</>}.
    </>
  );
}

/* ── 3 · what is waiting on a person ────────────────────────────────────────────────────────── */

function Verdicts({ variance }: { variance: BatchVariance }) {
  const { deviationsAwaitingVerdict, deviationsOnRecord } = variance;
  if (deviationsOnRecord === 0 && deviationsAwaitingVerdict === 0) return null;

  /*
    ONE SET, STATED ONCE. The awaiting-a-verdict deviations are a SUBSET of the ones standing on
    the record — 0017 defines `awaiting_verdict` as state in (open, escalated) and
    `stands_on_record` as state in (open, escalated, accepted), so every open deviation satisfies
    both flags.

    Written as two sentences it read:

        "3 deviations are waiting on a verdict. 3 stand on the record for this batch."

    which any reader totals to six. Found by opening the page; no test caught it, because both
    numbers were individually correct. Two correct numbers can still make a false sentence, and
    the paragraph's whole value is that a GM can act on it without checking it.
  */
  const settled = Math.max(0, deviationsOnRecord - deviationsAwaitingVerdict);

  return (
    <>
      {' '}
      <strong style={{ color: deviationsAwaitingVerdict > 0 ? 'var(--warn)' : undefined }}>
        {deviationsOnRecord} deviation{deviationsOnRecord === 1 ? '' : 's'}
      </strong>{' '}
      stand{deviationsOnRecord === 1 ? 's' : ''} on the record
      {deviationsAwaitingVerdict > 0 ? (
        <>
          , {deviationsAwaitingVerdict === deviationsOnRecord ? 'all' : deviationsAwaitingVerdict} of
          them still waiting on a supervisor's verdict
        </>
      ) : (
        <>, all of them already decided</>
      )}
      {settled > 0 && deviationsAwaitingVerdict > 0 ? <> and {settled} accepted</> : null}.
    </>
  );
}

/* ── 4 · the finish line, prefixed so it cannot be read as a fact ───────────────────────────── */

function Finish({ bar, varianceMinutes }: { bar: BatchBar; varianceMinutes: number | null }) {
  const { startAt, baselineHours, timezone } = bar.clock;

  // A forecast needs an H0, a scale, a zone to state it in, and something measured to project.
  // Missing any one of them, the sentence is omitted rather than approximated.
  if (startAt === null || baselineHours <= 0 || timezone === null || varianceMinutes === null) {
    return null;
  }

  const planned = batchInstant(baselineHours, startAt);
  const forecast = new Date(planned.getTime() + varianceMinutes * 60_000);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      hour12: true,
      timeZone: timezone,
    })
      .format(d)
      .replace(/\s+/g, ' ')
      .trim();

  if (varianceMinutes === 0) {
    return (
      <>
        {' '}
        It finishes <strong>{fmt(planned)}</strong>, as planned.
      </>
    );
  }

  return (
    <>
      {' '}
      At this rate it finishes <strong>{fmt(forecast)}</strong> — about{' '}
      {humanDuration(varianceMinutes)} {varianceMinutes > 0 ? 'after' : 'before'} the planned{' '}
      {fmt(planned)}.
    </>
  );
}

/**
 * Stream names come out of the enum as `PRIMARY_FIBRE`. The paragraph is prose, so it is spoken —
 * but the mapping is mechanical lowercasing, NOT a lookup table of friendly names. A table would
 * silently render an unknown stream as blank the first time the process definition gained one.
 */
function streamName(s: string | null): string {
  return s === null ? 'slowest' : s.toLowerCase().replace(/_/g, ' ');
}
