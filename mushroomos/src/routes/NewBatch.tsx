import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { loadMaterialRoles } from '../api/processDefinition';
import {
  DEFAULT_STRUCTURE,
  createBatch,
  factoryInstant,
  getPublishedBaseline,
  getFactoryClock,
  type RoleBindingInput,
} from '../api/batch';
import { setIndividualBatches } from '../api/movements';
import { humanError } from '../lib/humanError';
import { PageHeading } from '../components/layout/PageHeading';

/**
 * Phase 3 · Admin 7-Step Batch Creation Wizard.
 *
 * Mental Model: "What batch am I planning and configuring?"
 * Steps:
 * 0. Schedule (Imported schedule group selection or ad-hoc)
 * 1. Identity (Master batch code, label, supervisor, date)
 * 2. Materials & Quantity (Real calculator: MT ÷ Capacity -> Full + Tail loads)
 * 3. Individual Batches (Sub-batch numbers & MT split)
 * 4. Physical Movement Plan (Bunkers auto-configured, tunnel allocation due by H240)
 * 5. H0 Factory Clock (Factory timezone instant & H0 anchor)
 * 6. Review & Activate (Timeline preview & activation)
 */
const STEPS = [
  'Schedule',
  'Identity',
  'Materials & Quantity',
  'Individual Batches',
  'Movement Plan',
  'H0 Factory Clock',
  'Review & Activate',
] as const;

function factoryClockTime(c: { h0HourOfDay: number; h0MinuteOfHour: number }): string {
  return `${String(c.h0HourOfDay).padStart(2, '0')}:${String(c.h0MinuteOfHour).padStart(2, '0')}`;
}

