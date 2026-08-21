import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { loadMaterialRoles } from '../api/processDefinition';
import {
  DEFAULT_STRUCTURE,
  STRUCTURE_QUESTIONS,
  createBatch,
  type RoleBindingInput,
} from '../api/batch';
import { evaluateCardinality } from '../domain/cardinality';
import type { CardinalityRule } from '../domain/types';
import { PageHeading } from '../components/layout/AppShell';
import { Card, Chip, ConflictMarker, NumberInput, Stat } from '../components/primitives';

/**
 * Start a batch. Four short steps, then a review.
 *
 * The questions are only the ones the process cannot answer for itself: what the batch is
 * called, which materials it uses, how much and how many, and the rest durations the factory
 * has never written down. Everything else — every activity, every task, every evidence
 * requirement — is generated from the process definition.
 */

const STEPS = ['Identity', 'Materials', 'Quantities', 'Rest periods', 'Review'] as const;

type RestActivity = {
  code: string;
  title: string;
  rel_day: number;
  tbd_marker: string | null;
  question: string | null;
  span: string | null;
  min_hr: number | null;
  max_hr: number | null;
};

/** Stored in hours. Entered in whichever unit reads naturally. */
type RestValue = { amount: number | ''; unit: 'min' | 'h' };

const toHours = (v: RestValue): number | null =>
  v.amount === '' ? null : v.unit === 'min' ? Number(v.amount) / 60 : Number(v.amount);

