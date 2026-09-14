import { supabase } from '../../../shared/api/client';
import { loadTower } from '../../../shared/api/tower';
import { batchDay } from '../../../domain/time';
import type { AdminBlocker, AdminTodayData, RunningBatch, StartingToday } from '../../../domain/contracts';

type BatchRow = {
  id: string;
  code: string;
  label: string;
  start_date: string;
  start_at: string | null;
  status: string;
  supervisor_name: string | null;
};

async function blockersFor(batch: BatchRow): Promise<AdminBlocker[]> {
  const { data, error } = await supabase.rpc('validate_batch', { p_batch: batch.id });
  if (error) throw error;
  return ((data ?? []) as { severity: string; code: string; message: string; activity_id: string | null }[])
    .filter((f) => f.severity === 'blocking')
    .map((f) => ({
      batchId: batch.id,
      batchCode: batch.code,
      code: f.code,
      message: f.message,
      activityId: f.activity_id,
    }));
}

export async function loadAdminToday(factoryToday: string = new Date().toISOString().slice(0, 10)): Promise<AdminTodayData> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, start_at, status, supervisor_name')
    .in('status', ['draft', 'active'])
    .order('start_date');
  if (error) throw error;

  const rows = (data ?? []) as BatchRow[];
  const drafts = rows.filter((b) => b.status === 'draft');

  const blockerLists = await Promise.all(drafts.map(blockersFor));
  const blockersByBatch = new Map(drafts.map((b, i) => [b.id, blockerLists[i]]));

  const startingToday: StartingToday[] = drafts
    .filter((b) => b.start_date <= factoryToday)
    .map((b) => ({
      batchId: b.id,
      code: b.code,
      label: b.label,
      startDate: b.start_date,
      overdue: b.start_date < factoryToday,
      supervisor: b.supervisor_name,
      blockingCount: (blockersByBatch.get(b.id) ?? []).length,
    }));

  const tower = await loadTower();
  const barByBatch = new Map(tower.bars.map((b: any) => [b.batchId, b]));

  const running: RunningBatch[] = rows
    .filter((b) => b.status === 'active')
    .map((b) => {
      const bar = barByBatch.get(b.id);
      const nowHour = bar?.nowHour ?? null;
      return {
        batchId: b.id,
        code: b.code,
        label: b.label,
        nowHour,
        batchDayNo: nowHour === null ? null : batchDay(nowHour),
        baselineHours: bar?.clock.baselineHours ?? null,
        flagCount: bar?.flags.length ?? 0,
      };
    })
    .sort((a, b) => (b.nowHour ?? -1) - (a.nowHour ?? -1));

  return {
    factoryToday,
    startingToday,
    running,
    needsAdmin: blockerLists.flat(),
  };
}
