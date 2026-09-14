import { ACTIVITY_STATES, type Density } from '../domain/types';
import { useQuery } from '@tanstack/react-query';
import { FiveLayerNode } from '../shared/ui/node/FiveLayerNode';
import { PageHeading } from '../shared/ui/layout/PageHeading';
import { Bar, Card, EmptyState, Skeleton, Stat } from '../shared/ui/primitives';
import { TimeLabel } from '../shared/ui/domain/TimeLabel';
import { HumanDuration, Variance } from '../shared/ui/domain/HumanDuration';
import { getFactoryClock, getPublishedBaseline } from '../shared/api/batch';
import { loadTower } from '../shared/api/tower';
import { HourRail } from '../shared/ui/composite/HourRail';
import { StaircaseCalendar } from '../shared/ui/composite/StaircaseCalendar';
import { fixtureActivities, fixtureStaircase, type FixtureGeometry } from '../fixtures';

/**
 * The regression surface for docs/UI_DESIGN_SPEC.md §6.
 * Every state x every density, both themes. If the node drifts, it shows here first.
 *
 * C1 adds the primitives harness. This route is L4, so it may query — the components it renders may
 * not, which is exactly the property that lets them be exercised from a fixture here and from a live
 * row on a real screen with no difference in the component.
 *
 * THE GEOMETRY IS READ, NEVER TYPED. `baselineHours` comes from `process_definition` and the clock
 * from `factory_clock`, because a process length written into this file would be a literal in src/
 * (invariant 8) and a wall clock invented here would be a fake (rule E.5).
 */

const DENSITIES: Density[] = ['operator', 'lab', 'supervisor', 'admin', 'manager', 'gm'];

const in90Min = () => new Date(Date.now() + 90 * 60 * 1000).toISOString();

