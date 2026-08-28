import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  cancelScheduledBatchGroup,
  importSchedule,
  loadMonthlySchedule,
  type ScheduledBatchGroup,
} from '../api/monthlySchedule';
import { Card, Chip, EmptyState } from '../components/primitives';
import {
  parseMonthlyScheduleFile,
  type ParsedMonthlySchedule,
} from '../lib/monthlyScheduleImport';
import { humanError } from '../lib/humanError';

function defaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export function MonthlySchedule() {
  const qc = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [preview, setPreview] = useState<ParsedMonthlySchedule | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const { data: schedule, isLoading, error } = useQuery({
    queryKey: ['monthly-schedule', selectedMonth],
    queryFn: () => loadMonthlySchedule(selectedMonth),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !selectedFile) throw new Error('No validated preview available to import');
      if (preview.hasErrors) throw new Error('Fix validation errors in preview before importing');
      return importSchedule(
        selectedMonth,
        selectedFile.name,
        preview.columnMap,
        preview.rows
      );
    },
    onSuccess: () => {
      setPreview(null);
      setSelectedFile(null);
      setParseError(null);
      qc.invalidateQueries({ queryKey: ['monthly-schedule', selectedMonth] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelScheduledBatchGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-schedule', selectedMonth] });
    },
  });

  async function handleFileSelected(file: File) {
    setSelectedFile(file);
    setParseError(null);
    try {
      const parsed = await parseMonthlyScheduleFile(file, selectedMonth);
      setPreview(parsed);
    } catch (err) {
      setPreview(null);
      const h = humanError(err);
      setParseError(h.detail ? `${h.title} — ${h.detail}` : h.title);
    }
  }

  const monthLabel = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly Production Schedule</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planning input for factory batch intake. A scheduled slot becomes a live Master Batch only when explicitly started.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month</label>
          <input
            type="month"
            value={selectedMonth.slice(0, 7)}
            onChange={(e) => {
              if (!e.target.value) return;
              setSelectedMonth(`${e.target.value}-01`);
              setPreview(null);
              setSelectedFile(null);
              setParseError(null);
            }}
            className="px-3 py-1.5 bg-card border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        </div>
      </div>

      {/* Upload Section */}
      <Card className="p-5 bg-card/60 border border-border/80">
        <h2 className="text-base font-semibold mb-2">Import Spreadsheet for {monthLabel}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Upload an Excel (.xlsx) or CSV monthly schedule. The file must contain columns for Batch numbers and Start dates.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
            className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
          />

          {selectedFile && (
            <div className="text-xs text-muted-foreground">
              Selected: <span className="font-mono text-foreground font-medium">{selectedFile.name}</span>
            </div>
          )}
        </div>

        {parseError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive flex items-center justify-between">
            <span>{parseError}</span>
            <button
              onClick={() => {
                setParseError(null);
                setSelectedFile(null);
              }}
              className="text-xs underline hover:no-underline ml-4"
            >
              Clear
            </button>
          </div>
        )}
      </Card>

      {/* Preview Section */}
      {preview && (
        <Card className="p-5 border-amber-500/40 bg-amber-500/5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-500/20 px-2 py-0.5 rounded">
                  Preview & Validation
                </span>
                <h3 className="text-sm font-semibold">
                  {preview.rows.length} valid groups detected in {selectedFile?.name}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Review parsed batch groups before committing to the schedule for {monthLabel}.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setSelectedFile(null);
                }}
                className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={preview.hasErrors || importMutation.isPending}
                onClick={() => importMutation.mutate()}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing...' : `Confirm & Import Schedule (${preview.rows.length})`}
              </button>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {preview.warnings.map((w, idx) => (
                <div key={idx}>⚠️ {w}</div>
              ))}
            </div>
          )}

          {preview.hasErrors && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive font-medium">
              Resolve the row validation errors marked below in your file and upload again.
            </div>
          )}

          {/* Preview Table */}
          <div className="overflow-x-auto border border-border rounded max-h-72">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/80 sticky top-0 border-b border-border text-muted-foreground uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="p-2.5">Row</th>
                  <th className="p-2.5">Batch Code(s)</th>
                  <th className="p-2.5">Scheduled Date</th>
                  <th className="p-2.5">Label</th>
                  <th className="p-2.5">Resource / Notes</th>
                  <th className="p-2.5">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {preview.validatedRows.map((r, idx) => (
                  <tr key={idx} className={r.validation.isValid ? 'hover:bg-muted/30' : 'bg-destructive/5'}>
                    <td className="p-2.5 text-muted-foreground">{r.source_row_number}</td>
                    <td className="p-2.5 font-bold text-foreground">{r.group_code || '—'}</td>
                    <td className="p-2.5">{r.scheduled_start_date || '—'}</td>
                    <td className="p-2.5 text-muted-foreground">{r.group_label || '—'}</td>
                    <td className="p-2.5 text-muted-foreground">{r.resource_note || '—'}</td>
                    <td className="p-2.5">
                      {r.validation.isValid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">OK</span>
                      ) : (
                        <span className="text-destructive font-semibold">
                          {r.validation.errors.join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Current Month Active Schedule */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Scheduled Batches for {monthLabel}</h2>
          {schedule && (
            <span className="text-xs text-muted-foreground font-mono">
              Imported {new Date(schedule.importedAt).toLocaleDateString()} · {schedule.sourceFilename}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading schedule...</div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded border border-destructive/20">
            <strong>{humanError(error).title}</strong>
            {humanError(error).detail && <div className="text-xs mt-1">{humanError(error).detail}</div>}
          </div>
        ) : !schedule || schedule.groups.length === 0 ? (
          <EmptyState
            title={`No schedule imported for ${monthLabel}`}
            detail="Upload an Excel monthly production schedule above to populate scheduled batch groups."
          />
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="p-3">Batch Code</th>
                  <th className="p-3">Scheduled Start Date</th>
                  <th className="p-3">Label / Description</th>
                  <th className="p-3">Resource Notes</th>
                  <th className="p-3">Scheduling Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedule.groups.map((group: ScheduledBatchGroup) => (
                  <tr key={group.id} className="hover:bg-muted/20">
                    <td className="p-3 font-bold font-mono text-sm text-foreground">
                      {group.groupCode}
                    </td>
                    <td className="p-3 font-mono">
                      {group.scheduledStartDate}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {group.groupLabel || '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {group.resourceNote || '—'}
                    </td>
                    <td className="p-3">
                      {group.status === 'instantiated' ? (
                        <div className="flex items-center gap-2">
                          <Chip tone="ok">Instantiated</Chip>
                          {group.masterBatchId && (
                            <Link
                              to={`/batch/${group.masterBatchId}`}
                              className="text-xs text-primary underline hover:no-underline font-mono"
                            >
                              Open Batch
                            </Link>
                          )}
                        </div>
                      ) : group.status === 'cancelled' ? (
                        <Chip tone="muted">Cancelled</Chip>
                      ) : (
                        <Chip tone="warn">Scheduled</Chip>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {group.status === 'scheduled' && (
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/batch/new?scheduleGroupId=${encodeURIComponent(group.id)}&groupCode=${encodeURIComponent(group.groupCode)}&scheduledStartDate=${encodeURIComponent(group.scheduledStartDate)}`}
                            className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded hover:bg-primary/90 transition-colors"
                          >
                            Create Master Batch
                          </Link>
                          <button
                            type="button"
                            onClick={() => cancelMutation.mutate(group.id)}
                            disabled={cancelMutation.isPending}
                            className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Cancel scheduled slot"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {group.status === 'instantiated' && group.masterBatchId && (
                        <Link
                          to={`/batch/${group.masterBatchId}`}
                          className="px-3 py-1.5 bg-muted text-foreground text-xs rounded font-medium hover:bg-muted/80"
                        >
                          View Batch &rarr;
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
