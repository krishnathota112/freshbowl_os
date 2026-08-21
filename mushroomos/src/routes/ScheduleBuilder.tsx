import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DAY_TITLES,
  assignActivity,
  loadOptions,
  loadSchedule,
  loadTemplateMap,
  sendAlert,
  setActivityPlan,
  validateBatch,
  type Finding,
  type ScheduleRow,
} from '../api/schedule';
import { activateBatch, getBatch } from '../api/batch';
import { Chip, ConflictMarker, EmptyState } from '../components/primitives';

/**
 * The master batch schedule. Day 0 → Day 23, read top to bottom.
 *
 * THE SHAPE IS FIXED. Which days exist, what happens on each, the order, the dependencies —
 * none of it is editable here, and none of it is reachable through set_activity_plan.
 *
 * THE CONTENT IS HERS. Quantities, vessels, durations, machines, people, evidence, water or
 * dry. Every row is built from process_activity, so adding an activity to the seed adds a row
 * here with no code change.
 */
export function ScheduleBuilder() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'crit'; text: string } | null>(null);

  const batch = useQuery({ queryKey: ['batch', id], queryFn: () => getBatch(id) });
  const rows = useQuery({ queryKey: ['schedule', id], queryFn: () => loadSchedule(id) });
  const opts = useQuery({ queryKey: ['schedule-options'], queryFn: loadOptions });
  const tmap = useQuery({ queryKey: ['template-map', id], queryFn: () => loadTemplateMap(id) });
  const findings = useQuery({ queryKey: ['validate', id], queryFn: () => validateBatch(id) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['schedule', id] });
    qc.invalidateQueries({ queryKey: ['validate', id] });
  };

  const save = useMutation({
    mutationFn: ({ rowId, patch }: { rowId: string; patch: Record<string, string | null> }) =>
      setActivityPlan(rowId, patch),
    onSuccess: refresh,
    onError: (e) => setBanner({ tone: 'crit', text: (e as Error).message }),
  });

  const activate = useMutation({
    mutationFn: () => activateBatch(id),
    onSuccess: () => {
      setBanner({ tone: 'ok', text: 'Activated. The plan is frozen.' });
      qc.invalidateQueries({ queryKey: ['batch', id] });
      refresh();
    },
    onError: (e) => setBanner({ tone: 'crit', text: (e as Error).message }),
  });

  if (batch.isLoading || rows.isLoading || opts.isLoading) {
    return <p className="p-4 text-sm text-muted">Loading the schedule…</p>;
  }
  if (batch.error) return <EmptyState title="Batch not found" detail={(batch.error as Error).message} />;

  const b = batch.data!;
  const all = rows.data ?? [];
  const o = opts.data!;
  const templates = tmap.data ?? new Map<string, string>();
  const fs = findings.data ?? [];
  const blocking = fs.filter((f) => f.severity === 'blocking');
  const warnings = fs.filter((f) => f.severity === 'warning');
  const draft = b.status === 'draft';

  const days = [...new Set(all.map((r) => r.rel_day))].sort((a, c) => a - c);
  const loadRows = all.filter((r) => r.code === 'FIB1-WEIGH');
  const labRows = all.filter((r) => r.responsible_role === 'lab_tech');
  const bunkersUsed = new Set(
    all.filter((r) => r.destination_location_id).map((r) => r.destination_location_id)
  ).size;

  return (
    <div className="pb-24">
      {/* Header · running totals update as she edits */}
      <header
        className="sticky top-0 z-10 -mx-4 mb-5 border-b px-4 py-3"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-head text-lg font-800 leading-tight">{b.label}</h1>
            <p className="mt-0.5 text-[12px] text-muted">
              starts {new Date(b.start_date).toDateString()} · supervisor {b.supervisor_name ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone={draft ? 'inherit' : 'ok'}>{b.status}</Chip>
            {draft ? (
              <button
                onClick={() => activate.mutate()}
                disabled={activate.isPending}
                className="rounded-lg px-4 py-2.5 font-head text-[13px] font-700"
                style={{ background: '#16794a', color: '#fff', opacity: activate.isPending ? 0.6 : 1 }}
              >
                {activate.isPending ? 'Activating…' : 'Activate'}
              </button>
            ) : (
              <Link
                to={`/admin/batch/${id}`}
                className="rounded-lg border px-3 py-2 font-head text-[12px] font-700"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              >
                Open batch
              </Link>
            )}
            {/* Always reachable. Once a plan is frozen, a new batch is the only way to
                change targets — so the way out has to be on this screen. */}
            <Link
              to="/admin/batch/new"
              className="rounded-lg px-4 py-2.5 font-head text-[13px] font-700"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              + New batch
            </Link>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 mono text-[12px] text-ink2">
          <span>{all.length} activities</span>
          <span>{labRows.length} lab checks</span>
          <span>{loadRows.length} loads</span>
          <span>{bunkersUsed} vessels chosen</span>
          <span>{days.length} days with work</span>
          {blocking.length > 0 && (
            <span style={{ color: 'var(--crit)' }}>{blocking.length} blocking</span>
          )}
          {warnings.length > 0 && (
            <span style={{ color: 'var(--warn)' }}>{warnings.length} warning</span>
          )}
        </div>
      </header>

      {banner && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-[13px]"
          style={{
            borderColor: banner.tone === 'ok' ? '#16794a' : 'var(--crit)',
            background: banner.tone === 'ok' ? 'var(--ok-soft)' : 'var(--crit-soft)',
            color: banner.tone === 'ok' ? '#16794a' : 'var(--crit)',
          }}
        >
          {banner.text}
        </div>
      )}

      {/*
        Why every field on this page is greyed out. Activation freezes the baseline on
        purpose — that is the control the paper system has no way to offer — but a screen
        full of dead inputs with no explanation just reads as broken.
      */}
      {!draft && (
        <div
          className="mb-5 rounded-lg border px-3 py-2.5"
          style={{ borderColor: 'var(--line-2)', background: 'var(--inherit-soft)' }}
        >
          <p className="font-head text-[13px] font-700" style={{ color: 'var(--inherit)' }}>
            This plan is frozen — nothing on this page can be edited
          </p>
          <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--ink-2)' }}>
            The baseline was locked when the batch was activated
            {b.activated_at ? ` on ${new Date(b.activated_at).toLocaleString()}` : ''}. From
            here a target changes only through a recorded deviation or a supervisor decision,
            so the plan the operators worked to stays the plan on the record. To lay out a
            different batch, start a new one.
          </p>
        </div>
      )}

      {draft && blocking.length > 0 && (
        <details
          className="mb-5 rounded-lg border p-3"
          style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)' }}
          open
        >
          <summary className="cursor-pointer font-head text-[13px] font-700" style={{ color: 'var(--crit)' }}>
            {blocking.length} thing{blocking.length === 1 ? '' : 's'} to settle before this can start
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {blocking.slice(0, 12).map((f, i) => (
              <li key={i} className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                • {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* The timeline */}
      <div className="flex flex-col gap-6">
        {days.map((day, di) => {
          const items = all.filter((r) => r.rel_day === day);
          const nextDay = days[di + 1];
          // The span label comes from the definition where one is given; otherwise it is
          // derived from the gap to the next day that has work.
          const seededSpan = items.find((r) => r.day_span_label)?.day_span_label ?? null;
          const isRestSpan = items.every((r) => r.is_time_gate) && nextDay && nextDay - day > 1;
          const label =
            seededSpan ?? (isRestSpan ? `Day ${day}–${nextDay - 1}` : `Day ${day}`);
          return (
            <section key={day}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-1" style={{ borderColor: 'var(--line-2)' }}>
                <h2 className="font-head text-[15px] font-800">{label}</h2>
                <span className="text-[12px] text-muted">{DAY_TITLES[day] ?? ''}</span>
                <span className="ml-auto mono text-[11px] text-muted">{items.length} rows</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    open={openRow === r.id}
                    draft={draft}
                    opts={o}
                    templateId={templates.get(r.id)}
                    finding={fs.find((f) => f.activity_id === r.id)}
                    onToggle={() => setOpenRow(openRow === r.id ? null : r.id)}
                    onSave={(patch) => save.mutate({ rowId: r.id, patch })}
                    onAssign={async (pid, reason) => {
                      try {
                        await assignActivity(r.id, pid, reason);
                        refresh();
                      } catch (e) {
                        setBanner({ tone: 'crit', text: (e as Error).message });
                      }
                    }}
                    onAlert={async (role, reason) => {
                      try {
                        await sendAlert(r.id, role, `${r.title} — ${r.scope_label}`, reason);
                        setBanner({ tone: 'ok', text: `Alert sent to ${role.replace('_', ' ')}.` });
                      } catch (e) {
                        setBanner({ tone: 'crit', text: (e as Error).message });
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Day 23 · a state page, not an operation. No activity is seeded for it. */}
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-1" style={{ borderColor: 'var(--line-2)' }}>
            <h2 className="font-head text-[15px] font-800">Day 23</h2>
            <span className="text-[12px] text-muted">Batch state</span>
            <span className="ml-auto mono text-[11px] text-muted">not an operation</span>
          </div>
          <div className="rounded-lg border border-dashed p-4" style={{ borderColor: 'var(--line-2)' }}>
            <p className="text-[13px] text-ink2">
              Nothing is performed on Day 23. It shows where each individual batch ended up:
              compost-out results, every lab result for the batch, the evidence gallery,
              supervisor status, the GM decision, and the growing-room allocation.
            </p>
            <p className="mt-2 text-[11px] text-muted">
              There is deliberately no activity row here. If one ever appears, that is a defect.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Opts = Awaited<ReturnType<typeof loadOptions>>;

function Row({
  row,
  open,
  draft,
  opts,
  templateId,
  finding,
  onToggle,
  onSave,
  onAssign,
  onAlert,
}: {
  row: ScheduleRow;
  open: boolean;
  draft: boolean;
  opts: Opts;
  templateId: string | undefined;
  finding: Finding | undefined;
  onToggle: () => void;
  onSave: (patch: Record<string, string | null>) => void;
  onAssign: (personId: string, reason?: string) => void;
  onAlert: (role: 'operator' | 'lab_tech' | 'supervisor', reason?: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const isLab = row.responsible_role === 'lab_tech';
  const mr = opts.movement.find((m) => m.process_activity_id === templateId);
  const variants = opts.variants.filter((v) => v.process_activity_id === templateId);
  const evCount = opts.evidence.filter((e) => e.batch_activity_id === row.id).length;

  const person = opts.people.find((p) => p.id === row.assigned_person_id);
  const machine = opts.machines.find((m) => m.id === row.assigned_machine_id);
  const dest = opts.locations.find((l) => l.id === row.destination_location_id);
  const src = opts.locations.find((l) => l.id === row.source_location_id);

  const destKind = mr?.destination_kind;
  const vessels = opts.locations.filter((l) => l.kind === destKind);

  const problem = finding?.severity === 'blocking';

  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: problem ? 'var(--crit)' : 'var(--line)',
        background: 'var(--surface)',
        borderLeftWidth: 3,
        borderLeftColor: problem ? 'var(--crit)' : isLab ? 'var(--accent)' : '#16794a',
      }}
    >
      {/* Collapsed line */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <span className="mt-0.5 text-[11px] text-muted">{open ? '▾' : '▸'}</span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-head text-[14px] font-700">{row.title}</span>
              {isLab ? <Chip tone="accent">lab</Chip> : row.is_time_gate ? <Chip tone="inherit">time gate</Chip> : null}
              {row.tbd_marker && <ConflictMarker id={row.tbd_marker} />}
            </span>
            <span className="mt-0.5 block mono text-[11px] text-muted">
              {row.scope_label}
              {row.day0_duration_hr != null && ` · ${row.day0_duration_hr} h`}
              {dest && ` · into ${dest.label}`}
              {machine && ` · ${machine.code}`}
              {person && ` · ${person.display_name.split(' —')[0]}`}
              {isLab && row.lab_parameters?.length ? ` · ${row.lab_parameters.join(', ')}` : ''}
            </span>
            {problem && (
              <span className="mt-1 block text-[11px]" style={{ color: 'var(--crit)' }}>
                {finding!.message}
              </span>
            )}
          </span>
        </button>

        {/* Overflow · assign and alert, available planning and running */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenu(!menu)}
            className="rounded px-2 py-1 font-head text-[14px]"
            style={{ color: 'var(--muted)' }}
            aria-label="Row actions"
          >
            ⋮
          </button>
          {menu && (
            <div
              className="absolute right-0 z-20 mt-1 w-56 rounded-lg border p-1 shadow-lg"
              style={{ borderColor: 'var(--line-2)', background: 'var(--surface)' }}
            >
              <p className="px-2 py-1 font-head text-[10px] uppercase tracking-wider text-muted">
                Assign to
              </p>
              {opts.people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const reason = draft ? undefined : window.prompt('Reason for reassigning?') ?? '';
                    if (!draft && !reason) return;
                    onAssign(p.id, reason);
                    setMenu(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-[12px]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {p.display_name}
                </button>
              ))}
              <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
              {(['operator', 'lab_tech'] as const).map((rl) => (
                <button
                  key={rl}
                  onClick={() => {
                    const reason = draft ? undefined : window.prompt('Reason for the alert?') ?? '';
                    if (!draft && !reason) return;
                    onAlert(rl, reason);
                    setMenu(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-[12px]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  Alert {rl === 'lab_tech' ? 'lab' : 'operator'}
                </button>
              ))}
              <p className="px-2 py-1 text-[10px] text-muted">
                An alert is a nudge. It never changes what the task is waiting on.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Expanded settings */}
      {open && (
        <div className="border-t px-3 py-3" style={{ borderColor: 'var(--line)' }}>
          {/* What she is actually being asked, in factory language, from the definition. */}
          {row.admin_question && (
            <p className="mb-3 max-w-prose text-[13px] text-ink">{row.admin_question}</p>
          )}

          {/*
            The movement, drawn. Material has a location and a history; a reload that went
            back where it came from would be visible here as well as refused by validation.
          */}
          {src && dest && (
            <div
              className="mb-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'var(--surface-2)' }}
            >
              <span className="mono rounded border px-2 py-1 text-[12px]"
                    style={{ borderColor: 'var(--line-2)', color: 'var(--ink)' }}>
                {src.label}
              </span>
              <span className="mono text-[13px]" style={{ color: '#16794a' }}>──►</span>
              {machine && (
                <>
                  <span className="mono rounded border px-2 py-1 text-[11px]"
                        style={{ borderColor: 'var(--line-2)', color: 'var(--muted)' }}>
                    {machine.code}
                  </span>
                  <span className="mono text-[13px]" style={{ color: '#16794a' }}>──►</span>
                </>
              )}
              <span className="mono rounded border px-2 py-1 text-[12px] font-600"
                    style={{ borderColor: '#16794a', background: 'var(--ok-soft)', color: '#16794a' }}>
                {dest.label}
              </span>
              {mr?.requires_distinct_vessel && src.id === dest.id && (
                <span className="text-[11px]" style={{ color: 'var(--crit)' }}>
                  same vessel — not allowed
                </span>
              )}
            </div>
          )}

          {row.golden_rule && (
            <p
              className="mb-3 rounded px-2 py-1.5 text-[12px] italic"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
            >
              {row.golden_rule}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Who */}
            <Ctl label="Responsible">
              <Sel
                value={row.responsible_role}
                disabled={!draft}
                options={[
                  { v: 'operator', l: 'Operator' },
                  { v: 'lab_tech', l: 'Lab' },
                  { v: 'supervisor', l: 'Supervisor' },
                ]}
                onChange={(v) => onSave({ responsible_role: v })}
              />
            </Ctl>

            <Ctl label="Person">
              <Sel
                value={row.assigned_person_id ?? ''}
                disabled={!draft}
                options={[
                  { v: '', l: '— nobody yet —' },
                  ...opts.people
                    .filter((p) => (isLab ? p.role === 'lab_tech' : true))
                    .map((p) => ({ v: p.id, l: p.display_name })),
                ]}
                onChange={(v) => onSave({ assigned_person_id: v })}
              />
            </Ctl>

            {/* Duration */}
            {(row.is_time_gate || row.duration_target_min_hr != null) && (
              <Ctl
                label="Duration"
                hint={
                  row.duration_target_min_hr != null
                    ? `stated ${row.duration_target_min_hr}–${row.duration_target_max_hr} h`
                    : 'the factory has never stated this'
                }
                marker={row.tbd_marker ? <ConflictMarker id={row.tbd_marker} /> : undefined}
              >
                <Num
                  value={row.day0_duration_hr}
                  unit="h"
                  disabled={!draft}
                  onCommit={(v) => onSave({ day0_duration_hr: v })}
                />
              </Ctl>
            )}

            {/* Quantity */}
            {row.planned_qty_mt != null && (
              <Ctl label="Quantity" hint={`derived ${row.planned_qty_mt} MT`}>
                <Num
                  value={row.planned_qty_override_mt ?? row.planned_qty_mt}
                  unit="MT"
                  disabled={!draft}
                  onCommit={(v) => onSave({ planned_qty_override_mt: v })}
                />
              </Ctl>
            )}

            {/* Vessel */}
            {destKind && (
              <Ctl
                label={destKind === 'TUNNEL' ? 'Into tunnel' : 'Into bunker'}
                hint={
                  mr?.requires_distinct_vessel
                    ? `must differ from the source${src ? ` (${src.label})` : ''}`
                    : undefined
                }
              >
                <Sel
                  value={row.destination_location_id ?? ''}
                  disabled={!draft}
                  options={[
                    { v: '', l: '— choose —' },
                    ...vessels.map((l) => ({
                      v: l.id,
                      l: l.label + (l.id === row.source_location_id ? ' (source)' : ''),
                    })),
                  ]}
                  onChange={(v) => onSave({ destination_location_id: v })}
                />
              </Ctl>
            )}

            {/* Machine */}
            {!isLab && !row.is_time_gate && (
              <Ctl
                label="Machine"
                hint={row.code === 'TR-T2' ? 'must differ from the turner on T1' : undefined}
              >
                <Sel
                  value={row.assigned_machine_id ?? ''}
                  disabled={!draft}
                  options={[
                    { v: '', l: '— choose —' },
                    ...opts.machines
                      .filter((m) => m.kind !== 'VEHICLE_TRUCK')
                      .map((m) => ({ v: m.id, l: `${m.code} · ${m.kind.toLowerCase()}` })),
                  ]}
                  onChange={(v) => onSave({ assigned_machine_id: v })}
                />
              </Ctl>
            )}

            {/* Vehicle */}
            {row.assigned_vehicle_id !== undefined && row.code.includes('WEIGH') && (
              <Ctl label="Vehicle">
                <Sel
                  value={row.assigned_vehicle_id ?? ''}
                  disabled={!draft}
                  options={[
                    { v: '', l: '— choose —' },
                    ...opts.machines
                      .filter((m) => m.kind === 'VEHICLE_TRUCK')
                      .map((m) => ({ v: m.id, l: m.code })),
                  ]}
                  onChange={(v) => onSave({ assigned_vehicle_id: v })}
                />
              </Ctl>
            )}

            {/* Start time */}
            {!row.is_time_gate && (
              <Ctl label="Planned start">
                <input
                  type="time"
                  defaultValue={row.planned_time?.slice(0, 5) ?? ''}
                  disabled={!draft}
                  onBlur={(e) => onSave({ planned_time: e.target.value })}
                  title={!draft ? 'The baseline is frozen — this cannot be changed' : undefined}
                  className="mono rounded border px-2 py-1.5 text-[13px]"
                  style={{
                    borderColor: 'var(--line-2)',
                    background: draft ? 'var(--surface)' : 'var(--line)',
                    color: draft ? 'var(--ink)' : 'var(--muted)',
                    cursor: draft ? 'text' : 'not-allowed',
                  }}
                />
              </Ctl>
            )}
          </div>

          {/* Water or dry — auto is unavailable while the threshold is disputed */}
          {variants.length > 0 && (
            <div className="mt-3">
              <p className="font-head text-[11px] font-600 uppercase tracking-wider text-ink2">
                Pass mode
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {variants.map((v) => (
                  <label
                    key={v.code}
                    className="flex items-center gap-1.5 text-[13px]"
                    style={{
                      color: draft ? 'var(--ink)' : 'var(--muted)',
                      cursor: draft ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <input
                      type="radio"
                      name={`variant-${row.id}`}
                      checked={row.variant_code === v.code}
                      disabled={!draft}
                      onChange={() => onSave({ variant_code: v.code })}
                    />
                    {v.label}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-[13px] text-muted">
                  <input type="radio" disabled />
                  Auto — unavailable
                </label>
                <ConflictMarker id="C-29" note="The threshold that would drive the choice is itself disputed" />
              </div>
            </div>
          )}

          {/* Lab parameters */}
          {isLab && row.lab_parameters?.length ? (
            <div className="mt-3">
              <p className="font-head text-[11px] font-600 uppercase tracking-wider text-ink2">
                Measures
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.lab_parameters.map((p) => (
                  <Chip key={p} tone="accent">
                    {p.replace(/_/g, ' ')}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-3 text-[11px] text-muted">
            {evCount > 0
              ? `${evCount} evidence item${evCount === 1 ? '' : 's'} required`
              : 'No evidence required'}
            {' · '}
            {row.code}
            {' · this row and its position come from the process definition and cannot be changed here'}
          </p>
        </div>
      )}
    </div>
  );
}

function Ctl({
  label,
  hint,
  marker,
  children,
}: {
  label: string;
  hint?: string;
  marker?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-head text-[11px] font-600 uppercase tracking-wider text-ink2">
          {label}
        </span>
        {marker}
      </span>
      {children}
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

function Sel({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title={disabled ? 'The baseline is frozen — this cannot be changed' : undefined}
      className="rounded border px-2 py-1.5 text-[13px]"
      style={{
        borderColor: 'var(--line-2)',
        // A frozen field has to read as frozen. Same-as-editable styling made the whole
        // page look broken rather than deliberately locked.
        background: disabled ? 'var(--line)' : 'var(--surface)',
        color: disabled ? 'var(--muted)' : 'var(--ink)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function Num({
  value,
  unit,
  onCommit,
  disabled,
}: {
  value: number | null;
  unit?: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(value == null ? '' : String(value));
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        value={local}
        disabled={disabled}
        placeholder="—"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== (value == null ? '' : String(value)) && onCommit(local)}
        title={disabled ? 'The baseline is frozen — this cannot be changed' : undefined}
        className="mono w-24 rounded border px-2 py-1.5 text-[13px]"
        style={{
          borderColor: disabled ? 'var(--line-2)' : value == null ? 'var(--warn)' : 'var(--line-2)',
          background: disabled ? 'var(--line)' : 'var(--surface)',
          color: disabled ? 'var(--muted)' : 'var(--ink)',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      {unit && <span className="mono text-[11px] text-muted">{unit}</span>}
    </span>
  );
}