function C1Primitives() {
  const baseline = useQuery({ queryKey: ['process-baseline'], queryFn: () => getPublishedBaseline() });
  const clock = useQuery({ queryKey: ['factory-clock'], queryFn: getFactoryClock });

  if (baseline.isLoading || clock.isLoading) {
    return <Skeleton label="Reading the baseline and the factory clock" lines={4} />;
  }
  if (!baseline.data) {
    return (
      <EmptyState
        title="No published process definition"
        detail="The hour registers need a baseline length, and it comes from process_definition. Seed s03 publishes PROCESS-2026B; run npm run db:seed."
      />
    );
  }

  const geometry: FixtureGeometry = {
    baselineHours: baseline.data.baselineHours,
    // Deliberately null: no deployed batch has an H0, because turning the factory's start hour into
    // an instant needs the timezone and TBD-50 is open. This is the live state, not a contrivance.
    startAt: null,
    timezone: clock.data?.timezone ?? null,
    timezoneConflictId: clock.data?.timezoneConflictId ?? 'TBD-50',
  };

  const midHour = Math.max(1, Math.floor(geometry.baselineHours / 2));
  const activities = fixtureActivities(geometry, midHour);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          TimeLabel · three registers, always together
        </p>
        <p className="mt-1 max-w-prose text-[12px] text-muted">
          Wall clock largest, batch position medium, scale smallest — UI_CONTROL_TOWER_SPEC §8.1.
          The first register is absent below because the factory timezone is unresolved; it names
          the conflict rather than showing the viewer&rsquo;s zone, which would move every
          batch-day boundary for anyone outside the factory.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-8">
          <TimeLabel {...geometry} hour={1} size="sm" />
          <TimeLabel {...geometry} hour={midHour} size="md" />
          <TimeLabel {...geometry} hour={geometry.baselineHours} size="lg" />
          <TimeLabel
            {...geometry}
            startAt={new Date().toISOString()}
            timezone={geometry.timezone ?? 'UTC'}
            hour={midHour}
            size="md"
          />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          The rightmost is the same hour with a zone supplied, so the difference between
          &ldquo;unknown&rdquo; and &ldquo;known&rdquo; is visible side by side. It is not a claim
          about the factory.
        </p>
      </Card>

      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          HumanDuration and Variance · spoken, never computed
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {activities.map((a) => (
            <div key={a.activityId} className="flex flex-col gap-1">
              <span className="mono text-[10px] text-muted">{a.scopeLabel}</span>
              <Variance minutes={a.varianceMinutes} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-6 text-[13px]">
          <span>
            74 min reads <HumanDuration minutes={74} />
          </span>
          <span>
            180 min reads <HumanDuration minutes={180} />
          </span>
          <span>
            0 reads <HumanDuration minutes={0} />
          </span>
        </div>
      </Card>

      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          Bar · material only, and Skeleton · says what is coming
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <Stat label="Loaded" value="17.5" unit="MT" compare="of 21.0 MT planned" />
            <div className="mt-2">
              <Bar kind="material" value={17.5} max={21} unit="MT" tone="ok" />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              There is no batch-progress form of this component. A batch percentage is banned —
              §8.3 — and the type has one legal kind so the compiler enforces it.
            </p>
          </div>
          <Skeleton label="Reading this batch's activities" lines={3} />
        </div>
      </Card>
    </div>
  );
}

/**
 * C2 against fixtures. The geometry comes from the published definition; the bars are built by
 * `src/fixtures`, which is a set of FUNCTIONS of that geometry and carries no hour of its own.
 *
 * The fixture clock deliberately has no H0 in one case and a supplied one in the other, so both the
 * placed and the unplaceable states are on screen side by side. A component that only ever renders
 * the happy path is a component whose empty state nobody has seen.
 */
function C2AgainstFixtures() {
  const baseline = useQuery({ queryKey: ['process-baseline'], queryFn: () => getPublishedBaseline() });
  const clock = useQuery({ queryKey: ['factory-clock'], queryFn: getFactoryClock });

  if (baseline.isLoading || clock.isLoading) {
    return <Skeleton label="Reading the baseline and the factory clock" lines={4} />;
  }
  if (!baseline.data) {
    return (
      <EmptyState
        title="No published process definition"
        detail="The rail needs a baseline length, and it comes from process_definition. Run npm run db:seed."
      />
    );
  }

  // A fixture H0 is supplied here so the placed form is visible even before A3's batches exist. It is
  // the gallery standing in for a batch, not a claim about one — the real section is below.
  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);

  const withH0: FixtureGeometry = {
    baselineHours: baseline.data.baselineHours,
    startAt: new Date(anchor.getTime() - 8 * 24 * 3_600_000).toISOString(),
    timezone: clock.data?.timezone ?? null,
    timezoneConflictId: clock.data?.timezoneConflictId ?? 'TBD-50',
  };
  const withoutH0: FixtureGeometry = { ...withH0, startAt: null };

  const staggerHours = 48;
  const bars = fixtureStaircase(withH0, staggerHours);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          StaircaseCalendar · three fixture bars
        </p>
        <p className="mt-1 max-w-prose text-[12px] text-muted">
          Sorted by H0, never re-sorted. One <span className="mono">now</span> line down the whole
          board. Resize below 768&nbsp;px and the diagonal becomes a vertical list rather than a
          sideways scroll.
        </p>
        <div className="mt-3">
          <StaircaseCalendar bars={bars} nowMs={Date.now()} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          HourRail · one fixture batch
        </p>
        <div className="mt-3">
          <HourRail bar={bars[0]} nowMs={Date.now()} varianceMinutes={200} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          HourRail · the same batch with no H0
        </p>
        <p className="mt-1 max-w-prose text-[12px] text-muted">
          The stated empty state, not a rail drawn at an assumed zero.
        </p>
        <div className="mt-3">
          <HourRail
            bar={{ ...bars[0], clock: { ...withoutH0 }, nowHour: null }}
            nowMs={Date.now()}
          />
        </div>
      </Card>
    </div>
  );
}

/** C2 against A3's real batches. Same components, no fixture in sight. */
function C2AgainstRealBatches() {
  const tower = useQuery({ queryKey: ['tower'], queryFn: loadTower });

  if (tower.isLoading) return <Skeleton label="Reading the live batches" lines={5} />;
  if (tower.error) {
    return (
      <EmptyState
        title="The live batches could not be read"
        detail={(tower.error as Error).message}
      />
    );
  }

  const bars = tower.data?.bars ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
          StaircaseCalendar · {bars.length} live {bars.length === 1 ? 'batch' : 'batches'}
        </p>
        <div className="mt-3">
          <StaircaseCalendar bars={bars} nowMs={Date.now()} />
        </div>
      </Card>

      {bars.length > 0 && (
        <Card className="p-4">
          <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
            HourRail · {bars[0].code}
          </p>
          <div className="mt-3">
            <HourRail bar={bars[0]} nowMs={Date.now()} />
          </div>
        </Card>
      )}
    </div>
  );
}

