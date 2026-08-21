import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  loadConflicts,
  loadMaterialRoles,
  loadProcessDefinition,
} from '../api/processDefinition';
import { evaluateCardinality, type BatchConfigView } from '../domain/cardinality';
import { tryResolveLabel } from '../domain/label';
import type { ProcessActivity, StreamCode } from '../domain/types';
import { FiveLayerNode } from '../components/node/FiveLayerNode';
import { PageHeading } from '../components/layout/AppShell';
import { Bar, Card, Chip, ConflictMarker, EmptyState, NumberInput, Stat } from '../components/primitives';

/**
 * The process explorer. Read-only.
 *
 * Renders PROCESS-2026B entirely from the database and runs the pure evaluators over it.
 * Three controls make the load-bearing architecture claims visible rather than only
 * queryable:
 *
 *   role lead      → the whole stream relabels, with no code change   (check 14)
 *   load plan      → 21/2 gives 11, 21/2.5 gives 9, tail carries 1 MT (check 13)
 *   T1 → T2        → SAME_SCOPE_INSTANCE against a global barrier     (check 7/15)
 */

const STREAM_LABEL: Record<StreamCode, string> = {
  PRIMARY_FIBRE: 'Primary fibre',
  SECONDARY_FIBRE: 'Secondary fibre',
  STRUCTURAL_STRAW: 'Structural straw',
  NITROGEN_MINERAL: 'Nitrogen + mineral',
  YARD: 'Yard',
  BUNKER: 'Bunker',
  TUNNEL: 'Tunnel',
};

const STREAM_ORDER: StreamCode[] = [
  'PRIMARY_FIBRE',
  'SECONDARY_FIBRE',
  'STRUCTURAL_STRAW',
  'NITROGEN_MINERAL',
  'YARD',
  'BUNKER',
  'TUNNEL',
];

/** The Day-0 answers. Every count the process needs comes from here, never from code. */
const DEFAULT_CONFIG: BatchConfigView = {
  primary_fibre_required_mt: 21,
  expected_load_capacity_mt: 2,
  bunker_line_count: 3,
  yard_pile_count: 2,
  mixed_pile_count: 1,
  straw_pile_count: 2,
  straw_bunker_count: 1,
  tunnel_count: 3,
  // 1 mixed pile + 2 straw piles = the 3 piles the turner works. TBD-19.
  turner_pile_count: 3,
};

