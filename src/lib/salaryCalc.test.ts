import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { calcMonth, calcDay, fixedSalaryFor, fmtHMZero, lastDayIn, type SalarySettings, type ShiftTiming } from '@/lib/salaryCalc';
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
  it('holiday worked: time before 09:00 does not count', () => {
    const d = calcDay({ date: '2026-08-09', punches: ['08:15', '13:00'] }, s8); // a Sunday, in at 08:15
    expect(d.status).toBe('Holiday');
    expect(d.otMin).toBe(240); // counted from 09:00, not 08:15
    expect(calcDay({ date: '2026-08-09', punches: ['07:00', '08:30'] }, s8).otMin).toBe(0);
  });
  it('holiday worked: 30-minute lunch is deducted like a normal day', () => {
    // 8-hr worker (lunch extra), in 08:45, out 17:31 -> 09:00 to 17:31 = 8h31m minus 30m lunch = 8h01m
    expect(calcDay({ date: '2026-09-13', punches: ['08:45', '17:31'] }, s8).otMin).toBe(8 * 60 + 1);
    // leaves before lunch ends: no deduction
    expect(calcDay({ date: '2026-09-13', punches: ['09:00', '13:20'] }, s8).otMin).toBe(260);
    // 12-hr worker (lunch inside hours) leaving before 18:30: lunch deducted; after 18:30: not
    const s12: SalarySettings = { monthlySalary: 17000, workingHours: 12, lunchIncluded: true };
    expect(calcDay({ date: '2026-09-13', punches: ['09:00', '17:00'] }, s12).otMin).toBe(450);
    expect(calcDay({ date: '2026-09-13', punches: ['09:00', '20:00'] }, s12).otMin).toBe(660);
  });
});

describe('employee leaving mid-month', () => {
  const s8: SalarySettings = { monthlySalary: 12500, workingHours: 8, lunchIncluded: false };
  const holidays = { '2026-08-15': 'Independence Day' };
  const punches: Record<string, string[]> = {};
  for (let d = 3; d <= 14; d++) {
    const date = `2026-08-${String(d).padStart(2, '0')}`;
    if (new Date(date + 'T00:00:00').getDay() !== 0) punches[date] = ['09:00', '17:30'];
  }
  const full = calcMonth({ month: '2026-08', punchesByDate: punches, overridesByDate: {}, holidays }, s8);
  const left = calcMonth({ month: '2026-08', punchesByDate: punches, overridesByDate: {}, holidays, lastDay: '2026-08-14' }, s8);

  it('days after the last working day are Left and earn no Sunday/holiday pay', () => {
    expect(left.days[14].status).toBe('Left'); // 15 Aug holiday
    expect(left.days[15].status).toBe('Left'); // 16 Aug Sunday
    expect(left.days.filter(d => d.status === 'Left')).toHaveLength(17);
    expect(left.daysPresent).toBeLessThan(full.daysPresent);
    expect(left.salary).toBeLessThan(full.salary);
  });
  it('days up to the last day are unchanged, divisor stays the calendar days', () => {
    expect(left.days.slice(0, 14).map(d => d.status)).toEqual(full.days.slice(0, 14).map(d => d.status));
    expect(left.salary).toBe(Math.round((12500 * left.paidMin) / (31 * 480)));
  });
  it('lastDayIn only applies when the person left before the month ended', () => {
    expect(lastDayIn('2026-08-14', '2026-08')).toBe('2026-08-14');
    expect(lastDayIn('2026-08-31', '2026-08')).toBeNull();
    expect(lastDayIn('2026-09-10', '2026-08')).toBeNull();
    expect(lastDayIn(null, '2026-08')).toBeNull();
  });
  it('fixed salary is prorated by calendar days up to the last working day', () => {
    expect(fixedSalaryFor(31000, '2026-08', null)).toBe(31000);
    expect(fixedSalaryFor(31000, '2026-08', '2026-08-10')).toBe(10000);
    expect(fixedSalaryFor(31000, '2026-08', '2026-07-30')).toBe(0);
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

describe('shifts', () => {
  const morning: ShiftTiming = { startMin: 6 * 60, endMin: 14 * 60, lunch: false };
  const evening: ShiftTiming = { startMin: 14 * 60, endMin: 22 * 60, lunch: false };
  const night: ShiftTiming = { startMin: 21 * 60, endMin: 9 * 60, lunch: false };
  const set = (hours: number, shift: ShiftTiming, lunchIncluded = false): SalarySettings => ({ monthlySalary: 12000, workingHours: hours, lunchIncluded, shift });

  it('6am-2pm shift: counted from 06:00, no lunch deducted', () => {
    const d = calcDay({ date: '2026-08-05', punches: ['05:55', '14:05'] }, set(8, morning));
    expect(d.status).toBe('Present');
    expect(d.otMin).toBe(0);
    // no lunch deduction: 06:00-13:40 is 7h40 -> short day, paid 7h30 as overtime (a day shift would deduct lunch)
    const short = calcDay({ date: '2026-08-05', punches: ['06:00', '13:40'] }, set(8, morning));
    expect(short.status).toBe('Absent');
    expect(short.otMin).toBe(450);
  });
  it('2pm-10pm shift: overtime after the 20 minute grace', () => {
    expect(calcDay({ date: '2026-08-05', punches: ['14:00', '22:15'] }, set(8, evening)).otMin).toBe(0);
    expect(calcDay({ date: '2026-08-05', punches: ['14:00', '22:45'] }, set(8, evening)).otMin).toBe(45);
  });
  it('early punch more than 3 hours before the shift is ignored', () => {
    const d = calcDay({ date: '2026-08-05', punches: ['02:30', '06:05', '14:02'] }, set(8, morning));
    expect(d.inTime).toBe('06:05');
    expect(d.flags.join()).toContain('before 03:00');
  });
  it('12-hour worker on a 6-2 shift gets no lunch either way', () => {
    const d = calcDay({ date: '2026-08-05', punches: ['06:00', '18:00'] }, set(12, morning, true));
    expect(d.status).toBe('Present');
    expect(d.otMin).toBe(0);
  });
  it('night shift: evening In and next-morning Out belong to the same day', () => {
    const punches = { '2026-08-03': ['21:05'], '2026-08-04': ['09:10', '21:00'], '2026-08-05': ['09:00'] };
    const m = calcMonth({ month: '2026-08', punchesByDate: punches, overridesByDate: {}, holidays: {} }, set(12, night, true));
    const d3 = m.days[2];
    expect(d3.status).toBe('Present');
    expect(d3.inTime).toBe('21:05');
    expect(d3.outTime).toBe('09:10');
    expect(d3.outNextDay).toBe(true);
    expect(d3.otMin).toBe(0);
    expect(m.days[3].status).toBe('Present'); // 4th evening 21:00 -> 5th morning 09:00
    expect(m.days[4].status).toBe('Absent'); // 5th has no evening punch
  });
  it('night shift: an edited Out time is read as the next morning', () => {
    const d = calcDay({ date: '2026-08-03', punches: ['21:00'], override: { outSet: true, outTime: '09:00' } }, set(12, night));
    expect(d.status).toBe('Present');
    expect(d.outNextDay).toBe(true);
  });
});