export function Gallery() {
  return (
    <>
      <PageHeading
        title="Component gallery"
        subtitle="Every activity state × every density. Toggle the theme in the header — both must be complete."
      />

      <section className="mb-8">
        <h2 className="mb-2 font-head text-sm font-800 uppercase tracking-wide">
          C1 · primitives, against read geometry
        </h2>
        <C1Primitives />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-head text-sm font-800 uppercase tracking-wide">
          C2 · the board and the rail, against fixtures
        </h2>
        <C2AgainstFixtures />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-head text-sm font-800 uppercase tracking-wide">
          C2 · the board and the rail, against the real batches
        </h2>
        <C2AgainstRealBatches />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-head text-sm font-800 uppercase tracking-wide">
          Edge cases that must never render blank
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FiveLayerNode
            title="Every layer null"
            subtitle="an em dash is information, not an omission"
            state="READY"
            layers={{ sop: null, plan: null, actual: null, evidence: null, decision: null }}
            density="admin"
          />
          <FiveLayerNode
            title="SOP bound absent, source cited"
            subtitle="no source gives a bound here"
            state="READY"
            layers={{
              sop: { text: '—', sourceRef: 'S4a gives no compost EC band' },
              plan: { text: 'record only' },
              actual: null,
              evidence: { text: '0 / 2' },
              decision: null,
            }}
            density="admin"
          />
          <FiveLayerNode
            title="Two sources disagree"
            subtitle="neither is chosen"
            state="READY"
            layers={{
              sop: {
                text: '68–69 % / 75–78 %',
                sourceRef: 'S1a 0A · S4a Table 2',
                conflictId: 'C-01',
              },
              plan: { text: 'operator chooses, reason mandatory', conflictId: 'C-29' },
              actual: null,
              evidence: { text: '0 / 2' },
              decision: null,
            }}
            density="admin"
          />
          <FiveLayerNode
            title="Waiting, with a live countdown"
            subtitle="Day 2 · FIB1-REST-1 · BUNKER_LINE"
            state="WAITING_TIME"
            blockedReason="Resting — required duration is a Day-0 value"
            unblocksAt={in90Min()}
            layers={{
              sop: { text: '—', sourceRef: 'W §4', conflictId: 'TBD-21' },
              plan: { text: 'Line 1 of 3' },
              actual: null,
              evidence: null,
              decision: null,
            }}
            density="supervisor"
          />
          <FiveLayerNode
            title="Blocked, reason on its face"
            subtitle="Day 8 · TR-T2 · PILE"
            state="BLOCKED"
            blockedReason="Locked — T1 not complete on Pile 2 of 3"
            layers={{
              sop: { text: '73–75 %', sourceRef: 'S1a P1B' },
              plan: { text: 'TURNER-02 · 6–8 h' },
              actual: null,
              evidence: { text: '0 / 2' },
              decision: null,
            }}
            density="supervisor"
          />
          {/*
            Deliberately malformed: a non-actionable state with no reason. The component
            renders a loud defect marker rather than a silent grey card, because a missing
            reason is a seed bug.
          */}
          <FiveLayerNode
            title="Defect case — no reason supplied"
            subtitle="the component refuses to hide this"
            state="DEVIATION"
            layers={{ sop: null, plan: null, actual: null, evidence: null, decision: null }}
            density="supervisor"
          />
          <FiveLayerNode
            title="Variance and a decision"
            subtitle="Day 1 · FIB1-BUNK-LOAD · BUNKER_LINE"
            state="COMPLETED"
            layers={{
              sop: { text: 'fill 2.6–2.7 m (max 2.8)', sourceRef: 'S1a 0B' },
              plan: { text: '2.7 m · Bunker 3 · JCB-02 · 2 h' },
              actual: {
                text: '2.9 m · 14:20 → 17:07 · 2 h 47',
                tone: 'warn',
                annotations: ['+0.2 m', '+47 min'],
              },
              evidence: { text: '2 / 2', tone: 'ok' },
              decision: {
                text: 'Released with deviation — Ramarao',
                tone: 'warn',
                annotations: ['D-11 open'],
              },
            }}
            density="supervisor"
          />
        </div>
      </section>

      {DENSITIES.map((density) => (
        <section key={density} className="mb-8">
          <h2 className="mb-2 font-head text-sm font-800 uppercase tracking-wide">
            density · {density}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ACTIVITY_STATES.map((state) => (
              <FiveLayerNode
                key={state}
                title="Bagasse Bunker Loading"
                subtitle="Day 1 · FIB1-BUNK-LOAD · BUNKER_LINE"
                instanceLabel="Line 1 of 3"
                state={state}
                blockedReason={`Reason string generated from the gate that failed (${state})`}
                unblocksAt={state === 'WAITING_TIME' ? in90Min() : undefined}
                layers={{
                  sop: { text: 'fill 2.6–2.7 m', sourceRef: 'S1a 0B' },
                  plan: { text: '2.7 m · Bunker 3 · 2 h' },
                  actual:
                    state === 'COMPLETED'
                      ? { text: '2.65 m · 2 h 12', tone: 'ok' }
                      : state === 'IN_PROGRESS'
                        ? { text: 'running 1 h 04' }
                        : null,
                  evidence: { text: state === 'COMPLETED' ? '2 / 2' : '0 / 2' },
                  decision: state === 'COMPLETED' ? { text: 'Released — Ramarao', tone: 'ok' } : null,
                }}
                density={density}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