export function ProcessExplorer() {
  const [config, setConfig] = useState<BatchConfigView>(DEFAULT_CONFIG);
  const [leadOverride, setLeadOverride] = useState<Record<string, string>>({});

  const def = useQuery({
    queryKey: ['process', 'PROCESS-2026B'],
    queryFn: () => loadProcessDefinition('PROCESS-2026B'),
  });
  const roles = useQuery({ queryKey: ['material-roles'], queryFn: loadMaterialRoles });
  const conflicts = useQuery({ queryKey: ['conflicts'], queryFn: loadConflicts });

  /** role → the material name that labels its stream. */
  const roleLead = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of roles.data ?? []) {
      const chosenId = leadOverride[r.role] ?? r.leadId;
      const mat = r.materials.find((m) => m.id === chosenId);
      if (mat) map[r.role] = mat.name;
    }
    return map;
  }, [roles.data, leadOverride]);

  if (def.isLoading || roles.isLoading) {
    return <p className="text-sm text-muted">Loading the process definition…</p>;
  }
  if (def.error) {
    return (
      <EmptyState
        title="Could not read the process definition"
        detail={`${(def.error as Error).message}. Reference tables are readable by any signed-in role, so this is likely a connection problem rather than a permission one.`}
      />
    );
  }

  const tree = def.data!;
  const byStream = STREAM_ORDER.map((s) => ({
    stream: s,
    activities: tree.activities.filter((a) => a.stream === s),
  })).filter((g) => g.activities.length > 0);

  const emptyStreams = STREAM_ORDER.filter(
    (s) => !tree.activities.some((a) => a.stream === s)
  );

  return (
    <>
      <PageHeading
        title="Process definition"
        subtitle={`${tree.code} · ${tree.anchorDayLabel} · Day 0 to Day ${tree.totalDays} · ${tree.activities.length} activity templates`}
        right={<Chip tone={tree.status === 'published' ? 'ok' : 'lock'}>{tree.status}</Chip>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4">
          <RoleLeadPanel
            roles={roles.data ?? []}
            leadOverride={leadOverride}
            onChange={(role, id) => setLeadOverride((p) => ({ ...p, [role]: id }))}
          />
          <LoadPlanPanel
            config={config}
            activity={tree.activities.find((a) => a.code === 'FIB1-WEIGH')}
            roleLead={roleLead}
            onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
          />
          <DependencyPanel config={config} />
          <StructurePanel config={config} onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))} />
        </aside>

        <section className="flex flex-col gap-5">
          {byStream.map((group) => (
            <StreamColumn
              key={group.stream}
              stream={group.stream}
              activities={group.activities}
              config={config}
              roleLead={roleLead}
              conflicts={conflicts.data}
              evidenceCount={(id) =>
                tree.evidence.filter((e) => e.process_activity_id === id).length
              }
              gatesFor={(id) => tree.gates.filter((g) => g.process_activity_id === id)}
              variantsFor={(id) => tree.variants.filter((v) => v.process_activity_id === id)}
            />
          ))}

          {emptyStreams.length > 0 && (
            <EmptyState
              title={`${emptyStreams.map((s) => STREAM_LABEL[s]).join(', ')} — defined, no activities seeded`}
              detail="The stream exists in the schema so it can be enabled without a migration. Its activities are not seeded because the factory has not yet confirmed them (TBD-39). Binding a material to the role is what would switch it on."
            />
          )}
        </section>
      </div>
    </>
  );
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <Card className="p-3">
      <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">{title}</p>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function RoleLeadPanel({
  roles,
  leadOverride,
  onChange,
}: {
  roles: { role: string; materials: { id: string; name: string }[]; leadId: string | null }[];
  leadOverride: Record<string, string>;
  onChange: (role: string, materialId: string) => void;
}) {
  return (
    <Panel
      title="Material role binding"
      note="The process names no material. Change the lead and every label in that stream follows. Same activity codes, same gates, no code change."
    >
      <div className="flex flex-col gap-2.5">
        {roles
          .filter((r) => r.materials.length > 0)
          .map((r) => (
            <label key={r.role} className="flex flex-col gap-1">
              <span className="mono text-[10px] text-muted">{r.role}</span>
              <select
                value={leadOverride[r.role] ?? r.leadId ?? ''}
                onChange={(e) => onChange(r.role, e.target.value)}
                className="rounded border bg-surface px-2 py-1.5 text-[12px]"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
              >
                <option value="">— not bound —</option>
                {r.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>
    </Panel>
  );
}

function LoadPlanPanel({
  config,
  activity,
  roleLead,
  onChange,
}: {
  config: BatchConfigView;
  activity: ProcessActivity | undefined;
  roleLead: Record<string, string>;
  onChange: (patch: BatchConfigView) => void;
}) {
  if (!activity) return null;
  const result = evaluateCardinality(activity.cardinality_rule, config);
  const qty = Number(config.primary_fibre_required_mt ?? 0);
  const lead = activity.material_role ? roleLead[activity.material_role] : undefined;
  const title = tryResolveLabel(activity.label_template, { role_lead: lead });

  return (
    <Panel
      title="Load plan"
      note="The instance count is derived, never typed and never stored as a constant."
    >
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink2">Required</span>
          <NumberInput
            value={qty}
            step={0.5}
            unit="MT"
            onChange={(n) => onChange({ primary_fibre_required_mt: n })}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink2">Load capacity</span>
          <NumberInput
            value={Number(config.expected_load_capacity_mt ?? 0)}
            step={0.5}
            unit="MT"
            onChange={(n) => onChange({ expected_load_capacity_mt: n })}
          />
        </label>
      </div>

      {result.ok ? (
        <>
          <div className="mt-3 flex items-end justify-between">
            <Stat
              label="Loads to plan"
              value={result.instances.length}
              compare={`ceil(${qty} / ${config.expected_load_capacity_mt})`}
              size="lg"
              tone="ok"
            />
            <Stat
              label="Tail load"
              value={result.instances.at(-1)?.plannedQuantityMt ?? '—'}
              unit="MT"
              compare="remainder, not a full load"
            />
          </div>
          <div className="mt-3">
            <Bar value={result.instances.length} max={Math.max(result.instances.length, 12)} />
          </div>
          <p className="mt-2 mono text-[11px] leading-relaxed text-muted">
            {title.ok ? title.text : activity.label_template} ·{' '}
            {result.instances
              .slice(0, 4)
              .map((i) => `${i.plannedQuantityMt}`)
              .join(' · ')}
            {result.instances.length > 4 ? ` … ${result.instances.at(-1)?.plannedQuantityMt}` : ''}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--crit)' }}>
          {result.error.message}
        </p>
      )}
    </Panel>
  );
}

function DependencyPanel({ config }: { config: BatchConfigView }) {
  const piles = Number(config.turner_pile_count ?? 0);
  const perPass = 7; // midpoint of the 6–8 h band the walkthrough gives
  const scoped = piles > 0 ? perPass * 2 + (piles - 1) * perPass : 0;
  const barrier = piles * perPass * 2;

  return (
    <Panel
      title="T1 → T2 dependency"
      note="T2 on a pile waits on THAT pile's T1, not on all of them. Building it as a global barrier is a failed build."
    >
      <div className="flex flex-col gap-1">
        {Array.from({ length: piles }, (_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="mono w-14 shrink-0 text-[10px] text-muted">Pile {i + 1}</span>
            <span style={{ width: i * 14 }} />
            <span
              className="rounded-sm px-1.5 py-0.5 mono text-[10px]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
            >
              T1
            </span>
            <span
              className="rounded-sm px-1.5 py-0.5 mono text-[10px]"
              style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}
            >
              T2
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="SAME_SCOPE_INSTANCE" value={scoped} unit="h" tone="ok" compare="what the factory does" />
        <Stat label="ALL_INSTANCES" value={barrier} unit="h" tone="crit" compare="the wrong model" />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Two turners are required for this. The resource plan gives T1 and T2 distinct turner
        hints so one machine cannot satisfy both.
      </p>
    </Panel>
  );
}

function StructurePanel({
  config,
  onChange,
}: {
  config: BatchConfigView;
  onChange: (patch: BatchConfigView) => void;
}) {
  const fields: { key: string; label: string }[] = [
    { key: 'bunker_line_count', label: 'Bunker lines' },
    { key: 'yard_pile_count', label: 'Yard piles' },
    { key: 'straw_pile_count', label: 'Straw piles' },
    { key: 'turner_pile_count', label: 'Piles at turner' },
    { key: 'tunnel_count', label: 'Tunnels' },
  ];
  return (
    <Panel title="Structure" note="Change any count and the instance totals below follow.">
      <div className="flex flex-col gap-2">
        {fields.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink2">{f.label}</span>
            <NumberInput
              value={Number(config[f.key] ?? 0)}
              step={1}
              onChange={(n) => onChange({ [f.key]: n })}
            />
          </label>
        ))}
      </div>
    </Panel>
  );
}

function StreamColumn({
  stream,
  activities,
  config,
  roleLead,
  conflicts,
  evidenceCount,
  gatesFor,
  variantsFor,
}: {
  stream: StreamCode;
  activities: ProcessActivity[];
  config: BatchConfigView;
  roleLead: Record<string, string>;
  conflicts: Map<string, { question: string }> | undefined;
  evidenceCount: (id: string) => number;
  gatesFor: (id: string) => { kind: string; predecessor_binding: string | null; is_enabled: boolean; blocked_reason_template: string; conflict_id: string | null; phase: string }[];
  variantsFor: (id: string) => { code: string; label: string; auto_select_enabled: boolean; conflict_id: string | null }[];
}) {
  const totalInstances = activities.reduce((sum, a) => {
    const r = evaluateCardinality(a.cardinality_rule, config);
    return sum + (r.ok ? r.instances.length : 0);
  }, 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="font-head text-sm font-800 uppercase tracking-wide">
          {STREAM_LABEL[stream]}
        </h2>
        <span className="mono text-[11px] text-muted">
          {activities.length} templates · {totalInstances} instances
        </span>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        {activities.map((a) => {
          const lead = a.material_role ? roleLead[a.material_role] : undefined;
          const label = tryResolveLabel(a.label_template, { role_lead: lead });
          const card = evaluateCardinality(a.cardinality_rule, config);
          const gates = gatesFor(a.id);
          const variants = variantsFor(a.id);
          const evCount = evidenceCount(a.id);

          const duration =
            a.duration_target_min_hr && a.duration_target_max_hr
              ? a.duration_target_min_hr === a.duration_target_max_hr
                ? `${a.duration_target_min_hr} h`
                : `${a.duration_target_min_hr}–${a.duration_target_max_hr} h`
              : null;

          const scopedGate = gates.find((g) => g.predecessor_binding === 'SAME_SCOPE_INSTANCE');

          return (
            <div key={a.id} className="flex flex-col gap-1">
              <FiveLayerNode
                title={
                  label.ok
                    ? label.text
                    : `${a.label_template}  ⚠ unresolved {${label.placeholder}}`
                }
                subtitle={`Day ${a.rel_day} · ${a.code} · ${a.scope}`}
                instanceLabel={card.ok ? `${card.instances.length} instance${card.instances.length === 1 ? '' : 's'}` : 'config error'}
                state={a.is_time_gate ? 'WAITING_TIME' : 'READY'}
                blockedReason={
                  a.is_time_gate
                    ? a.duration_required_at_day0 && !duration
                      ? 'Rest duration is a required Day-0 value — the factory has not stated the hours'
                      : `Rest period${duration ? ` — target ${duration}` : ''}`
                    : undefined
                }
                layers={{
                  sop: duration
                    ? { text: duration, sourceRef: a.source_ref, tone: 'muted' }
                    : { text: '—', sourceRef: a.source_ref, conflictId: a.tbd_marker ?? undefined },
                  plan: card.ok
                    ? {
                        text: card.instances
                          .slice(0, 3)
                          .map((i) => i.scopeLabel)
                          .join(' · ') + (card.instances.length > 3 ? ' …' : ''),
                      }
                    : { text: card.error.message, tone: 'crit' },
                  actual: null,
                  evidence: { text: `0 / ${evCount}`, tone: evCount > 0 ? 'muted' : undefined },
                  decision: null,
                }}
                density="admin"
              />

              <div className="flex flex-wrap items-center gap-1.5 pl-1">
                <span className="mono text-[10px] text-muted">
                  {(a.cardinality_rule as { kind: string }).kind}
                </span>
                {scopedGate && <Chip tone="ok">SAME_SCOPE_INSTANCE</Chip>}
                {variants.length > 0 && (
                  <Chip tone={variants.some((v) => v.auto_select_enabled) ? 'crit' : 'warn'}>
                    {variants.length} variants · auto{' '}
                    {variants.some((v) => v.auto_select_enabled) ? 'ON' : 'OFF'}
                  </Chip>
                )}
                {gates.some((g) => !g.is_enabled) && (
                  <Chip tone="lock">
                    {gates.filter((g) => !g.is_enabled).length} gate(s) disabled
                  </Chip>
                )}
                {a.tbd_marker && (
                  <ConflictMarker
                    id={a.tbd_marker}
                    note={conflicts?.get(a.tbd_marker)?.question}
                  />
                )}
                {a.golden_rule && (
                  <span className="text-[10px] italic text-muted" title={a.golden_rule}>
                    golden rule
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
