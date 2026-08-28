import { describe, expect, it } from 'vitest';
import { rowsFromCells } from '../src/lib/monthlyScheduleImport';
import {
  DAY0_STRUCTURE,
  DB_URL,
  NO_DB_REASON,
  all,
  defaultRoleBindings,
  one,
  refuses,
  withRollback,
  type Db,
} from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

describe('P1 · Monthly schedule import parsing & validation', () => {
  it('parses valid spreadsheet rows and matches headers', () => {
    const cells = [
      { 'Batch numbers': 'Batch numbers', 'Start date': 'Start date', Description: 'Description', Resources: 'Resources' },
      { 'Batch numbers': '366,367,368', 'Start date': '2026-09-01', Description: 'Group A', Resources: 'Bunker 1' },
      { 'Batch numbers': '369,370,371', 'Start date': '2026-09-08', Description: 'Group B', Resources: 'Bunker 2' },
    ];

    const result = rowsFromCells(cells, '2026-09-01');
    expect(result.hasErrors).toBe(false);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].group_code).toBe('366,367,368');
    expect(result.rows[0].scheduled_start_date).toBe('2026-09-01');
    expect(result.rows[0].group_label).toBe('Group A');
    expect(result.rows[0].resource_note).toBe('Bunker 1');
  });

  it('detects duplicate batch codes in preview and reports warnings/errors', () => {
    const cells = [
      { 'Batch numbers': 'Batch numbers', 'Start date': 'Start date' },
      { 'Batch numbers': '366,367,368', 'Start date': '2026-09-01' },
      { 'Batch numbers': '366,367,368', 'Start date': '2026-09-05' },
    ];

    const result = rowsFromCells(cells, '2026-09-01');
    expect(result.hasErrors).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.validatedRows[0].validation.errors).toContain('Duplicate batch group code in this file');
  });

  it('rejects dates outside the selected month', () => {
    const cells = [
      { 'Batch number': 'Batch number', Date: 'Date' },
      { 'Batch number': '366,367,368', Date: '2026-10-01' },
    ];

    const result = rowsFromCells(cells, '2026-09-01');
    expect(result.hasErrors).toBe(true);
    expect(result.validatedRows[0].validation.errors[0]).toContain('outside the selected month');
  });
});

describeDb('P1 · Database Monthly Schedule Import and Claim RPCs', () => {
  it('imports monthly schedule groups and links them to draft Master Batches', async () => {
    await withRollback(async (db: Db) => {
      // Set session role to admin
      const admin = await one<{ id: string }>(
        db,
        `select id from profiles where role = 'admin' limit 1`
      );
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: admin.id, app_metadata: { app_role: 'admin' } }),
      ]);

      const scheduleMonth = '2026-09-01';
      const filename = 'September_2026_Schedule.xlsx';
      const columnMap = { group_code: 'Batch numbers', scheduled_start_date: 'Start date' };
      const rows = [
        {
          source_row_number: 2,
          group_code: 'MB-TEST-901',
          group_label: 'Test Batch 901',
          scheduled_start_date: '2026-09-01',
          resource_note: 'Bunker 1',
          raw_row: { 'Batch numbers': 'MB-TEST-901', 'Start date': '2026-09-01' },
        },
      ];

      const importId = await one<{ import_monthly_schedule: string }>(
        db,
        `select public.import_monthly_schedule($1, $2, $3, $4) as import_monthly_schedule`,
        [scheduleMonth, filename, JSON.stringify(columnMap), JSON.stringify(rows)]
      );
      expect(importId.import_monthly_schedule).toBeTruthy();

      const groups = await all<{
        id: string;
        group_code: string;
        scheduled_start_date: string;
        status: string;
      }>(
        db,
        `select id, group_code, scheduled_start_date::text, status from monthly_schedule_group where schedule_import_id = $1`,
        [importId.import_monthly_schedule]
      );
      expect(groups.length).toBe(1);
      expect(groups[0].group_code).toBe('MB-TEST-901');
      expect(groups[0].status).toBe('scheduled');

      // Now create a Master Batch matching the scheduled group
      const roles = await defaultRoleBindings(db);
      const batchRow = await one<{ id: string }>(
        db,
        `select public.create_master_batch($1, $2, $3, $4, $5, $6, $7) as id`,
        [
          'MB-TEST-901',
          'MB-TEST-901',
          '2026-09-01',
          JSON.stringify(DAY0_STRUCTURE),
          JSON.stringify(roles),
          'Supervisor Test',
          'Clear',
        ]
      );
      expect(batchRow.id).toBeTruthy();

      // Claim the monthly schedule group for this batch
      await db.query(`select public.claim_monthly_schedule_group($1, $2)`, [
        groups[0].id,
        batchRow.id,
      ]);

      // Verify the group status transitioned to 'instantiated' and master_batch_id is linked
      const updatedGroup = await one<{ status: string; master_batch_id: string }>(
        db,
        `select status, master_batch_id from monthly_schedule_group where id = $1`,
        [groups[0].id]
      );
      expect(updatedGroup.status).toBe('instantiated');
      expect(updatedGroup.master_batch_id).toBe(batchRow.id);

      // Verify master_batch has schedule_group_id set
      const updatedBatch = await one<{ schedule_group_id: string }>(
        db,
        `select schedule_group_id from master_batch where id = $1`,
        [batchRow.id]
      );
      expect(updatedBatch.schedule_group_id).toBe(groups[0].id);
    });
  });

  it('refuses to claim a group if the batch code or date does not match the schedule', async () => {
    await withRollback(async (db: Db) => {
      const admin = await one<{ id: string }>(
        db,
        `select id from profiles where role = 'admin' limit 1`
      );
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: admin.id, app_metadata: { app_role: 'admin' } }),
      ]);

      const scheduleMonth = '2026-09-01';
      const rows = [
        {
          source_row_number: 2,
          group_code: 'MB-TEST-902',
          group_label: null,
          scheduled_start_date: '2026-09-05',
          resource_note: null,
          raw_row: {},
        },
      ];

      const importId = await one<{ id: string }>(
        db,
        `select public.import_monthly_schedule($1, $2, $3, $4) as id`,
        [scheduleMonth, 'Schedule.xlsx', '{}', JSON.stringify(rows)]
      );

      const group = await one<{ id: string }>(
        db,
        `select id from monthly_schedule_group where schedule_import_id = $1`,
        [importId.id]
      );

      const roles = await defaultRoleBindings(db);
      const batchRow = await one<{ id: string }>(
        db,
        `select public.create_master_batch($1, $2, $3, $4, $5, $6, $7) as id`,
        [
          'MB-MISMATCHED-CODE',
          'MB-MISMATCHED-CODE',
          '2026-09-05',
          JSON.stringify(DAY0_STRUCTURE),
          JSON.stringify(roles),
          'Supervisor Test',
          'Clear',
        ]
      );

      const err = await refuses(
        db,
        `select public.claim_monthly_schedule_group($1, $2)`,
        [group.id, batchRow.id]
      );
      expect(err).toMatch(/identity and Day 0 date must match/);
    });
  });
});
