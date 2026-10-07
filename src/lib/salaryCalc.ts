/**
 * Salary Generation: pure calculation engine (no React, no Supabase).
 *
 * Rules (confirmed with Ansh, Oct 2026 -- see People/Team.md in the project):
 *  - Hours come from the thumb-print machine: first punch of the day = IN,
 *    last punch = OUT. Punches before 06:00 are machine errors and ignored.
 *  - Shift starts 09:00. Arriving earlier earns nothing extra.
 *  - A late arrival must also leave late: required OUT = max(IN, 09:00) + shift length.
 *  - Overtime only if OUT is MORE than 14 minutes past the required OUT; then
 *    overtime is the exact extra time (hours + minutes, no rounding).
 *  - Otherwise worked time (minus lunch where applicable) is rounded to the
 *    nearest 30 min and capped at the working hours. Fewer hours than the
 *    working hours => the day is ABSENT, and the hours actually worked are
 *    added to overtime.
 *  - Holidays (all Sundays + listed days) are paid and count as present. A
 *    holiday worked adds the time between IN and OUT as overtime, counted from
 *    the 09:00 shift start like any other day (arriving earlier earns nothing),
 *    and the 30-minute lunch (1:00-1:30) is deducted under the same rule as a normal day.
 *  - If the employee left mid-month, days after the last working day are not paid
 *    (no Sunday/holiday pay) and show as 'Left'; the monthly divisor stays the
 *    calendar days of the month.
 *  - Salary = monthly / (calendar days in month x working hours) x paid hours,
 *    where paid hours = regular + holiday + overtime (no overtime premium).
 *
 * All time maths is in whole minutes.
 */

export const SALARY_RULES = {
  shiftStartMin: 9 * 60,
  graceMin: 14,
  roundMin: 30,
  ignoreBeforeMin: 6 * 60,
  lunchMin: 30,
  lunchWindowStartMin: 13 * 60,
  lunchWindowEndMin: 13 * 60 + 30,
  /** For workers whose lunch is inside their paid hours: lunch is only unpaid when they leave before this. */
  lunchIncludedCutoffMin: 18 * 60 + 30,
} as const;

export interface SalarySettings {
  monthlySalary: number;
  workingHours: number;
  /** true = lunch is part of the paid working hours (e.g. 12-hr, 10-hr workers). false = extra 30 min lunch (8-hr workers). */
  lunchIncluded: boolean;
  /** The employee's shift. Missing = the general 09:00 day shift with lunch (the original rules). */
  shift?: ShiftTiming | null;
}

/** Times are minutes from midnight. A shift whose end is not after its start runs past midnight (e.g. 21:00-09:00). */
export interface ShiftTiming {
  startMin: number;
  endMin: number;
  /** true = the 1:00-1:30 pm lunch rules apply; false = no lunch is deducted on this shift. */
  lunch: boolean;
}

export const shiftCrossesMidnight = (sh?: ShiftTiming | null) => !!sh && sh.endMin <= sh.startMin;
/** For a night shift: clock times before this belong to the previous evening's shift (they are its Out). */
export const shiftSplitMin = (sh: ShiftTiming) => Math.round((sh.startMin + sh.endMin) / 2);

export interface TimeOverride {
  inSet?: boolean;
  inTime?: string | null;
  outSet?: boolean;
  outTime?: string | null;
}

export type DayStatus = 'Present' | 'Absent' | 'Holiday' | 'Left';

export interface DayResult {
  date: string;            // YYYY-MM-DD
  dow: string;             // Mon, Tue ...
  rawPunches: string[];    // all punches as recorded by the machine
  machineIn: string | null;
  machineOut: string | null;
  inTime: string | null;   // effective (after manual edit), as a clock time HH:MM
  outTime: string | null;
  outNextDay?: boolean;    // night shift: the Out time is on the next calendar day
  inEdited: boolean;
  outEdited: boolean;
  status: DayStatus;
  holidayName?: string;
  regularMin: number;      // paid regular minutes (working hours on Present days, 0 otherwise)
  holidayMin: number;      // paid holiday minutes
  otMin: number;           // overtime minutes
  flags: string[];
}

export interface MonthSummary {
  month: string;           // YYYY-MM
  daysInMonth: number;
  days: DayResult[];
  presentDays: number;     // worked full days
  holidayDays: number;
  daysPresent: number;     // present + paid holidays (what the card shows)
  absentDays: number;
  regularMin: number;
  holidayMin: number;
  otMin: number;
  paidMin: number;
  paidHours: number;       // decimal hours
  salary: number;          // rupees, rounded
  hourlyRate: number;
}