export function NewBatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scheduleGroupId = params.get('schedule_group_id');
  const prefilledCode = params.get('code') || '';
  const prefilledStartDate = params.get('start_date') || '';

  const [step, setStep] = useState(0);
  const today = new Date();

  // Wizard State
  const [code, setCode] = useState(() =>
    prefilledCode ? prefilledCode : `MB-${today.toISOString().slice(0, 10).replace(/-/g, '')}`
  );
  const [startDate, setStartDate] = useState(
    () => prefilledStartDate || today.toISOString().slice(0, 10)
  );
  const [supervisor, setSupervisor] = useState('Ramarao');
  const [weather, setWeather] = useState('');
  const [structure, setStructure] = useState<Record<string, number>>({ ...DEFAULT_STRUCTURE });
  const [loadCapacityMT, setLoadCapacityMT] = useState(2.0);
  const [leads, setLeads] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Individual Sub-Batches (default 3)
  const [subBatches, setSubBatches] = useState<{ code: string; targetMT: number }[]>([
    { code: '366', targetMT: 25.0 },
    { code: '367', targetMT: 25.0 },
    { code: '368', targetMT: 25.0 },
  ]);

  const roles = useQuery({ queryKey: ['material-roles'], queryFn: loadMaterialRoles });
  const clock = useQuery({ queryKey: ['factory-clock'], queryFn: getFactoryClock });
  const [startTimeOverride, setStartTimeOverride] = useState('');
  const baseline = useQuery({ queryKey: ['process-baseline'], queryFn: getPublishedBaseline });

  const rolesReady = roles.data ?? [];
  if (rolesReady.length > 0 && Object.keys(leads).length === 0) {
    const initial: Record<string, string> = {};
    for (const r of rolesReady) if (r.leadId) initial[r.role] = r.leadId;
    if (Object.keys(initial).length) setLeads(initial);
  }

  // Live Quantity Calculator (Point 1 from fix.md)
  const targetFibreMT = structure.target_fibre_mt ?? 21.0;
  const fullLoads = Math.floor(targetFibreMT / loadCapacityMT);
  const tailMT = Number((targetFibreMT % loadCapacityMT).toFixed(2));
  const totalLoads = Math.ceil(targetFibreMT / loadCapacityMT);

  const materialCodeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rolesReady) for (const mat of r.materials) m.set(mat.id, mat.code);
    return m;
  }, [rolesReady]);

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

      const config: Record<string, number | string> = {
        ...structure,
        target_fibre_mt: targetFibreMT,
        load_capacity_mt: loadCapacityMT,
        total_loads: totalLoads,
      };

      const startAt =
        startTimeOverride === '' ? undefined : await factoryInstant(startDate, startTimeOverride);
      if (startTimeOverride !== '' && !startAt) {
        throw new Error('The factory timezone is not set.');
      }

      const newId = await createBatch({
        code,
        label: code,
        start_date: startDate,
        config,
        roles: roleInput,
        supervisor,
        weather,
        start_at: startAt,
      });

      if (scheduleGroupId) {
        try {
          await supabase.rpc('claim_monthly_schedule_group', {
            p_schedule_group: scheduleGroupId,
            p_master_batch: newId,
          });
        } catch {
          // ignore link error
        }
      }

      // Save individual batches (e.g. 366, 367, 368)
      if (subBatches.length > 0) {
        try {
          await setIndividualBatches(
            newId,
            subBatches.map((sb) => sb.code).join(',')
          );
        } catch (err) {
          console.error('Failed to set individual batches:', err);
        }
      }

      return newId;
    },
    onSuccess: (newId) => {
      navigate(`/admin/batch/${newId}/schedule`);
    },
    onError: (e) => setError(humanError(e).title),
  });

  return (
    <div className="pb-24 max-w-3xl mx-auto">
      <PageHeading
        title="Create Master Batch"
        subtitle="Plan, configure resources and initialize the continuous factory clock"
      />

      {/* 7-Step Breadcrumb Progress Bar */}
      <div className="bg-surface rounded-2xl p-4 shadow-card border border-line mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs font-bold text-accent">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </span>
          <span className="text-[11px] text-muted">
            {step === STEPS.length - 1 ? 'Ready for Activation' : 'Next Step Pending'}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => i <= step && setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'bg-accent' : i < step ? 'bg-accent/40' : 'bg-surface-2'
              }`}
              title={s}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* STEP CONTENT */}
      <div className="bg-surface rounded-2xl p-6 shadow-card border border-line space-y-6">
        {/* STEP 0: SCHEDULE ORIGIN */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">1. Schedule Intake Origin</h3>
            <p className="text-xs text-muted">
              Choose whether to initialize this master batch from an imported Monthly Schedule group or create an ad-hoc batch.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <Link
                to="/admin/schedule"
                className="p-4 rounded-xl border border-line bg-surface-2 hover:border-accent hover:bg-surface text-left flex flex-col justify-between transition-all"
              >
                <div>
                  <span className="font-head text-sm font-bold text-ink block">Claim from Monthly Schedule</span>
                  <p className="text-xs text-muted mt-1">Imported factory workbook schedule groups with planned dates.</p>
                </div>
                <span className="text-xs font-bold text-accent mt-3">Open Schedule Importer →</span>
              </Link>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="p-4 rounded-xl border border-accent bg-accent-soft text-left flex flex-col justify-between"
              >
                <div>
                  <span className="font-head text-sm font-bold text-accent block">Ad-hoc Master Batch</span>
                  <p className="text-xs text-ink-2 mt-1">Set up custom batch codes and dates manually.</p>
                </div>
                <span className="text-xs font-bold text-accent mt-3">Continue Manually →</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: BATCH IDENTITY */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">2. Master Batch Identity</h3>
            <div className="grid gap-4">
              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1">Master Batch Code / Numbers</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. 366, 367, 368 or MB-2026-08-25"
                  className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2.5 text-sm font-mono font-bold text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1">Day 0 Date (Fibre Weighment)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2.5 text-sm font-mono text-ink focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1">Supervisor Responsible</label>
                  <input
                    value={supervisor}
                    onChange={(e) => setSupervisor(e.target.value)}
                    placeholder="e.g. Ramarao"
                    className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1">Weather Note (Optional)</label>
                <input
                  value={weather}
                  onChange={(e) => setWeather(e.target.value)}
                  placeholder="e.g. Clear, normal humidity"
                  className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: MATERIALS & QUANTITY (REAL CALCULATOR) */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">3. Material Roles & Raw Quantities</h3>
            <p className="text-xs text-muted">
              Bind raw material streams and calculate load instances dynamically.
            </p>

            <div className="space-y-3 pt-1">
              {rolesReady.map((r) => (
                <div key={r.role} className="p-3.5 rounded-xl bg-surface-2 border border-line flex items-center justify-between gap-3">
                  <div>
                    <span className="font-head text-xs font-bold text-ink block">{r.role.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-muted">Select active material lot</span>
                  </div>
                  <select
                    value={leads[r.role] ?? ''}
                    onChange={(e) => setLeads({ ...leads, [r.role]: e.target.value })}
                    className="rounded-lg border border-line-2 bg-surface px-3 py-1.5 text-xs font-bold text-ink focus:border-accent focus:outline-none"
                  >
                    <option value="">— disabled —</option>
                    {r.materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Real Quantity Calculator (Point 1 from fix.md) */}
              <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                    Primary Fibre Weighment Calculator
                  </span>
                  <span className="text-[11px] text-muted">Live load formula</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-ink-2 mb-1">Required Quantity (MT)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={targetFibreMT}
                      onChange={(e) => setStructure({ ...structure, target_fibre_mt: Number(e.target.value) })}
                      className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm font-mono font-bold text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-ink-2 mb-1">Truck / JCB Capacity (MT)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={loadCapacityMT}
                      onChange={(e) => setLoadCapacityMT(Math.max(0.5, Number(e.target.value)))}
                      className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm font-mono font-bold text-ink"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-line grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-surface border border-line">
                    <span className="text-[10px] text-muted block uppercase font-bold">Full Loads</span>
                    <span className="font-mono font-bold text-ink">{fullLoads} × {loadCapacityMT} MT</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface border border-line">
                    <span className="text-[10px] text-muted block uppercase font-bold">Tail Load</span>
                    <span className="font-mono font-bold text-ink">{tailMT > 0 ? `${tailMT} MT` : 'None (0 MT)'}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface border border-line">
                    <span className="text-[10px] text-muted block uppercase font-bold">Total Loads</span>
                    <span className="font-mono font-bold text-accent">{totalLoads} Loads ({targetFibreMT} MT)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: INDIVIDUAL BATCHES */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">4. Individual Sub-Batch Split</h3>
            <p className="text-xs text-muted">
              Register individual batch codes that will share this master process.
            </p>

            <div className="space-y-2.5">
              {subBatches.map((sb, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-surface-2 border border-line flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-muted">#{idx + 1}</span>
                    <input
                      value={sb.code}
                      onChange={(e) => {
                        const copy = [...subBatches];
                        copy[idx].code = e.target.value;
                        setSubBatches(copy);
                      }}
                      className="w-24 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-xs font-mono font-bold text-ink"
                      placeholder="Code"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Planned MT:</span>
                    <input
                      type="number"
                      value={sb.targetMT}
                      onChange={(e) => {
                        const copy = [...subBatches];
                        copy[idx].targetMT = Number(e.target.value);
                        setSubBatches(copy);
                      }}
                      className="w-20 rounded-lg border border-line-2 bg-surface px-2 py-1.5 text-xs font-mono font-bold text-ink"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: PHYSICAL MOVEMENT PLAN & FUTURE TUNNEL PLANNING */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-head text-lg font-bold text-ink">5. Physical Movement Plan</h3>
              <span className="text-[11px] font-mono font-bold text-accent bg-accent-soft px-2.5 py-1 rounded-full">
                Tunnel Decision Due by H240
              </span>
            </div>
            <p className="text-xs text-muted">
              Physical material routing overview. Phase I bunkers are auto-routed; Phase II tunnel destinations are decided during active production by H240.
            </p>

            {/* 1. Phase I Bunker Operations Card */}
            <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-head text-xs font-bold text-ink uppercase tracking-wider">
                  Phase I · Bunker Movements
                </span>
                <span className="text-xs font-mono font-bold text-ok flex items-center gap-1">
                  <span>✓</span> Auto-Configured
                </span>
              </div>
              <p className="text-xs text-muted">
                Pile mixing, turner passes (T0, T1, T2), and bunker reload cycles are scheduled according to standard factory SOP.
              </p>
            </div>

            {/* 2. Phase II Tunnel Planning (Due by H240) */}
            <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-head text-xs font-bold text-ink uppercase tracking-wider">
                  Phase II · Tunnel Planning
                </span>
                <span className="text-xs font-mono font-bold text-accent bg-accent-soft px-2.5 py-0.5 rounded-md">
                  Due by H240 (Day 10)
                </span>
              </div>

              <div className="p-3 rounded-lg bg-surface border border-line text-xs text-ink-2 space-y-1.5">
                <p className="font-medium">
                  <span className="font-bold text-ink">Status:</span> NOT YET REQUIRED AT BATCH CREATION
                </p>
                <p className="text-muted leading-relaxed">
                  Tunnel destinations are finalized by <span className="font-bold text-ink">H240</span> during active production. The system will remind the Admin and Supervisor around H200–H240 to allocate tunnels against real-time vessel occupancy.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-mono font-bold text-muted uppercase">Sub-Batch Planning Status</span>
                <div className="grid sm:grid-cols-3 gap-2">
                  {subBatches.map((sb) => (
                    <div key={sb.code} className="p-2.5 rounded-lg bg-surface border border-line flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-muted font-mono block">Sub-Batch</span>
                        <span className="font-mono text-xs font-bold text-ink">{sb.code}</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted">
                        Due H240
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: H0 FACTORY CLOCK */}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">6. Factory Start Clock (H0 Anchor)</h3>
            <p className="text-xs text-muted">
              Confirm the authoritative start time instant. Every planned hour counts from H0.
            </p>

            {clock.data ? (
              <div className="p-4 rounded-xl bg-surface-2 border border-line space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-muted">Factory Standard Start:</span>
                  <span className="font-mono text-sm font-bold text-accent">
                    {factoryClockTime(clock.data)} ({clock.data.timezone})
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1">Override Start Time (Optional)</label>
                  <input
                    type="time"
                    value={startTimeOverride || factoryClockTime(clock.data)}
                    onChange={(e) => setStartTimeOverride(e.target.value)}
                    className="rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm font-mono text-ink"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-red-600">Factory clock timezone not configured.</p>
            )}
          </div>
        )}

        {/* STEP 6: REVIEW & ACTIVATE */}
        {step === 6 && (
          <div className="space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">7. Review & Pre-Activation</h3>
            <div className="grid sm:grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-surface-2 border border-line">
                <span className="text-[10px] uppercase font-bold text-muted block">Batch Code</span>
                <span className="font-mono text-sm font-bold text-ink">{code}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-2 border border-line">
                <span className="text-[10px] uppercase font-bold text-muted block">Process Span</span>
                <span className="font-mono text-sm font-bold text-accent">
                  H0 → H{baseline.data?.baselineHours ?? '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-2 border border-line">
                <span className="text-[10px] uppercase font-bold text-muted block">Sub-Batches</span>
                <span className="font-mono text-sm font-bold text-ink">{subBatches.length} Batches</span>
              </div>
            </div>

            {/* Physical Movement & Tunnel Planning Milestone */}
            <div className="p-3.5 rounded-xl bg-surface-2 border border-line space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted block">
                  Tunnel Planning Status:
                </span>
                <span className="font-mono text-xs font-bold text-accent bg-accent-soft px-2 py-0.5 rounded">
                  Due by H240 (Day 10)
                </span>
              </div>
              <p className="text-xs text-muted">
                {subBatches.length} individual sub-batches ({subBatches.map((sb) => sb.code).join(', ')}) registered. Tunnel destinations will be finalized by H240 against live vessel availability.
              </p>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Upon clicking activate, the authoritative process engine will generate the full baseline activities, load sequences, and initial ready gates.
            </p>
          </div>
        )}

        {/* NAVIGATION BUTTONS */}
        <div className="flex items-center justify-between pt-4 border-t border-line">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-2 bg-surface-2 border border-line hover:bg-line transition-all"
            >
              ← Back
            </button>
          ) : <div />}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2 rounded-xl text-xs font-bold text-on-accent bg-accent hover:opacity-90 transition-all"
            >
              Continue to {STEPS[step + 1]} →
            </button>
          ) : (
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-hover transition-all shadow-md flex items-center gap-2"
            >
              {create.isPending ? 'Creating & Generating Baseline...' : 'Create & View Schedule →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
