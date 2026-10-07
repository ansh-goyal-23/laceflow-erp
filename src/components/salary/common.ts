import { daysInMonthOf, type SalarySettings, type ShiftTiming } from '@/lib/salaryCalc';
import type { SalaryAdvance, SalaryEmployee, SalaryShift, ShiftSnapshot } from '@/hooks/useSalary';

export const inr = (v: number) => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const today = () => new Date().toISOString().slice(0, 10);

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
export const dayLabel = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const prevMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const hmToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const to12h = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
};
export const shiftRange = (s: { start_time: string; end_time: string }) => `${to12h(s.start_time)} - ${to12h(s.end_time)}`;
export const shiftLabel = (s: SalaryShift) => `${s.name} (${shiftRange(s)})`;
export const crossesMidnight = (s: { start_time: string; end_time: string }) => hmToMin(s.end_time) <= hmToMin(s.start_time);

export const timingOf = (s: SalaryShift | ShiftSnapshot | null | undefined): ShiftTiming | null => {
  if (!s) return null;
  const start = 'start_time' in s ? s.start_time : s.start;
  const end = 'end_time' in s ? s.end_time : s.end;
  const lunch = 'lunch_applies' in s ? s.lunch_applies : s.lunch;
  return { startMin: hmToMin(start), endMin: hmToMin(end), lunch };
};
export const snapshotOf = (s: SalaryShift): ShiftSnapshot => ({ name: s.name, start: s.start_time, end: s.end_time, lunch: s.lunch_applies });

/** The employee's shift (General if none is set). */
export const shiftOf = (e: SalaryEmployee, shifts: SalaryShift[]): SalaryShift | null =>
  shifts.find(s => s.id === e.shift_id) || shifts.find(s => s.name === 'General') || null;

export const settingsOf = (e: SalaryEmployee, shifts: SalaryShift[] = []): SalarySettings | null =>
  e.monthly_salary != null && e.working_hours ? {
    monthlySalary: e.monthly_salary, workingHours: e.working_hours, lunchIncluded: e.lunch_included,
    shift: timingOf(shiftOf(e, shifts)),
  } : null;

export interface Recovery { employee_id: string; month: string; amount: number }

/**
 * Advance still owed by an employee when the given month's salary is made:
 * advances given up to the end of that month, minus what earlier months already recovered.
 */
export function advanceBalanceFor(employeeId: string, month: string, advances: SalaryAdvance[], recoveries: Recovery[]): number {
  const end = `${month}-${String(daysInMonthOf(month)).padStart(2, '0')}`;
  const given = advances.filter(a => a.employee_id === employeeId && a.given_on <= end).reduce((t, a) => t + a.amount, 0);
  const back = recoveries.filter(r => r.employee_id === employeeId && r.month < month).reduce((t, r) => t + r.amount, 0);
  return Math.max(0, Math.round((given - back) * 100) / 100);
}

/** Current total balance (all time). */
export function advanceBalanceNow(employeeId: string, advances: SalaryAdvance[], recoveries: Recovery[]) {
  const given = advances.filter(a => a.employee_id === employeeId).reduce((t, a) => t + a.amount, 0);
  const back = recoveries.filter(r => r.employee_id === employeeId).reduce((t, r) => t + r.amount, 0);
  return { given, recovered: back, balance: Math.round((given - back) * 100) / 100 };
}