export const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const fmtTime = (min: number | null): string | null => {
  if (min == null) return null;
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Minutes as HH:MM that may run past 24:00 (used internally for night shifts, e.g. 33:05 = 09:05 next day). */
const extStr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 150 -> "2h 30m"; 0 -> "-" */
export const fmtHM = (min: number): string => {
  if (!min) return '-';
  return `${Math.floor(min / 60)}h ${min % 60}m`;
};

/** Always "Xh Ym" including zero (for totals). */
export const fmtHMZero = (min: number): string => `${Math.floor(min / 60)}h ${min % 60}m`;

const roundHalfUp = (min: number, step: number) => Math.floor((min + step / 2) / step) * step;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const daysInMonthOf = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export interface CalcDayInput {
  date: string;
  punches: string[];
  override?: TimeOverride;
  holidayName?: string | null; // set when the date is a listed holiday (Sundays are detected automatically)
}

export function calcDay(input: CalcDayInput, s: SalarySettings): DayResult {
  const R = SALARY_RULES;
  const sh = s.shift || null;
  const startMin = sh ? sh.startMin : R.shiftStartMin;
  const crossing = shiftCrossesMidnight(sh);
  const split = crossing ? shiftSplitMin(sh as ShiftTiming) : 0;
  const lunchApplies = sh ? sh.lunch : true;
  // Early punches are machine errors: ignored when more than 3 hours before the shift starts (06:00 for the 09:00 shift).
  const ignoreBefore = crossing ? 0 : Math.max(0, startMin - 180);
  // Night shift: a clock time before the split is on the next calendar day.
  const toExt = (m: number | null) => (m != null && crossing && m < split ? m + 1440 : m);

  const [y, mo, d] = input.date.split('-').map(Number);
  const dowIdx = new Date(y, mo - 1, d).getDay();
  const holidayName = dowIdx === 0 ? 'Sunday' : input.holidayName || undefined;
  const workingMin = Math.round(s.workingHours * 60);
  const shiftMin = workingMin + (lunchApplies && !s.lunchIncluded ? R.lunchMin : 0);
  const lunchCutoff = lunchApplies && s.lunchIncluded ? R.lunchIncludedCutoffMin : 24 * 60;
  const lunchFor = (inM: number, outM: number) =>
    lunchApplies && inM < R.lunchWindowStartMin && outM > R.lunchWindowEndMin && outM < lunchCutoff ? R.lunchMin : 0;
  const flags: string[] = [];

  const raw = [...input.punches].filter(p => toMin(p) != null).sort();
  const valid = raw.filter(p => (toMin(p) as number) >= ignoreBefore);
  if (valid.length < raw.length) flags.push(`Punch before ${fmtTime(ignoreBefore)} ignored`);

  let machineIn: number | null = null;
  let machineOut: number | null = null;
  if (valid.length >= 2) {
    machineIn = toMin(valid[0]);
    machineOut = toMin(valid[valid.length - 1]);
    if (valid.length > 2) flags.push(`${valid.length} punches: first and last used`);
  } else if (valid.length === 1) {
    const p = toMin(valid[0]) as number;
    if (p < startMin + 240) machineIn = p; else machineOut = p;
    flags.push('Only one punch');
  }

  const ov = input.override || {};
  const effIn = ov.inSet ? toExt(toMin(ov.inTime)) : machineIn;
  const effOut = ov.outSet ? toExt(toMin(ov.outTime)) : machineOut;
  if (ov.inSet && machineIn !== effIn) flags.push('In time edited');
  if (ov.outSet && machineOut !== effOut) flags.push('Out time edited');
  if (effIn != null && effOut != null && effOut <= effIn) flags.push('Out is not after In');

  const base = {
    date: input.date,
    dow: DOW[dowIdx],
    rawPunches: raw.map(p => fmtTime(toMin(p)) as string),
    machineIn: fmtTime(machineIn),
    machineOut: fmtTime(machineOut),
    inTime: fmtTime(effIn),
    outTime: fmtTime(effOut),
    outNextDay: effOut != null && effOut >= 1440,
    inEdited: !!ov.inSet,
    outEdited: !!ov.outSet,
    flags,
  };

  const complete = effIn != null && effOut != null && effOut > effIn;

  // Time worked on a holiday: counted from the shift start, minus the 30-minute lunch when it applies (same rule as a normal day).
  const holidayWorkedMin = (inM: number, outM: number) =>
    Math.max(0, outM - Math.max(inM, startMin) - lunchFor(inM, outM));

  // Paid holiday (Sunday or listed). Worked on a holiday => all time is overtime.
  if (holidayName) {
    return {
      ...base, status: 'Holiday', holidayName,
      regularMin: 0, holidayMin: workingMin, otMin: complete ? holidayWorkedMin(effIn as number, effOut as number) : 0,
    };
  }

  if (!complete) {
    if (raw.length || ov.inSet || ov.outSet) flags.push('Incomplete: needs In and Out');
    return { ...base, status: 'Absent', regularMin: 0, holidayMin: 0, otMin: 0 };
  }

  const inM = effIn as number;
  const outM = effOut as number;
  const effectiveIn = Math.max(inM, startMin);
  const requiredOut = effectiveIn + shiftMin;
  const extra = outM - requiredOut;

  if (extra > R.graceMin) {
    return { ...base, status: 'Present', regularMin: workingMin, holidayMin: 0, otMin: extra };
  }

  const span = outM - effectiveIn;
  const worked = Math.min(roundHalfUp(Math.max(span - lunchFor(inM, outM), 0), R.roundMin), workingMin);

  if (worked >= workingMin) {
    return { ...base, status: 'Present', regularMin: workingMin, holidayMin: 0, otMin: 0 };
  }
  // Short day: marked Absent, but the hours actually worked are paid as overtime.
  return { ...base, status: 'Absent', regularMin: 0, holidayMin: 0, otMin: worked };
}

export interface CalcMonthInput {
  month: string; // YYYY-MM
  punchesByDate: Record<string, string[]>;
  overridesByDate: Record<string, TimeOverride>;
  holidays: Record<string, string>; // date -> name (Sundays are automatic)
  /** Last working day (YYYY-MM-DD, inclusive). Later days of the month are not paid. */
  lastDay?: string | null;
}

/** The last working day to apply in `month`, or null when the person worked the whole month. */
export function lastDayIn(leftOn: string | null | undefined, month: string): string | null {
  if (!leftOn) return null;
  const end = `${month}-${String(daysInMonthOf(month)).padStart(2, '0')}`;
  return leftOn < end ? leftOn : null;
}

/** Fixed monthly pay, prorated by calendar days up to the last working day. */
export function fixedSalaryFor(monthly: number, month: string, lastDay: string | null): number {
  if (!lastDay) return Math.round(monthly);
  if (lastDay < `${month}-01`) return 0;
  const n = daysInMonthOf(month);
  return Math.round((monthly * Number(lastDay.slice(8, 10))) / n);
}

const nextDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/**
 * Punches that belong to the shift that STARTS on `date`. For a day shift that is simply the day's punches. For a night shift
 * crossing midnight it is the evening punches of `date` plus the morning punches of the next day (shown as 24:00+ internally).
 */
export function shiftPunchesFor(date: string, byDate: Record<string, string[]>, sh?: ShiftTiming | null): string[] {
  const today = byDate[date] || [];
  if (!sh || !shiftCrossesMidnight(sh)) return today;
  const split = shiftSplitMin(sh);
  const evening = today.filter(p => (toMin(p) as number) >= split);
  const morning = (byDate[nextDate(date)] || []).filter(p => (toMin(p) as number) < split).map(p => extStr((toMin(p) as number) + 1440));
  return [...evening, ...morning];
}

export function calcMonth(input: CalcMonthInput, s: SalarySettings): MonthSummary {
  const n = daysInMonthOf(input.month);
  const days: DayResult[] = [];
  for (let d = 1; d <= n; d++) {
    const date = `${input.month}-${String(d).padStart(2, '0')}`;
    if (input.lastDay && date > input.lastDay) {
      const base = calcDay({ date, punches: [] }, s);
      days.push({
        ...base, status: 'Left', holidayName: undefined, rawPunches: [], machineIn: null, machineOut: null,
        inTime: null, outTime: null, inEdited: false, outEdited: false, regularMin: 0, holidayMin: 0, otMin: 0, flags: [],
      });
      continue;
    }
    days.push(calcDay({
      date,
      punches: shiftPunchesFor(date, input.punchesByDate, s.shift),
      override: input.overridesByDate[date],
      holidayName: input.holidays[date],
    }, s));
  }
  const presentDays = days.filter(x => x.status === 'Present').length;
  const holidayDays = days.filter(x => x.status === 'Holiday').length;
  const absentDays = days.filter(x => x.status === 'Absent').length;
  const regularMin = days.reduce((a, x) => a + x.regularMin, 0);
  const holidayMin = days.reduce((a, x) => a + x.holidayMin, 0);
  const otMin = days.reduce((a, x) => a + x.otMin, 0);
  const paidMin = regularMin + holidayMin + otMin;
  const workingMin = Math.round(s.workingHours * 60);
  const salary = workingMin > 0 ? Math.round((s.monthlySalary * paidMin) / (n * workingMin)) : 0;
  const hourlyRate = workingMin > 0 ? s.monthlySalary / (n * s.workingHours) : 0;
  return {
    month: input.month, daysInMonth: n, days,
    presentDays, holidayDays, daysPresent: presentDays + holidayDays, absentDays,
    regularMin, holidayMin, otMin, paidMin, paidHours: paidMin / 60, salary, hourlyRate,
  };
}
