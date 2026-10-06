import * as XLSX from 'xlsx';

/**
 * Reads the thumb-print machine's attendance export (.xls / .xlsx). Only the
 * sheet named "Logs" is used -- the machine's own "Summary" sheet is ignored
 * (its shift rules are not configured).
 *
 * Logs layout: a "Period : 2026/08/01 ~ 08/31 ..." line, then for each
 * employee a block of 3 rows: day numbers 1..31, a row with
 * "No :" <no> "Name :" <name> "Dept :" <dept>, and a punch row where the
 * COLUMN INDEX = day of month - 1 and each cell holds that day's punches as
 * HH:MM separated by line breaks.
 */

export interface ParsedEmployee {
  machineNo: number;
  name: string;
  department: string;
  /** date (YYYY-MM-DD) -> punches (HH:MM) */
  punches: Record<string, string[]>;
}

export interface ParsedAttendance {
  month: string; // YYYY-MM
  employees: ParsedEmployee[];
}

const cleanName = (raw: string) =>
  raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, c => c.toUpperCase());

const cellStr = (v: unknown) => (v == null ? '' : String(v));

const firstValueAfter = (row: unknown[], idx: number): string => {
  for (let i = idx + 1; i < row.length; i++) {
    const s = cellStr(row[i]).trim();
    if (s) return s;
  }
  return '';
};

export function parseAttendanceWorkbook(data: ArrayBuffer): ParsedAttendance {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'logs');
  if (!sheetName) throw new Error('This file has no "Logs" sheet. Upload the attendance file exported from the thumb-print machine.');
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });

  // Month from the "Period :" line.
  let month = '';
  for (const row of rows) {
    if (cellStr(row[0]).trim().toLowerCase().startsWith('period')) {
      const text = row.map(cellStr).join(' ');
      const m = /(\d{4})\/(\d{2})\/\d{2}/.exec(text);
      if (m) { month = `${m[1]}-${m[2]}`; break; }
    }
  }
  if (!month) throw new Error('Could not read the period (month) from the Logs sheet.');
  const [yy, mm] = month.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();

  const employees: ParsedEmployee[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const noIdx = row.findIndex(c => cellStr(c).trim().replace(/\s/g, '') === 'No:');
    if (noIdx < 0) continue;
    const nameIdx = row.findIndex(c => cellStr(c).trim().replace(/\s/g, '') === 'Name:');
    const deptIdx = row.findIndex(c => cellStr(c).trim().replace(/\s/g, '') === 'Dept:');
    const machineNo = Number(firstValueAfter(row, noIdx));
    if (!Number.isFinite(machineNo)) continue;
    const name = cleanName(nameIdx >= 0 ? firstValueAfter(row, nameIdx) : '');
    const department = deptIdx >= 0 ? firstValueAfter(row, deptIdx) : '';

    const punchRow = rows[r + 1] || [];
    const punches: Record<string, string[]> = {};
    for (let c = 0; c < Math.min(punchRow.length, daysInMonth); c++) {
      const times = cellStr(punchRow[c]).match(/\b\d{1,2}:\d{2}\b/g);
      if (times?.length) {
        const date = `${month}-${String(c + 1).padStart(2, '0')}`;
        punches[date] = times.map(t => t.padStart(5, '0'));
      }
    }
    employees.push({ machineNo, name: name || `Employee ${machineNo}`, department, punches });
  }
  if (!employees.length) throw new Error('No employees found in the Logs sheet.');
  return { month, employees };
}