export function NewBatch() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const today = new Date();
  const [code, setCode] = useState(
    `MB-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );
  const [startDate, setStartDate] = useState(today.toISOString().slice(0, 10));
  const [supervisor, setSupervisor] = useState('Ramarao');
  const [weather, setWeather] = useState('');
  const [structure, setStructure] = useState<Record<string, number>>({ ...DEFAULT_STRUCTURE });
  const [leads, setLeads] = useState<Record<string, string>>({});
  const [rests, setRests] = useState<Record<string, RestValue>>({});
  const [error, setError] = useState<string | null>(null);

  const roles = useQuery({ queryKey: ['material-roles'], queryFn: loadMaterialRoles });

  // The rest activities, and the weighment rule, read from the definition.
  const meta = useQuery({
    queryKey: ['process-meta'],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from('process_activity')
        .select(
          'code, label_template, rel_day, is_time_gate, tbd_marker, cardinality_rule, material_role, admin_question, day_span_label, duration_target_min_hr, duration_target_max_hr'
        )
        .order('seq');
      if (e) throw e;
      return data ?? [];
    },
  });

  // Default the role leads once the eligibility list arrives.
  const rolesReady = roles.data ?? [];
  if (rolesReady.length > 0 && Object.keys(leads).length === 0) {
    const initial: Record<string, string> = {};
    for (const r of rolesReady) if (r.leadId) initial[r.role] = r.leadId;
    if (Object.keys(initial).length) setLeads(initial);
  }

  const restActivities: RestActivity[] = useMemo(
    () =>
      (meta.data ?? [])
        .filter((a) => a.is_time_gate)
        .map((a) => ({
          code: a.code,
          title: (a.label_template as string).replace('{role_lead}', 'Material'),
          rel_day: a.rel_day as number,
          tbd_marker: (a.tbd_marker as string) ?? null,
          question: (a.admin_question as string) ?? null,
          span: (a.day_span_label as string) ?? null,
          min_hr: (a.duration_target_min_hr as number) ?? null,
          max_hr: (a.duration_target_max_hr as number) ?? null,
        })),
    [meta.data]
  );

  const weighRule = (meta.data ?? []).find((a) => a.code === 'FIB1-WEIGH')
    ?.cardinality_rule as CardinalityRule | undefined;

  const loadPreview = weighRule ? evaluateCardinality(weighRule, structure) : null;

  /** How many task instances this configuration will produce. */
  const instancePreview = useMemo(() => {
    if (!meta.data) return null;
    let total = 0;
    for (const a of meta.data) {
      const role = a.material_role as string | null;
      if (role && !leads[role]) continue; // stream not enabled
      const r = evaluateCardinality(a.cardinality_rule as CardinalityRule, structure);
      if (r.ok) total += r.instances.length;
    }
    return total;
  }, [meta.data, structure, leads]);

  const materialCodeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rolesReady) for (const mat of r.materials) m.set(mat.id, mat.code);
    return m;
  }, [rolesReady]);

  const materialNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rolesReady) for (const mat of r.materials) m.set(mat.id, mat.name);
    return m;
  }, [rolesReady]);

  // Unanswered means blank OR zero. A zero-hour rest would open the instant it started,
  // which is not an answer — it is the absence of one.
  const missingRests = restActivities.filter((r) => {
    const hrs = rests[r.code] ? toHours(rests[r.code]) : null;
    return hrs === null || hrs <= 0;
  });

  const create = useMutation({
    mutationFn: async () => {
      const roleInput: RoleBindingInput[] = Object.entries(leads)
        .filter(([, id]) => id)
        .map(([role, id]) => ({
          role,
          material_code: materialCodeById.get(id) ?? '',
          lead: true,
        }))
        .filter((r) => r.material_code);

      const config: Record<string, number | string> = { ...structure };
      for (const [c, v] of Object.entries(rests)) {
        const hrs = toHours(v);
        if (hrs !== null && hrs > 0) config['rest_hr_' + c] = hrs;
      }

      return createBatch({
        code,
        label: code,
        start_date: startDate,
        config,
        roles: roleInput,
        supervisor,
        weather,
      });
    },
    // Straight into the schedule — that is where the batch is actually laid out.
    onSuccess: (id) => navigate(`/admin/batch/${id}/schedule`),
    onError: (e) => setError((e as Error).message),
  });

  const canAdvance = () => {
    if (step === 0) return code.trim().length > 0 && startDate.length === 10;
    if (step === 1) return Boolean(leads['PRIMARY_FIBRE'] && leads['STRUCTURAL_STRAW']);
    if (step === 2) return loadPreview?.ok === true;
    if (step === 3) return missingRests.length === 0;
    return true;
  };

  return (
    <>
      <PageHeading
        title="Start a new batch"
        subtitle="Five short steps. Everything not asked for here is generated from the process."
        right={
          instancePreview !== null ? (
            <Chip tone="accent">{instancePreview} tasks will be created</Chip>
          ) : undefined
        }
      />

      {/* Step tracker */}
      <div className="mb-5 flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => i < step && setStep(i)}
            className="rounded px-2.5 py-1.5 font-head text-[12px] font-600"
            style={
              i === step
                ? { background: 'var(--accent)', color: '#fff' }
                : i < step
                  ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                  : { background: 'var(--surface-2)', color: 'var(--muted)' }
            }
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="p-5">
          {step === 0 && (
            <div className="flex max-w-md flex-col gap-4">
              <Q label="Batch name" help="How this batch is referred to on every screen.">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mono w-full rounded border bg-surface px-2 py-2 text-sm"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
                />
              </Q>
              <Q label="Day 0 date" help="Day 0 is fibre weighment. Every other day counts from here.">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mono rounded border bg-surface px-2 py-2 text-sm"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
                />
              </Q>
              <Q label="Supervisor" help="Who releases work and handles deviations.">
                <input
                  value={supervisor}
                  onChange={(e) => setSupervisor(e.target.value)}
                  className="w-full rounded border bg-surface px-2 py-2 text-sm"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
                />
              </Q>
              <Q label="Weather note" help="Optional. Recorded on the batch.">
                <input
                  value={weather}
                  onChange={(e) => setWeather(e.target.value)}
                  placeholder="e.g. clear, humid"
                  className="w-full rounded border bg-surface px-2 py-2 text-sm"
                  style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
                />
              </Q>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="max-w-prose text-[13px] text-ink2">
                Pick the material for each job. The process never names a material, so this is
                what decides the labels the operator sees. Leave a row empty and that whole
                stream does not run.
              </p>
              {rolesReady
                .filter((r) => r.materials.length > 0)
                .map((r) => (
                  <Q
                    key={r.role}
                    label={ROLE_PLAIN[r.role] ?? r.role}
                    help={ROLE_HELP[r.role] ?? ''}
                  >
                    <select
                      value={leads[r.role] ?? ''}
                      onChange={(e) => setLeads((p) => ({ ...p, [r.role]: e.target.value }))}
                      className="w-full max-w-sm rounded border bg-surface px-2 py-2 text-sm"
                      style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
                    >
                      <option value="">— not used in this batch —</option>
                      {r.materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Q>
                ))}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="max-w-prose text-[13px] text-ink2">
                How much and how many. The number of truck loads is worked out from the first two
                — it is never typed in.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {STRUCTURE_QUESTIONS.map((q) => (
                  <Q key={q.key} label={q.label} help={q.help}>
                    <NumberInput
                      value={structure[q.key] ?? 0}
                      step={q.step}
                      unit={q.suffix}
                      onChange={(n) => setStructure((p) => ({ ...p, [q.key]: n }))}
                    />
                  </Q>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div
                className="rounded border p-3"
                style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}
              >
                <p className="text-[13px]" style={{ color: 'var(--warn)' }}>
                  <strong>The factory has never stated these hours.</strong> They are asked here
                  rather than guessed, and the batch cannot start until every one is answered.
                  Nothing invents a number on your behalf.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                {restActivities.map((r) => {
                  const v = rests[r.code] ?? { amount: '', unit: 'h' as const };
                  const hrs = toHours(v);
                  const answered = hrs !== null && hrs > 0;
                  return (
                    <div
                      key={r.code}
                      className="rounded-lg border p-3"
                      style={{
                        borderColor: answered ? 'var(--line)' : 'var(--warn)',
                        borderLeftWidth: 3,
                        borderLeftColor: answered ? '#16794a' : 'var(--warn)',
                        background: 'var(--surface)',
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-head text-[12px] font-700 uppercase tracking-wider text-muted">
                          {r.span ?? `Day ${r.rel_day}`}
                        </span>
                        {r.tbd_marker && <ConflictMarker id={r.tbd_marker} />}
                      </div>

                      {/* The question, in factory language, from the process definition. */}
                      <p className="mt-1 max-w-prose text-[14px] text-ink">
                        {r.question ?? `How long must ${r.title} last?`}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={v.unit === 'min' ? 1 : 0.5}
                          value={v.amount}
                          placeholder="—"
                          onChange={(e) =>
                            setRests((p) => ({
                              ...p,
                              [r.code]: {
                                amount: e.target.value === '' ? '' : Number(e.target.value),
                                unit: v.unit,
                              },
                            }))
                          }
                          className="mono w-24 rounded border bg-surface px-2 py-2 text-[15px]"
                          style={{
                            borderColor: answered ? 'var(--line-2)' : 'var(--warn)',
                            color: 'var(--ink)',
                          }}
                        />
                        <select
                          value={v.unit}
                          onChange={(e) =>
                            setRests((p) => ({
                              ...p,
                              [r.code]: { amount: v.amount, unit: e.target.value as 'min' | 'h' },
                            }))
                          }
                          className="rounded border bg-surface px-2 py-2 text-[13px]"
                          style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}
                        >
                          <option value="h">hours</option>
                          <option value="min">minutes</option>
                        </select>

                        {r.min_hr != null && (
                          <span className="text-[11px] text-muted">
                            the source says {r.min_hr}–{r.max_hr} h
                          </span>
                        )}
                        {answered && (
                          <span className="mono text-[11px]" style={{ color: '#16794a' }}>
                            = {hrs! < 1 ? `${Math.round(hrs! * 60)} min` : `${hrs} h`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {missingRests.length > 0 && (
                <p className="text-[13px]" style={{ color: 'var(--crit)' }}>
                  {missingRests.length} still to answer. A rest of zero is not an answer.
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <Row k="Batch" v={code} />
              <Row k="Day 0" v={new Date(startDate).toDateString()} />
              <Row k="Supervisor" v={supervisor || '—'} />
              <Row
                k="Materials"
                v={
                  Object.entries(leads)
                    .filter(([, id]) => id)
                    .map(([role, id]) => `${ROLE_PLAIN[role] ?? role}: ${materialNameById.get(id)}`)
                    .join(' · ') || '—'
                }
              />
              <Row
                k="Loads"
                v={loadPreview?.ok ? `${loadPreview.instances.length} (tail ${loadPreview.instances.at(-1)?.plannedQuantityMt} MT)` : '—'}
              />
              <Row k="Tasks to be created" v={String(instancePreview ?? '—')} />
              <Row k="Rest periods answered" v={`${restActivities.length - missingRests.length} of ${restActivities.length}`} />

              {error && (
                <p
                  className="rounded border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}
                >
                  {error}
                </p>
              )}

              <button
                onClick={() => create.mutate()}
                disabled={create.isPending || missingRests.length > 0}
                className="mt-2 rounded px-4 py-3 font-head text-sm font-700"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: create.isPending || missingRests.length > 0 ? 0.5 : 1,
                }}
              >
                {create.isPending ? 'Creating…' : 'Create the batch and generate the plan'}
              </button>
              <p className="text-[11px] text-muted">
                This creates the batch as a draft and generates every task. Nothing is locked in
                until you activate it on the next screen.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded border px-3 py-2 font-head text-[12px] font-600"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              >
                Back
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance()}
                className="rounded px-4 py-2 font-head text-[12px] font-700"
                style={{ background: 'var(--accent)', color: '#fff', opacity: canAdvance() ? 1 : 0.5 }}
              >
                Continue
              </button>
            )}
          </div>
        </Card>

        {/* Live consequences. Freedom without consequence is a trap. */}
        <aside className="flex flex-col gap-3">
          <Card className="p-3">
            <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
              What this makes
            </p>
            <div className="mt-3 flex flex-col gap-3">
              {loadPreview?.ok ? (
                <Stat
                  label="Truck loads"
                  value={loadPreview.instances.length}
                  compare={`${structure.primary_fibre_required_mt} MT ÷ ${structure.expected_load_capacity_mt} MT`}
                  size="lg"
                  tone="ok"
                />
              ) : (
                <p className="text-[12px]" style={{ color: 'var(--crit)' }}>
                  {loadPreview && !loadPreview.ok ? loadPreview.error.message : '—'}
                </p>
              )}
              <Stat label="Tasks in total" value={instancePreview ?? '—'} compare="across every stream" />
              <Stat
                label="Streams running"
                value={Object.values(leads).filter(Boolean).length}
                compare="one per material job filled"
              />
              <Stat label="Process length" value={23} unit="days" compare="Day 0 to Day 22" />
            </div>
          </Card>
          <Card className="p-3">
            <p className="font-head text-[11px] font-700 uppercase tracking-wider text-ink2">
              Not asked for a reason
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Which activities exist, what order they run in, what each operator records, what
              must be photographed, and which gates block what — all of that comes from the
              process definition. Changing it is a data change, not a code change.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

const ROLE_PLAIN: Record<string, string> = {
  PRIMARY_FIBRE: 'Main fibre',
  SECONDARY_FIBRE: 'Second fibre',
  STRUCTURAL_STRAW: 'Straw',
  NITROGEN_SOURCE: 'Nitrogen source',
  MINERAL: 'Minerals',
  PH_CORRECTOR: 'pH corrector',
};

const ROLE_HELP: Record<string, string> = {
  PRIMARY_FIBRE: 'Wetted at the hopper and conditioned in a bunker. Usually bagasse.',
  SECONDARY_FIBRE: 'Waxy straw, wetted separately. Not confirmed yet, so normally left empty.',
  STRUCTURAL_STRAW: 'Soaked rather than hopper-wetted. Gives the compost structure.',
  NITROGEN_SOURCE: 'Dry-mixed, never wetted on its own.',
  MINERAL: 'Dry-mixed with the nitrogen source.',
  PH_CORRECTOR: 'Optional. Adds a lime correction step.',
};

function Q({
  label,
  help,
  children,
  marker,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
  marker?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-head text-[13px] font-700">{label}</span>
        {marker}
      </span>
      {help && <span className="text-[11px] leading-snug text-muted">{help}</span>}
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: 'var(--line)' }}>
      <span className="w-48 shrink-0 font-head text-[11px] font-600 uppercase tracking-wider text-muted">
        {k}
      </span>
      <span className="text-[13px] text-ink">{v}</span>
    </div>
  );
}
