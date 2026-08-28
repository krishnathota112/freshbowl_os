import { supabase } from './client';

export type ScheduledBatchGroup = {
  id: string;
  groupCode: string;
  groupLabel: string | null;
  scheduledStartDate: string;
  resourceNote: string | null;
  status: 'scheduled' | 'instantiated' | 'cancelled';
  masterBatchId: string | null;
  masterBatchStatus: string | null;
};

export type MonthlySchedule = {
  id: string;
  sourceFilename: string;
  importedAt: string;
  sourceRows: number;
  groups: ScheduledBatchGroup[];
};

export type ScheduleImportRow = {
  source_row_number: number;
  group_code: string;
  group_label: string | null;
  scheduled_start_date: string;
  resource_note: string | null;
  raw_row: Record<string, string>;
};

/** Read the current planning input for one calendar month, not execution history. */
export async function loadMonthlySchedule(scheduleMonth: string): Promise<MonthlySchedule | null> {
  const { data: imported, error } = await supabase
    .from('monthly_schedule_import')
    .select(
      'id, source_filename, imported_at, source_rows, monthly_schedule_group(id, group_code, group_label, scheduled_start_date, resource_note, status, master_batch_id)'
    )
    .eq('schedule_month', scheduleMonth)
    .eq('is_current', true)
    .maybeSingle();
  if (error) throw error;
  if (!imported) return null;

  const rawGroups = ((imported as Record<string, unknown>).monthly_schedule_group ?? []) as Record<
    string,
    unknown
  >[];
  const batchIds = rawGroups
    .map((row) => row.master_batch_id as string | null)
    .filter((id): id is string => Boolean(id));

  const stateByBatch = new Map<string, string>();
  if (batchIds.length) {
    const { data: batches, error: batchError } = await supabase
      .from('master_batch')
      .select('id, status')
      .in('id', batchIds);
    if (batchError) throw batchError;
    for (const batch of batches ?? []) stateByBatch.set(batch.id as string, batch.status as string);
  }

  return {
    id: imported.id as string,
    sourceFilename: imported.source_filename as string,
    importedAt: imported.imported_at as string,
    sourceRows: imported.source_rows as number,
    groups: rawGroups
      .map((row) => {
        const masterBatchId = (row.master_batch_id as string | null) ?? null;
        return {
          id: row.id as string,
          groupCode: row.group_code as string,
          groupLabel: (row.group_label as string | null) ?? null,
          scheduledStartDate: row.scheduled_start_date as string,
          resourceNote: (row.resource_note as string | null) ?? null,
          status: row.status as ScheduledBatchGroup['status'],
          masterBatchId,
          masterBatchStatus: masterBatchId ? stateByBatch.get(masterBatchId) ?? null : null,
        };
      })
      .sort((a, b) => a.scheduledStartDate.localeCompare(b.scheduledStartDate) || a.groupCode.localeCompare(b.groupCode)),
  };
}

export async function loadScheduledBatchGroup(id: string): Promise<ScheduledBatchGroup> {
  const { data, error } = await supabase
    .from('monthly_schedule_group')
    .select('id, group_code, group_label, scheduled_start_date, resource_note, status, master_batch_id')
    .eq('id', id)
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    groupCode: data.group_code as string,
    groupLabel: (data.group_label as string | null) ?? null,
    scheduledStartDate: data.scheduled_start_date as string,
    resourceNote: (data.resource_note as string | null) ?? null,
    status: data.status as ScheduledBatchGroup['status'],
    masterBatchId: (data.master_batch_id as string | null) ?? null,
    masterBatchStatus: null,
  };
}

export async function importSchedule(
  scheduleMonth: string,
  filename: string,
  columnMap: Record<string, string>,
  rows: ScheduleImportRow[]
): Promise<string> {
  const { data, error } = await supabase.rpc('import_monthly_schedule', {
    p_schedule_month: scheduleMonth,
    p_source_filename: filename,
    p_column_map: columnMap,
    p_rows: rows,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelScheduledBatchGroup(id: string): Promise<void> {
  const { error } = await supabase
    .from('monthly_schedule_group')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'scheduled');
  if (error) throw error;
}
