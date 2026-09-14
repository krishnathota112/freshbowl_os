import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignActivity,
  loadDayTitles,
  loadOptions,
  loadSchedule,
  loadTemplateMap,
  sendAlert,
  setActivityPlan,
  clearPlannedTime,
  validateBatch,
  type Finding,
  type ScheduleRow,
} from '../api/schedule';
import { activateBatch, getBatch, getPreBatchMaterialCheck } from '../api/batch';
import { getBatchProcessVersion } from '../api/process';
import {
  listPrebatchCheckpoints,
  takePrebatchMaterialCheck,
  acceptOutstandingPrebatchResults,
  PREBATCH_PARAMETERS,
} from '../api/prebatch';
import { loadVesselOptions } from '../api/plant';
import {
  loadIndividualBatches,
  loadMovements,
  setMovementVessel,
} from '../api/movements';
import { MovementPlan } from '../components/composite/MovementPlan';
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
  // Kept apart from `banner`: a vessel refusal belongs beside the vessel it refused, not at the
  // top of a page the reader has scrolled away from.
  const [vesselError, setVesselError] = useState<string | null>(null);

  const batch = useQuery({ queryKey: ['batch', id], queryFn: () => getBatch(id) });
  const rows = useQuery({ queryKey: ['schedule', id], queryFn: () => loadSchedule(id) });
  const opts = useQuery({ queryKey: ['schedule-options'], queryFn: loadOptions });
  const tmap = useQuery({ queryKey: ['template-map', id], queryFn: () => loadTemplateMap(id) });
  const findings = useQuery({ queryKey: ['validate', id], queryFn: () => validateBatch(id) });
  // Day headings come from process_day, not from a map in this file. A2.
  const dayTitles = useQuery({ queryKey: ['day-titles', id], queryFn: () => loadDayTitles(id) });
  // The standard of the version THIS batch was generated from — see `baselineHours` below.
  const processVersion = useQuery({
    queryKey: ['batch-process-version', id],
    queryFn: () => getBatchProcessVersion(id),
  });

  /*
    THE INCOMING-MATERIAL CHECK.

    `activate_batch` refuses while this is not on record — "the material must be sampled and its
    results accepted before the batch clock starts". Every RPC behind it has existed since 0032 and
    none had a caller in the application, so an Admin could plan a batch and never start it.
  */
  const prebatch = useQuery({
    queryKey: ['prebatch', id],
    queryFn: () => getPreBatchMaterialCheck(id),
  });
  const prebatchCps = useQuery({ queryKey: ['prebatch-checkpoints'], queryFn: listPrebatchCheckpoints });
  const [assay, setAssay] = useState<Record<string, string>>({});
  const [assayError, setAssayError] = useState<string | null>(null);

  const takeCheck = useMutation({
    mutationFn: () =>
      takePrebatchMaterialCheck({
        batchId: id,
        checkpointId: prebatchCps.data![0].id,
        label: 'Incoming material assay',
        readings: PREBATCH_PARAMETERS.map((p) => ({
          parameter: p.code,
          value: Number(assay[p.code]),
        })),
      }),
    onSuccess: () => {
      setAssayError(null);
      qc.invalidateQueries({ queryKey: ['prebatch', id] });
      refresh();
    },
    // The server's own sentence. It names the roles that may accept when this one may not.
    onError: (e) => setAssayError((e as Error).message),
  });

  /**
   * Finish a check somebody else started and could not accept.
   *
   * The panel already withheld the form once a sample existed, so a second one could not be
   * recorded on top of the first. That left the only screen naming the problem with nothing for
   * the person who can solve it to press, and the batch could not be activated by anyone.
   */
  const acceptOutstanding = useMutation({
    mutationFn: () => acceptOutstandingPrebatchResults(id),
    onSuccess: () => {
      setAssayError(null);
      qc.invalidateQueries({ queryKey: ['prebatch', id] });
      refresh();
    },
    onError: (e) => setAssayError((e as Error).message),
  });

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

  // Puts one activity back on the process standard hour. Its own mutation because clearing is a
  // deliberate act, not an empty field in a patch — see `clear_planned_time`.
  const clearTime = useMutation({
    mutationFn: (rowId: string) => clearPlannedTime(rowId),
    onSuccess: refresh,
    onError: (e) => setBanner({ tone: 'crit', text: (e as Error).message }),
  });

  /*
    THE VESSEL PICKER'S DATA LIVES HERE, NOT IN THE COMPONENT.

    `UI_ACCEPTANCE_CRITERIA` A10: nothing below the route layer touches `api/`. A composite that
    fetched its own rows would render only against a live database, and the gallery would stop being
    able to exercise it. The route queries; the picker takes props.
  */
  const movements = useQuery({ queryKey: ['movements', id], queryFn: () => loadMovements(id) });
  const individuals = useQuery({
    queryKey: ['individual-batches', id],
    queryFn: () => loadIndividualBatches(id),
  });
  const vesselOptions = useQuery({ queryKey: ['vessel-options'], queryFn: loadVesselOptions });

  const pickVessel = useMutation({
    mutationFn: (v: { movement: string; locationId: string; individualBatchId: string | null }) =>
      setMovementVessel({ batchId: id, ...v }),
    onSuccess: () => {
      setVesselError(null);
      qc.invalidateQueries({ queryKey: ['movements', id] });
      qc.invalidateQueries({ queryKey: ['vessel-options'] });
      qc.invalidateQueries({ queryKey: ['plant'] });
    },
    onError: (e) => setVesselError((e as Error).message),
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

  const maxRelDay = all.length > 0 ? Math.max(...all.map((r) => r.rel_day)) : 0;
  const baselineDays = all.length > 0 ? maxRelDay + 1 : 0;

  /**
   * THE STANDARD, NOT THE DAY GRID.
   *
   * This line read `baselineDays * 24`, which is `(total_days + 1) × 24` — the same generated
   * figure `process_definition.baseline_hours` holds, and the one CLAUDE.md names explicitly:
   * "never from `baseline_hours` … a day grid that reads 480 for the 470-hour standard".
   *
   * So this header announced `H0 → H480` for a PROCESS-2026C batch while the wizard's own review
   * step, two taps earlier, had correctly said 470. Seen on the handset run.
   *
   * It also computed it here, which the same file forbids: "Screen? Compute nothing." The standard
   * belongs to the process version THIS batch was generated from — not to the current catalogue
   * pointer, which may have moved since — so it is read per batch.
   */
  const baselineHours = processVersion.data?.standardHr ?? null;

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
                to={`/batch/${id}`}
                className="rounded-lg border px-3 py-2 font-head text-[12px] font-700"
                style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              >
                Open batch
              </Link>
            )}
            {/* Always reachable. Once a plan is frozen, a new batch is the only way to
                change targets — so the way out has to be on this screen. */}
            <Link
              to="/admin/batch/start"
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
          className="mb-4 rounded-xl border px-4 py-3 text-[13px] shadow-sm"
          style={{
            borderColor: banner.tone === 'ok' ? '#16794a' : 'var(--crit)',
            background: banner.tone === 'ok' ? 'var(--ok-soft)' : 'var(--crit-soft)',
            color: banner.tone === 'ok' ? '#16794a' : 'var(--crit)',
          }}
        >
          {banner.text}
        </div>
      )}

      {/* Master Batch Live Header Card */}
      <div className="bg-surface rounded-2xl p-5 mb-5 shadow-card border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Master Batch Layout</span>
            <h2 className="font-head text-xl font-extrabold text-ink">{b.label}</h2>
            <p className="text-xs text-muted mt-0.5">
              Day 0 starts {new Date(b.start_date).toDateString()} · Supervisor {b.supervisor_name ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm"
              style={{
                background: draft ? 'var(--surface-2)' : 'var(--ok-soft)',
                color: draft ? 'var(--muted)' : 'var(--ok)',
              }}
            >
              <span
                className="w-[7px] h-[7px] rounded-full"
                style={{ background: draft ? 'var(--muted)' : 'var(--ok)' }}
              />
              {draft ? 'DRAFT PLAN' : 'ACTIVE'}
            </span>
          </div>
        </div>

        <div className="py-4 text-center">
          <div className="font-head text-3xl font-extrabold text-accent">
            H0 → {baselineHours === null ? '—' : `H${baselineHours}`}
          </div>
          <p className="text-xs text-muted mt-1 font-mono">
            {all.length} Activities · {baselineDays} Total Process Days · Continuous Factory Clock
          </p>
        </div>
      </div>

      {/*
        Why every field on this page is greyed out. Activation freezes the baseline on
        purpose — that is the control the paper system has no way to offer — but a screen
        full of dead inputs with no explanation just reads as broken.
      */}
      {!draft && (
        <div
          className="mb-5 rounded-2xl border px-4 py-3 shadow-sm"
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

      {/*
        THE INCOMING-MATERIAL CHECK — shown only while the batch is a draft, because
        `open_prebatch_sample` refuses once it is active. That refusal is the point: the check is a
        precondition, not a retrospective note.
      */}
      {draft && (
        <div
          className="mb-5 rounded-2xl border p-4 shadow-sm"
          style={{
            borderColor: prebatch.data?.accepted ? 'var(--ok)' : 'var(--warn)',
            background: prebatch.data?.accepted ? 'var(--surface)' : 'var(--warn-soft)',
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-head text-[13px] font-700" style={{ color: 'var(--ink)' }}>
              Incoming material check
            </h3>
            <span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>
              required before H0
            </span>
          </div>

          {/*
            THREE STATES, NOT TWO.

            A sample whose results were recorded but never ACCEPTED blocks activation just as
            firmly as no sample at all — "0 of 1 result(s) accepted as final" — and an admin
            looking at a screen that only counted acceptances would see nothing to explain it.
            Recording a second sample makes it worse, so the form is deliberately withheld in that
            state and the screen names who has to finish the first one.

            Found by leaving exactly that state behind while testing an admin's refusal.
          */}
          {prebatch.data && prebatch.data.results_current > prebatch.data.accepted ? (
            <div className="mt-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
              <p>
                <span className="mono">{prebatch.data.checkpoint_code}</span> has{' '}
                {prebatch.data.accepted} of {prebatch.data.results_current} result
                {prebatch.data.results_current === 1 ? '' : 's'} accepted as final.
              </p>
              <p className="mt-1" style={{ color: 'var(--warn)' }}>
                A lab technician or supervisor must accept the rest before this batch can start.
                Do not record a second sample — it will not clear this one.
              </p>
              {/*
                The way out. Shown to everyone, because the server decides: a role that may not
                accept gets the refusal that names who may, which is more useful than a hidden
                button that leaves them wondering what to do next.
              */}
              <button
                type="button"
                className="mt-2 rounded-lg px-4 py-2.5 font-head text-[13px] font-700"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: acceptOutstanding.isPending ? 0.5 : 1,
                }}
                disabled={acceptOutstanding.isPending}
                onClick={() => acceptOutstanding.mutate()}
              >
                {acceptOutstanding.isPending
                  ? 'Accepting…'
                  : `Accept the ${prebatch.data.results_current - prebatch.data.accepted} outstanding reading${
                      prebatch.data.results_current - prebatch.data.accepted === 1 ? '' : 's'
                    }`}
              </button>
            </div>
          ) : prebatch.data && prebatch.data.accepted > 0 ? (
            <div className="mt-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
              <p>
                {prebatch.data.accepted} of {prebatch.data.tests_requested} reading
                {prebatch.data.tests_requested === 1 ? '' : 's'} accepted ·{' '}
                <span className="mono">{prebatch.data.checkpoint_code}</span>
              </p>
              <p className="mt-1" style={{ color: 'var(--muted)' }}>
                Collected {new Date(prebatch.data.collected_at).toLocaleString()}
                {prebatch.data.before_h0 === false && (
                  <span style={{ color: 'var(--warn)' }}> — after H0, which the record will show</span>
                )}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                The material must be sampled and its result accepted before the batch clock starts.
                Activation is refused until it is.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {PREBATCH_PARAMETERS.map((p) => (
                  <label key={p.code} className="flex flex-col gap-1">
                    <span
                      className="text-[10px] font-700 uppercase tracking-wider"
                      style={{ color: 'var(--muted)' }}
                    >
                      {p.label} {p.unit}
                    </span>
                    <input
                      className="mono w-28 rounded-lg border px-3 py-2 text-[14px]"
                      style={{ borderColor: 'var(--line-2)', background: 'var(--surface)', color: 'var(--ink)' }}
                      inputMode="decimal"
                      value={assay[p.code] ?? ''}
                      onChange={(e) => setAssay({ ...assay, [p.code]: e.target.value })}
                      placeholder="—"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="self-end rounded-lg px-4 py-2.5 font-head text-[13px] font-700"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    opacity:
                      takeCheck.isPending ||
                      PREBATCH_PARAMETERS.some((p) => !Number.isFinite(Number(assay[p.code])) || !assay[p.code])
                        ? 0.5
                        : 1,
                  }}
                  disabled={
                    takeCheck.isPending ||
                    prebatchCps.data === undefined ||
                    prebatchCps.data.length === 0 ||
                    PREBATCH_PARAMETERS.some((p) => !assay[p.code] || !Number.isFinite(Number(assay[p.code])))
                  }
                  onClick={() => takeCheck.mutate()}
                >
                  {takeCheck.isPending ? 'Recording…' : 'Record and accept'}
                </button>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Dry weight is not requested: no source states a method for it, and a test nobody can
                report would leave this permanently unaccepted.
              </p>
              {assayError && (
                <p className="mt-2 text-[12px]" style={{ color: 'var(--crit)' }}>
                  {assayError}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {draft && blocking.length > 0 && (
        <details
          className="mb-5 rounded-2xl border p-4 shadow-sm"
          style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)' }}
          open
        >
          <summary className="cursor-pointer font-head text-[13px] font-700" style={{ color: 'var(--crit)' }}>
            {blocking.length} item{blocking.length === 1 ? '' : 's'} to settle before this batch can start
          </summary>
          <ul className="mt-2 flex flex-col gap-1 pl-2">
            {blocking.slice(0, 12).map((f, i) => (
              <li key={i} className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                • {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/*
        WHERE THIS BATCH GOES, above the timeline.

        A batch-level decision, so it does not belong on thirty individual rows all saying the same
        thing. Line 2 of 3 is a SLOT; Bunker 7 is a place; binding them is what lets the plant view
        and every bunker-wise report exist at all.
      */}
      <MovementPlan
        movements={movements.data ?? []}
        individuals={individuals.data ?? []}
        options={vesselOptions.data ?? []}
        draft={draft}
        loading={movements.isLoading}
        busy={pickVessel.isPending}
        error={vesselError}
        onPick={(v) => pickVessel.mutate(v)}
      />

      {/* The timeline */}
      <div className="flex flex-col gap-6">
        {days.map((day, di) => {
          const items = all.filter((r) => r.rel_day === day);
          const nextDay = days[di + 1];
          const startHour = day * 24;
          const endHour = nextDay ? nextDay * 24 : (day + 1) * 24;
          const seededSpan = items.find((r) => r.day_span_label)?.day_span_label ?? null;
          const isRestSpan = items.every((r) => r.is_time_gate) && nextDay && nextDay - day > 1;
          const dayLabel =
            seededSpan ?? (isRestSpan ? `Day ${day}–${nextDay - 1}` : `Day ${day}`);
          const title = dayTitles.data?.[day] ?? '';

          // Group by activity code to avoid repeated wall of cards
          const codeGroups = new Map<string, ScheduleRow[]>();
          for (const item of items) {
            const list = codeGroups.get(item.code) ?? [];
            list.push(item);
            codeGroups.set(item.code, list);
          }

          return (
            <section key={day}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-1" style={{ borderColor: 'var(--line-2)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    H{startHour} → H{endHour}
                  </span>
                  <span className="text-xs text-muted font-medium">({dayLabel}{title ? ` · ${title}` : ''})</span>
                </div>
                <span className="ml-auto mono text-[11px] text-muted">{items.length} activities</span>
              </div>

              <div className="flex flex-col gap-2">
                {[...codeGroups.entries()].map(([code, group]) => {
                  if (group.length > 2) {
                    return (
                      <GroupedLoadRow
                        key={`${day}-${code}`}
                        code={code}
                        items={group}
                        draft={draft}
                        opts={o}
                        templates={templates}
                        findings={fs}
                        onSave={(rowId, patch) => save.mutate({ rowId, patch })}
                        onClearTime={(rowId) => clearTime.mutate(rowId)}
                        onAssign={async (rowId, pid, reason) => {
                          try {
                            await assignActivity(rowId, pid, reason);
                            refresh();
                          } catch (e) {
                            setBanner({ tone: 'crit', text: (e as Error).message });
                          }
                        }}
                        onAlert={async (rowId, role, title, reason) => {
                          try {
                            await sendAlert(rowId, role, title, reason);
                            setBanner({ tone: 'ok', text: `Alert sent to ${role.replace('_', ' ')}.` });
                          } catch (e) {
                            setBanner({ tone: 'crit', text: (e as Error).message });
                          }
                        }}
                      />
                    );
                  }

                  return group.map((r) => (
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
                      onClearTime={() => clearTime.mutate(r.id)}
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
                  ));
                })}
              </div>
            </section>
          );
        })}

        {/* Day 23 · a state page, not an operation. No activity is seeded for it. */}
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-1" style={{ borderColor: 'var(--line-2)' }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-muted-foreground px-2 py-0.5 rounded bg-muted">
                H{days.length * 24}
              </span>
              <span className="text-xs text-muted font-medium">(Day 23 · Batch Completion)</span>
            </div>
            <span className="ml-auto mono text-[11px] text-muted">final state</span>
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
  onClearTime,
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
  onClearTime: () => void;
  onAssign: (personId: string, reason?: string) => void;
  onAlert: (role: 'operator' | 'lab_tech' | 'supervisor', reason?: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
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

  const startHr = row.baseline_start_hour ?? row.rel_day * 24;
  const durHr = row.day0_duration_hr ?? row.duration_target_min_hr ?? 1;
  const endHr = row.baseline_end_hour ?? (startHr + durHr);
  const durText = durHr >= 1 ? `${durHr}h` : `${Math.round(durHr * 60)}m`;

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
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                H{startHr} → H{endHr}
              </span>
              <span className="font-mono text-xs text-muted-foreground font-semibold">
                {durText}
              </span>
              <span className="font-head text-[14px] font-700">{row.title}</span>
              {isLab ? <Chip tone="accent">lab</Chip> : row.is_time_gate ? <Chip tone="inherit">time gate</Chip> : null}
              {row.tbd_marker && <ConflictMarker id={row.tbd_marker} />}
            </span>
            <span className="mt-0.5 block mono text-[11px] text-muted">
              Day {row.rel_day} · {row.scope_label}
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
          {/* 4-Register Summary Card */}
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg border border-border" style={{ background: 'var(--surface-2)' }}>
            <div>
              <span className="block text-[10px] uppercase font-mono font-bold text-muted">STANDARD</span>
              <span className="font-mono text-xs font-semibold text-ink">H{row.rel_day * 24}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono font-bold text-muted">ADMIN PLAN</span>
              <span className="font-mono text-xs font-semibold text-primary">
                {row.planned_time ? `H${startHr} (${row.planned_time.slice(0, 5)})` : '— Standard'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono font-bold text-muted">ACTUAL</span>
              <span className="font-mono text-xs font-semibold" style={{ color: '#16794a' }}>
                {row.actual_start ? new Date(row.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not started'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono font-bold text-muted">FORECAST</span>
              <span className="font-mono text-xs font-semibold text-ink">
                {row.planned_end_at ? new Date(row.planned_end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `H${endHr}`}
              </span>
            </div>
          </div>

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
              destKind === 'TUNNEL' ? (
                <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted">
                  <strong className="text-ink">Phase II Tunnel Loading:</strong> Tunnel allocation is configured per Individual Batch in the Movement Plan above.
                </div>
              ) : (
                <Ctl
                  label="Into bunker"
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
              )
            )}

            {/* Machine */}
            {!isLab && !row.is_time_gate && (
              <Ctl
                label="Machine"
                hint={row.code === 'TR-T1' ? 'Turner for T1' : row.code === 'TR-T2' ? 'must differ from the turner on T1' : undefined}
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

            {/* Planned Timing Register */}
            {!row.is_time_gate && (
              <div className="sm:col-span-2 p-3.5 rounded-xl border border-line bg-surface-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono uppercase font-bold text-muted block">Planned Timing</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-sm font-bold text-ink">H{startHr} → H{endHr}</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: row.planned_time ? 'var(--accent-soft)' : 'var(--surface)',
                        color: row.planned_time ? 'var(--accent)' : 'var(--muted)',
                        border: '1px solid var(--line-2)',
                      }}
                    >
                      {row.planned_time ? 'Admin Adjusted' : 'Standard Process'}
                    </span>
                  </div>
                  {row.planned_time ? (
                    <span className="text-[11px] text-muted block mt-0.5">
                      you set this · Planned wall-clock: {row.planned_time.slice(0, 5)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted block mt-0.5">
                      standard: day {row.rel_day} · default placement
                    </span>
                  )}
                </div>

                {draft && (
                  <div className="flex items-center gap-2">
                    {row.planned_time && (
                      <button
                        type="button"
                        onClick={() => onClearTime()}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-muted hover:text-ink border border-line bg-surface"
                      >
                        Reset to Standard
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAdjustModalOpen(true)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-on-accent bg-accent hover:opacity-90 transition-all shadow-sm"
                    >
                      {row.planned_time ? 'Change Adjustment' : 'Adjust Planned Time'}
                    </button>
                  </div>
                )}
              </div>
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

      {adjustModalOpen && (
        <AdjustPlannedTimeModal
          row={row}
          onClose={() => setAdjustModalOpen(false)}
          onSave={(newTime, reason) => {
            onSave({ planned_time: newTime, override_reason: reason });
          }}
          onClear={() => onClearTime()}
        />
      )}
    </div>
  );
}

function AdjustPlannedTimeModal({
  row,
  onClose,
  onSave,
  onClear,
}: {
  row: ScheduleRow;
  onClose: () => void;
  onSave: (newTime: string, reason: string) => void;
  onClear: () => void;
}) {
  const [time, setTime] = useState(row.planned_time?.slice(0, 5) ?? '');
  const [reason, setReason] = useState('');
  const standardHour = row.rel_day * 24;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-raised space-y-4 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase font-bold text-muted">Controlled Plan Override</span>
            <h3 className="font-head text-base font-bold text-ink">Adjust Planned Time</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-sm font-bold p-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="font-head text-sm font-bold text-ink">{row.title}</p>
            <p className="text-xs text-muted">Day {row.rel_day} · {row.scope_label}</p>
          </div>

          <div className="p-3 rounded-xl bg-surface-2 border border-line flex items-center justify-between">
            <span className="text-xs text-muted font-mono">Standard Process:</span>
            <span className="font-mono text-xs font-bold text-ink">
              H{standardHour} → H{standardHour + (row.day0_duration_hr ?? row.duration_target_min_hr ?? 1)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-2 mb-1">New Planned Time (Wall Clock) *</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm font-mono text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-2 mb-1">Operational Reason *</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. JCB unavailable until 09:00"
              className="w-full rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-line">
          {row.planned_time ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              Reset to Standard
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-ink-2 hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!time || !reason.trim()}
              onClick={() => {
                if (!time || !reason.trim()) return;
                onSave(time, reason.trim());
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Save Adjustment
            </button>
          </div>
        </div>
      </div>
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

function GroupedLoadRow({
  code,
  items,
  draft,
  opts,
  templates,
  findings,
  onSave,
  onClearTime,
  onAssign,
  onAlert,
}: {
  code: string;
  items: ScheduleRow[];
  draft: boolean;
  opts: Opts;
  templates: Map<string, string>;
  findings: Finding[];
  onSave: (rowId: string, patch: Record<string, string | null>) => void;
  onClearTime: (rowId: string) => void;
  onAssign: (rowId: string, personId: string, reason?: string) => Promise<void>;
  onAlert: (rowId: string, role: 'operator' | 'lab_tech' | 'supervisor', title: string, reason?: string) => Promise<void>;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const totalTarget = items.reduce((s, i) => s + (i.planned_qty_mt ?? 0), 0);
  const title = items[0]?.title ?? code;
  const startHr = items[0]?.baseline_start_hour ?? items[0]?.rel_day * 24;
  const endHr = items[items.length - 1]?.baseline_end_hour ?? (startHr + items.length);

  const isWeighment = code.includes('WEIGH');
  const isBunkerMovement = code.includes('BUNK') || code.includes('UNLOAD') || code.includes('RELOAD');
  const isHopperPass = code.includes('HOP');

  const groupTypeLabel = isWeighment
    ? `${items.length} Weighment Loads`
    : isBunkerMovement
    ? `${items.length} Bunker Movements`
    : isHopperPass
    ? `${items.length} Hopper Passes`
    : `${items.length} Movement Lines`;

  const itemPrefix = isWeighment ? 'Load' : isBunkerMovement ? 'Line' : isHopperPass ? 'Pass' : 'Line';

  return (
    <div className="bg-surface rounded-xl border border-line p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
              H{startHr} → H{endHr}
            </span>
            <span className="font-mono text-xs font-bold text-ink-2">{groupTypeLabel}</span>
            {totalTarget > 0 && (
              <span className="font-mono text-xs font-semibold text-muted">
                {isWeighment ? `Target: ${totalTarget.toFixed(1)} MT` : `Total Planned: ${totalTarget.toFixed(1)} MT`}
              </span>
            )}
          </div>
          <h4 className="font-head text-base font-bold text-ink">{title}</h4>
        </div>
        <span className="text-xs text-muted">Select an instance to view/edit:</span>
      </div>

      {/* Interactive Compact Instance Rail */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((it, idx) => {
          const isSelected = selectedIdx === idx;
          const isDone = it.actual_end !== null || it.actual_start !== null;
          const destLoc = opts.locations.find((l) => l.id === it.destination_location_id);
          const srcLoc = opts.locations.find((l) => l.id === it.source_location_id);
          const movementLabel = srcLoc && destLoc ? `${srcLoc.label} → ${destLoc.label}` : destLoc ? `→ ${destLoc.label}` : null;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setSelectedIdx(isSelected ? null : idx)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
              style={{
                background: isSelected ? 'var(--accent)' : isDone ? 'var(--ok-soft)' : 'var(--surface-2)',
                color: isSelected ? '#fff' : isDone ? 'var(--ok)' : 'var(--ink)',
                border: isSelected ? 'none' : '1px solid var(--line-2)',
              }}
            >
              <span>{isDone ? '✓' : '●'}</span>
              <span>{itemPrefix} {String(idx + 1).padStart(2, '0')}</span>
              {movementLabel && <span className="opacity-80 text-[10px]">{movementLabel}</span>}
              {it.planned_qty_mt && <span className="opacity-70 text-[10px]">({it.planned_qty_mt}MT)</span>}
            </button>
          );
        })}
      </div>

      {/* Selected instance detail drawer */}
      {selectedIdx !== null && items[selectedIdx] && (
        <div className="mt-3 pt-3 border-t border-line">
          <Row
            row={items[selectedIdx]}
            open={true}
            draft={draft}
            opts={opts}
            templateId={templates.get(items[selectedIdx].id)}
            finding={findings.find((f) => f.activity_id === items[selectedIdx].id)}
            onToggle={() => setSelectedIdx(null)}
            onSave={(patch) => onSave(items[selectedIdx].id, patch)}
            onClearTime={() => onClearTime(items[selectedIdx].id)}
            onAssign={(pid, reason) => onAssign(items[selectedIdx].id, pid, reason)}
            onAlert={(role, reason) =>
              onAlert(
                items[selectedIdx].id,
                role,
                `${items[selectedIdx].title} — ${items[selectedIdx].scope_label}`,
                reason
              )
            }
          />
        </div>
      )}
    </div>
  );
}
