import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { calcMonth, calcDay, fmtHMZero, type SalarySettings } from '@/lib/salaryCalc';
import { parseAttendanceWorkbook } from '@/lib/attendanceParser';
import fixture from '@/test/fixtures/attendance-aug-2026.json';

// August 2026 holidays: Sundays (automatic) + Independence Day + Raksha Bandhan.
const holidays = { '2026-08-15': 'Independence Day', '2026-08-28': 'Raksha Bandhan' };
const run = (key: 'yusuf' | 'nigam' | 'dubey', s: SalarySettings) =>
  calcMonth({ month: '2026-08', punchesByDate: (fixture as any)[key], overridesByDate: {}, holidays }, s);

describe('salary calculation, Aug 2026 (numbers confirmed with Ansh)', () => {
  it('Yusuf: 12 hrs, lunch included', () => {
    const m = run('yusuf', { monthlySalary: 17000, workingHours: 12, lunchIncluded: true });
    expect(m.daysPresent).toBe(19);
    expect(m.regularMin).toBe(144 * 60);
    expect(fmtHMZero(m.otMin)).toBe('95h 0m');
    expect(m.paidHours).toBe(323);
    expect(m.salary).toBe(14761);
  });

  it('Nigam: 10 hrs, lunch included', () => {
    const m = run('nigam', { monthlySalary: 51000, workingHours: 10, lunchIncluded: true });
    expect(m.daysPresent).toBe(31);
    expect(m.regularMin).toBe(240 * 60);
    expect(fmtHMZero(m.otMin)).toBe('19h 9m');
    expect(m.paidHours).toBeCloseTo(329.15, 2);
    expect(m.salary).toBe(54150);
  });

  it('Dubey: 8 hrs, lunch extra', () => {
    const m = run('dubey', { monthlySalary: 12500, workingHours: 8, lunchIncluded: false });
    expect(m.daysPresent).toBe(24);
    expect(m.regularMin).toBe(136 * 60);
    expect(fmtHMZero(m.otMin)).toBe('56h 11m');
    expect(m.paidHours).toBeCloseTo(248.18, 2);
    expect(m.salary).toBe(12509);
  });
});

describe('day rules', () => {
  const s8: SalarySettings = { monthlySalary: 12500, workingHours: 8, lunchIncluded: false };
  it('ignores a 02:20 punch and flags it', () => {
    const d = calcDay({ date: '2026-08-05', punches: ['02:20', '10:27', '21:19'] }, s8);
    expect(d.inTime).toBe('10:27');
    expect(d.flags.join()).toContain('before 06:00');
  });
  it('single punch day is Absent until edited', () => {
    const d = calcDay({ date: '2026-08-04', punches: ['09:33'] }, s8);
    expect(d.status).toBe('Absent');
    const fixed = calcDay({ date: '2026-08-04', punches: ['09:33'], override: { outSet: true, outTime: '18:05' } }, s8);
    expect(fixed.status).toBe('Present');
    expect(fixed.outEdited).toBe(true);
  });
  it('overtime is exact minutes and only after the 20-minute grace', () => {
    // required out 17:30, leaves 17:50 -> exactly 20 min: no overtime
    expect(calcDay({ date: '2026-08-06', punches: ['09:00', '17:50'] }, s8).otMin).toBe(0);
    // 17:51 -> 21 min past: overtime is 21 minutes, not rounded to 30
    expect(calcDay({ date: '2026-08-06', punches: ['09:00', '17:51'] }, s8).otMin).toBe(21);
  });
  it('8-hr worker leaving at 19:00 gets 1h 30m, at 21:00 gets 3h 30m', () => {
    expect(calcDay({ date: '2026-08-06', punches: ['09:00', '19:00'] }, s8).otMin).toBe(90);
    expect(calcDay({ date: '2026-08-06', punches: ['09:00', '21:00'] }, s8).otMin).toBe(210);
  });
  it('late arrival must leave late', () => {
    // 12-hr worker in 09:48, out 21:03 -> 11h15m -> rounds to 11h30m -> short day => Absent, 11.5h as overtime
    const s12: SalarySettings = { monthlySalary: 17000, workingHours: 12, lunchIncluded: true };
    const d = calcDay({ date: '2026-08-07', punches: ['09:48', '21:03'] }, s12);
    expect(d.status).toBe('Absent');
    expect(d.otMin).toBe(11.5 * 60);
  });
  it('holiday worked: paid holiday plus all time as overtime', () => {
    const d = calcDay({ date: '2026-08-09', punches: ['09:00', '13:00'] }, s8); // a Sunday
    expect(d.status).toBe('Holiday');
    expect(d.holidayMin).toBe(480);
    expect(d.otMin).toBe(240);
  });
});

describe('attendance sheet parser', () => {
  it('reads the Logs sheet by structure and ignores Summary', () => {
    const logs = [
      ['List of Logs'],
      [],
      ['Period : ', '', '2026/08/01 ~ 08/31\t( shree dying )'],
      ...[1, 2].flatMap(n => [
        Array.from({ length: 31 }, (_, i) => i + 1),
        ['No :', '', String(n), '', '', '', '', '', 'Name :', '', n === 1 ? 'digvijay dubey\u0002' : 'rohit ', '', '', '', '', '', '', '', 'Dept :', '', 'Dept1'],
        n === 1 ? ['09:39\n21:20\n', '', '09:33\n23:15\n'] : [],
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Summary of Attendance']]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logs), 'Logs');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const parsed = parseAttendanceWorkbook(buf);
    expect(parsed.month).toBe('2026-08');
    expect(parsed.employees).toHaveLength(2);
    expect(parsed.employees[0]).toMatchObject({ machineNo: 1, name: 'Digvijay Dubey', department: 'Dept1' });
    expect(parsed.employees[0].punches['2026-08-01']).toEqual(['09:39', '21:20']);
    expect(parsed.employees[0].punches['2026-08-03']).toEqual(['09:33', '23:15']);
    expect(parsed.employees[1].punches).toEqual({});
  });
  it('rejects a file without a Logs sheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Summary');
    expect(() => parseAttendanceWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))).toThrow(/Logs/);
  });
});
