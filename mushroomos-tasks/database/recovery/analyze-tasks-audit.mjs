// Inspect the saved audit export without contacting the live database.
import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('./tasks-audit-2026-09-30.json', import.meta.url), 'utf8'));
const audits = data.audit;
const batches = audits.filter(e => e.action === 'tk_batch_create');
const out = batches.map(created => {
  const events = audits.filter(e => e.entity_id === created.entity_id && e.entity_table === 'tk_batch');
  const plan = events.find(e => e.action === 'tk_batch_plan');
  const schedule = events.find(e => e.action === 'tk_batch_schedule');
  const edits = events.filter(e => e.action === 'tk_batch_plan_edit');
  const snap = edits.at(-1)?.after_state?.after;
  const rows = snap?.rows || plan?.after_state?.rows || [];
  const rowIds = new Set(rows.map(r => r.id).filter(Boolean));
  const taskActions = audits.filter(e => e.entity_table === 'tk_task' && rowIds.has(e.entity_id));
  const latestTaskAction = taskActions.at(-1);
  return {
    id: created.entity_id,
    name: created.after_state?.name,
    created: created.occurred_at,
    createdBy: created.actor_id,
    sopId: snap?.batch?.sop_id || plan?.after_state?.source_sop,
    schedule: schedule?.after_state,
    planRows: plan?.after_state?.rows?.length,
    snapshotAt: edits.at(-1)?.occurred_at,
    snapshotRows: snap?.rows?.length,
    snapshotStatus: snap?.batch?.status,
    close: events.find(e => e.action === 'tk_batch_close')?.occurred_at,
    rowIds: rowIds.size,
    taskActions: taskActions.length,
    latestTaskAction: latestTaskAction && { at: latestTaskAction.occurred_at, action: latestTaskAction.action, taskId: latestTaskAction.entity_id },
  };
});
console.log(JSON.stringify({ batches: out, sopIds: data.sops.map(s => ({ id: s.id, name: s.name, version: s.version, status: s.status, rows: data.sopRows.filter(r => r.sop_id === s.id).length })) }, null, 2));
for (const name of ['173,174,175', '182', '183,184,185']) {
  const created = batches.filter(e => e.after_state?.name === name).at(-1);
  const events = audits.filter(e => e.entity_id === created?.entity_id && e.entity_table === 'tk_batch');
  const plan = events.find(e => e.action === 'tk_batch_plan');
  const snap = events.filter(e => e.action === 'tk_batch_plan_edit').at(-1)?.after_state?.after;
  const p = plan?.after_state?.rows?.[0];
  const s = snap?.rows?.[0];
  console.log(JSON.stringify({ name, id: created?.entity_id, planFirst: p, snapshotFirst: s, snapshotBatch: snap?.batch }, null, 2));
}
const snapshotIds = new Set(audits.filter(e => e.action === 'tk_batch_plan_edit').flatMap(e => e.after_state?.after?.rows || []).map(r => r.id));
const later = audits.filter(e => e.entity_table === 'tk_task' && !snapshotIds.has(e.entity_id));
const lastEdits = audits.filter(e => e.action === 'tk_batch_plan_edit').map(e => ({ id: e.entity_id, at: e.occurred_at }));
console.log(JSON.stringify({
  unmatchedTaskEvents: later.length,
  unmatchedSummary: later.reduce((acc, e) => { acc[e.action] = (acc[e.action] || 0) + 1; return acc; }, {}),
  unmatchedRecent: later.slice(-15).map(e => ({ at: e.occurred_at, action: e.action, taskId: e.entity_id, data: e.after_state })),
  postSnapshotActions: lastEdits.map(x => ({...x, actions: audits.filter(e => e.entity_table === 'tk_task' && e.occurred_at > x.at && (audits.filter(a => a.entity_id === x.id && a.action === 'tk_batch_plan_edit').at(-1)?.after_state?.after?.rows || []).some(r => r.id === e.entity_id)).map(e => ({ at:e.occurred_at, action:e.action, taskId:e.entity_id, data:e.after_state }))})),
}, null, 2));
