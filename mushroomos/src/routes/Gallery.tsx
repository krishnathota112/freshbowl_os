import { ACTIVITY_STATES, type Density } from '../domain/types';
import { FiveLayerNode } from '../components/node/FiveLayerNode';
import { PageHeading } from '../components/layout/AppShell';

/**
 * The regression surface for docs/UI_DESIGN_SPEC.md §6.
 * Every state x every density, both themes. If the node drifts, it shows here first.
 */

const DENSITIES: Density[] = ['operator', 'lab', 'supervisor', 'admin', 'manager', 'gm'];

const in90Min = () => new Date(Date.now() + 90 * 60 * 1000).toISOString();

export function Gallery() {
  return (
    <>
      <PageHeading
        title="Component gallery"
        subtitle="Every activity state × every density. Toggle the theme in the header — both must be complete."
      />

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
