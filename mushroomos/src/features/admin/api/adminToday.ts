import { supabase } from './client';
import { loadTower } from './tower';
import { batchDay } from '../domain/time';
import type { AdminBlocker, AdminTodayData, RunningBatch, StartingToday } from '../domain/contracts';

/**
 * Admin's home. `UI_IMPLEMENTATION_PLAN §S4`.
 *
 * IT ANSWERS THREE QUESTIONS AND NOTHING ELSE:
 *
 *   What starts today?   What is running?   What needs me?
 *
 * What it replaced answered none of them. It rendered `Process definition`,
 * `Activity templates`, `Evidence requirements` and `Gates shipped disabled` — process-engine
 * metadata on a factory manager's home screen. Its own header said "in the finished product this
 * is today's schedule with start-these and these-are-running. Neither exists yet — there is no
 * schedule import and no batch." That was true when it was written and false by the time anyone
 * read it: there are batches now, and the honest note had become a stale claim about the system's
 * own state. Same class of defect as C9's lab band.
 *
 * The reference counts are not deleted from the product — they belong on `/admin/reference` and
 * `/admin/process-explorer`, which is where someone goes to ask about the process definition
 * rather than about today.
 *
 * TODAY IS PASSED IN, not computed here. `factoryDate` lives in `components/composite/geometry.ts`
 * and an api module importing a component would invert the layering (`UI_COMPONENT_ARCHITECTURE
 * §1`). One implementation of the date logic, called by the route.
 */

type BatchRow = {
  id: string;
  code: string;
  label: string;
  start_date: string;
  start_at: string | null;
  status: string;
  supervisor_name: string | null;
};

/**
 * What only an Admin can clear, per draft batch.
 *
 * `validate_batch` is the authority — the same call `activate_batch` runs before it will do
 * anything — so this cannot disagree with what activation will say. Reported per batch rather
 * than as a total, because "3 blockers" is not actionable and "Bunker Reload line 2 has nobody
 * assigned" is.
 */
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

export async function loadAdminToday(factoryToday: string): Promise<AdminTodayData> {
  const { data, error } = await supabase
    .from('master_batch')
    .select('id, code, label, start_date, start_at, status, supervisor_name')
    .in('status', ['draft', 'active'])
    .order('start_date');
  if (error) throw error;

  const rows = (data ?? []) as BatchRow[];
  const drafts = rows.filter((b) => b.status === 'draft');

  // Every draft's blockers, in parallel. At the factory's real scale this is a handful of calls;
  // `TIME_MODEL_CONFIRMED §2.4` puts the steady state at about twelve concurrent batches.
  const blockerLists = await Promise.all(drafts.map(blockersFor));
  const blockersByBatch = new Map(drafts.map((b, i) => [b.id, blockerLists[i]]));

  const startingToday: StartingToday[] = drafts
    // A draft whose Day 0 is today or has already passed still needs starting — a batch that
    // should have begun yesterday is MORE urgent, not less, so it is not filtered out.
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

  // The hour position comes from the tower rather than a second computation of the same thing.
  const tower = await loadTower();
  const barByBatch = new Map(tower.bars.map((b) => [b.batchId, b]));

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
        // Null, not zero. A batch with no recorded position has not started, and a zero here
        // would read as "Day 0" — a different and false claim.
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
