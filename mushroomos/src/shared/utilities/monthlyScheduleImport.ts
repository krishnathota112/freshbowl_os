import type { ScheduleImportRow } from '../../features/admin/api/monthlySchedule';

export type ScheduleRowValidation = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type ValidatedScheduleRow = ScheduleImportRow & {
  validation: ScheduleRowValidation;
};

export type ParsedMonthlySchedule = {
  rows: ScheduleImportRow[];
  validatedRows: ValidatedScheduleRow[];
  columnMap: Record<string, string>;
  warnings: string[];
  hasErrors: boolean;
};

const CODE_HEADERS = ['batch', 'batch number', 'batch numbers', 'master batch', 'master batch number', 'group', 'batch no'];
const DATE_HEADERS = ['date', 'start date', 'scheduled date', 'day 0 date', 'day 0', 'start_date', 'scheduled_start_date'];
const LABEL_HEADERS = ['label', 'description', 'batch name', 'remarks', 'title'];
const RESOURCE_HEADERS = ['resources', 'resource', 'machine', 'bunker', 'notes', 'resource note'];

const canonical = (value: string) => value.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');

function firstMatching(headers: string[], candidates: string[]): string | null {
  return headers.find((header) => candidates.includes(canonical(header))) ?? null;
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's 1900 epoch includes the historical leap-year bug, hence 1899-12-30.
    return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

export function rowsFromCells(
  cells: Array<Record<string, unknown>>,
  targetMonth?: string
): ParsedMonthlySchedule {
  if (cells.length < 2) throw new Error('The spreadsheet needs a header row and at least one scheduled batch.');
  const headers = Object.keys(cells[0]).filter(Boolean);
  const codeHeader = firstMatching(headers, CODE_HEADERS);
  const dateHeader = firstMatching(headers, DATE_HEADERS);
  if (!codeHeader || !dateHeader) {
    throw new Error('Use a “Batch numbers” column and a “Start date” column in the spreadsheet.');
  }
  const labelHeader = firstMatching(headers, LABEL_HEADERS);
  const resourceHeader = firstMatching(headers, RESOURCE_HEADERS);

  const seenCodes = new Set<string>();
  const duplicateCodes = new Set<string>();
  const generalWarnings: string[] = [];

  const rawRows = cells.slice(1).flatMap((row, index) => {
    const groupCode = text(row[codeHeader]);
    const scheduledStartDate = isoDate(row[dateHeader]);
    // A completely blank spreadsheet row is ignored
    if (!groupCode && !scheduledStartDate) return [];

    const rawRow = Object.fromEntries(headers.map((header) => [header, text(row[header])]));
    return [{
      source_row_number: index + 2,
      group_code: groupCode,
      group_label: labelHeader ? text(row[labelHeader]) || null : null,
      scheduled_start_date: scheduledStartDate || '',
      resource_note: resourceHeader ? text(row[resourceHeader]) || null : null,
      raw_row: rawRow,
    }];
  });

  if (!rawRows.length) throw new Error('The spreadsheet has no scheduled batch groups.');

  // Check duplicate codes
  for (const r of rawRows) {
    if (r.group_code) {
      if (seenCodes.has(r.group_code)) {
        duplicateCodes.add(r.group_code);
      } else {
        seenCodes.add(r.group_code);
      }
    }
  }

  if (duplicateCodes.size > 0) {
    generalWarnings.push(`Duplicate batch codes found in schedule: ${Array.from(duplicateCodes).join(', ')}`);
  }

  let hasErrors = false;
  const validatedRows: ValidatedScheduleRow[] = rawRows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!r.group_code) errors.push('Missing batch group code');
    if (!r.scheduled_start_date) errors.push('Missing or invalid scheduled start date');
    if (duplicateCodes.has(r.group_code)) errors.push('Duplicate batch group code in this file');

    if (targetMonth && r.scheduled_start_date) {
      const rowMonth = r.scheduled_start_date.slice(0, 7) + '-01';
      if (rowMonth !== targetMonth) {
        errors.push(`Date ${r.scheduled_start_date} is outside the selected month (${targetMonth.slice(0, 7)})`);
      }
    }

    if (errors.length > 0) hasErrors = true;

    return {
      ...r,
      validation: {
        isValid: errors.length === 0,
        errors,
        warnings,
      },
    };
  });

  return {
    rows: rawRows.filter((r) => r.group_code && r.scheduled_start_date),
    validatedRows,
    columnMap: {
      group_code: codeHeader,
      scheduled_start_date: dateHeader,
      ...(labelHeader ? { group_label: labelHeader } : {}),
      ...(resourceHeader ? { resource_note: resourceHeader } : {}),
    },
    warnings: generalWarnings,
    hasErrors,
  };
}

function parseCsv(textValue: string): Array<Record<string, unknown>> {
  const lines = textValue.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  return lines.map(split).map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
}

export async function parseMonthlyScheduleFile(
  file: File,
  targetMonth?: string
): Promise<ParsedMonthlySchedule> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return rowsFromCells(parseCsv(await file.text()), targetMonth);
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Upload an Excel .xlsx file or a CSV export of the monthly schedule.');
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook has no worksheet.');

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
    headers[index - 1] = text(cell.value);
  });
  const headerRecord = Object.fromEntries(headers.map((h) => [h, h]));
  const cells: Array<Record<string, unknown>> = [headerRecord];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const header = headers[index - 1];
      if (header) record[header] = cell.value;
    });
    cells.push(record);
  });
  return rowsFromCells(cells, targetMonth);
}
