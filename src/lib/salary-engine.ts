import * as XLSX from "xlsx";

export type SalaryStatus = "Present" | "Absent" | "Holiday";

export interface SalaryRules {
  otGraceMinutes: number;
  minOtMinutes: number;
  hoursRoundingMinutes: number;
  ignorePunchesBefore: string;
  lunchWindowStart: string;
  lunchWindowEnd: string;
  holidaysArePaid: boolean;
  holidayHoursEqualWorkingHours: boolean;
  advanceMaxPercentOfSalary: number;
  salaryPayDay: number;
}

export interface SalarySettings {
  monthlySalary: number;
  workingHoursPerDay: number;
  shiftStartTime: string;
  shiftLengthInclLunchHours: number;
  lunchMinutes: number;
  lunchUnpaidIfOutBefore: string;
  effectiveFrom: string;
}

export interface SalaryEmployee {
  id: string;
  machineNo: string;
  name: string;
  department: string;
  isActive: boolean;
  joinedOn: string;
  leftOn: string;
  createdFromUploadId: string;
  createdAt: string;
  createdBy: string;
  settings: SalarySettings[];
}

export interface SalaryDay {
  employeeId: string;
  month: string;
  date: string;
  punches: string[];
  inTimeEdited: string | null;
  outTimeEdited: string | null;
}

export interface SalaryUpload {
  id: string;
  month: string;
  fileName: string;
  filePath: string;
  uploadedBy: string;
  uploadedAt: string;
  version: number;
  status: string;
}

export interface SalaryEdit {
  id: string;
  employeeId: string;
  date: string;
  field: "in_time" | "out_time";
  oldValue: string;
  newValue: string;
  reason: string;
  editedBy: string;
  editedAt: string;
}

export interface SalaryHoliday { date: string; name: string; isRecurringSunday: boolean; }
export interface SalaryAdvance {
  id: string; employeeId: string; date: string; amount: number; type: string;
  note: string; enteredBy: string; monthToDeductFrom: string;
}
export interface SalaryRecovery {
  id: string; employeeId: string; salaryMonth: string; amountRecovered: number;
  remainingBalanceAfter: number; recoveredBy: string; recoveredAt: string;
}
export interface SalaryPayment {
  id: string; employeeId: string; salaryMonth: string; grossSalary: number;
  advanceRecovered: number; amountPayable: number; status: string; paidOn: string;
  paymentMode: string; remarks: string; paidBy: string; changedAfterPayment: boolean;
}

export interface SalaryState {
  employees: SalaryEmployee[];
  rules: SalaryRules;
  uploads: SalaryUpload[];
  days: SalaryDay[];
  edits: SalaryEdit[];
  holidays: SalaryHoliday[];
  advances: SalaryAdvance[];
  recoveries: SalaryRecovery[];
  payments: SalaryPayment[];
}

export const DEFAULT_RULES: SalaryRules = {
  otGraceMinutes: 20, minOtMinutes: 0, hoursRoundingMinutes: 30,
  ignorePunchesBefore: "06:00", lunchWindowStart: "13:00", lunchWindowEnd: "13:30",
  holidaysArePaid: true, holidayHoursEqualWorkingHours: true,
  advanceMaxPercentOfSalary: 50, salaryPayDay: 10,
};

export const EMPTY_SALARY_STATE: SalaryState = {
  employees: [], rules: DEFAULT_RULES, uploads: [], days: [], edits: [],
  holidays: [], advances: [], recoveries: [], payments: [],
};

export interface ParsedEmployee { machineNo: string; name: string; department: string; punches: Record<string, string[]>; }
export interface ParsedAttendance { month: string; employees: ParsedEmployee[]; warnings: string[]; }

const cleanName = (value: unknown) => String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
const asCell = (value: unknown) => value instanceof Date ? value.toTimeString().slice(0, 5) : cleanName(value);

function labelValue(row: unknown[], label: RegExp): string {
  for (let index = 0; index < row.length; index += 1) {
    const cell = cleanName(row[index]);
    if (label.test(cell)) {
      const inline = cell.replace(label, "").replace(/^\s*:?\s*/, "").trim();
      if (inline) return inline;
      for (let next = index + 1; next < row.length; next += 1) {
        const value = cleanName(row[next]);
        if (value) return value.replace(/^\s*:?\s*/, "").trim();
      }
    }
  }
  return "";
}

function extractPeriod(rows: unknown[][]): string {
  for (const row of rows) {
    const text = row.map(cleanName).join(" ");
    if (!/period\s*:/i.test(text)) continue;
    const match = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*~\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, "0")}`;
  }
  throw new Error("The Logs sheet has no readable Period date range.");
}

function timeFromCell(value: unknown): string[] {
  if (typeof value === "number" && value >= 0 && value < 1) {
    const total = Math.round(value * 24 * 60);
    return [`${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`];
  }
  const source = value instanceof Date ? value.toTimeString().slice(0, 5) : String(value ?? "");
  return source.split(/[\r\n]+/).map((item) => {
    const match = item.match(/(?:^|\b)(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*\d{2})?/);
    if (!match) return "";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }).filter((time) => /^\d{2}:[0-5]\d$/.test(time));
}

export async function parseAttendanceWorkbook(file: File): Promise<ParsedAttendance> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const logsName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === "logs");
  if (!logsName) throw new Error('This workbook does not contain a "Logs" sheet.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[logsName], { header: 1, defval: "" });
  const month = extractPeriod(rows);
  const result = new Map<string, ParsedEmployee>();
  const warnings: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const machineNo = labelValue(row, /^no\s*:?\s*/i);
    const name = labelValue(row, /^name\s*:?\s*/i);
    if (!machineNo || !name) continue;
    const department = labelValue(row, /^dept(?:artment)?\s*:?\s*/i);
    const punchRow = rows[index + 1] ?? [];
    const employee: ParsedEmployee = { machineNo, name: cleanName(name), department: cleanName(department), punches: {} };
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const punches = timeFromCell(punchRow[day - 1]);
      if (punches.length) employee.punches[`${month}-${String(day).padStart(2, "0")}`] = punches;
      if (punches.length === 1) warnings.push(`${employee.name} · ${day}: one punch only`);
      if (punches.length > 2) warnings.push(`${employee.name} · ${day}: ${punches.length} punches`);
    }
    const prior = result.get(machineNo);
    if (prior) prior.punches = { ...prior.punches, ...employee.punches };
    else result.set(machineNo, employee);
    index += 1;
  }
  if (!result.size) throw new Error('No employee blocks were found in the "Logs" sheet.');
  return { month, employees: Array.from(result.values()), warnings };
}

export function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function formatHoursMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safe / 60)}h ${safe % 60}m`;
}

export interface DayCalculation {
  status: SalaryStatus; inTime: string; outTime: string; regularMinutes: number;
  overtimeMinutes: number; paidMinutes: number; flags: string[]; rawPunches: string[];
}

export function calculateSalaryDay(input: {
  punches: string[]; inEdited?: string | null; outEdited?: string | null;
  settings: SalarySettings; rules: SalaryRules; holiday: boolean;
}): DayCalculation {
  const threshold = timeToMinutes(input.rules.ignorePunchesBefore) ?? 360;
  const rawPunches = [...input.punches].sort((a, b) => (timeToMinutes(a) ?? 0) - (timeToMinutes(b) ?? 0));
  const flags: string[] = [];
  const valid = rawPunches.filter((punch) => {
    const minutes = timeToMinutes(punch);
    if (minutes !== null && minutes < threshold) flags.push(`Punch before ${input.rules.ignorePunchesBefore} ignored`);
    return minutes !== null && minutes >= threshold;
  });
  for (let i = 1; i < valid.length; i += 1) {
    const current = timeToMinutes(valid[i] ?? "") ?? 0;
    const previous = timeToMinutes(valid[i - 1] ?? "") ?? 0;
    if (current - previous <= 10) flags.push("Duplicate punches within 10 minutes");
  }
  if (valid.length > 2) flags.push(`${valid.length} valid punches; first and last used`);
  let inTime = input.inEdited ?? valid[0] ?? "";
  let outTime = input.outEdited ?? valid[valid.length - 1] ?? "";
  if (input.holiday) {
    const holidayMinutes = input.rules.holidayHoursEqualWorkingHours ? Math.round(input.settings.workingHoursPerDay * 60) : 0;
    const inMinute = timeToMinutes(inTime); const outMinute = timeToMinutes(outTime);
    const workMinutes = inMinute !== null && outMinute !== null && outMinute >= inMinute ? outMinute - inMinute : 0;
    return { status: "Holiday", inTime, outTime, regularMinutes: input.rules.holidaysArePaid ? holidayMinutes : 0, overtimeMinutes: Math.max(0, workMinutes), paidMinutes: (input.rules.holidaysArePaid ? holidayMinutes : 0) + Math.max(0, workMinutes), flags, rawPunches };
  }
  const inMinute = timeToMinutes(inTime); const outMinute = timeToMinutes(outTime);
  if (inMinute === null || outMinute === null || outMinute < inMinute) {
    if (inTime || outTime || rawPunches.length) flags.push("Incomplete punch · treated as absent");
    return { status: "Absent", inTime, outTime, regularMinutes: 0, overtimeMinutes: 0, paidMinutes: 0, flags, rawPunches };
  }
  const shiftStart = timeToMinutes(input.settings.shiftStartTime) ?? 540;
  const effectiveIn = Math.max(inMinute, shiftStart);
  const requiredOut = effectiveIn + Math.round(input.settings.shiftLengthInclLunchHours * 60);
  const extraMinutes = outMinute - requiredOut;
  const minOt = Math.max(0, input.rules.minOtMinutes);
  if (extraMinutes > input.rules.otGraceMinutes) {
    const overtimeMinutes = Math.max(0, extraMinutes >= minOt ? extraMinutes : 0);
    const regularMinutes = Math.round(input.settings.workingHoursPerDay * 60);
    return { status: "Present", inTime, outTime, regularMinutes, overtimeMinutes, paidMinutes: regularMinutes + overtimeMinutes, flags, rawPunches };
  }
  const span = outMinute - effectiveIn;
  const lunchStart = timeToMinutes(input.rules.lunchWindowStart) ?? 780;
  const lunchEnd = timeToMinutes(input.rules.lunchWindowEnd) ?? 810;
  const cutoff = timeToMinutes(input.settings.lunchUnpaidIfOutBefore) ?? 1439;
  const deductLunch = effectiveIn < lunchStart && outMinute > lunchEnd && outMinute < cutoff;
  const roundedTo = Math.max(1, input.rules.hoursRoundingMinutes);
  const worked = Math.min(Math.round(input.settings.workingHoursPerDay * 60), Math.floor(Math.max(0, span - (deductLunch ? input.settings.lunchMinutes : 0)) / roundedTo + 0.5) * roundedTo);
  const target = Math.round(input.settings.workingHoursPerDay * 60);
  if (worked >= target) return { status: "Present", inTime, outTime, regularMinutes: target, overtimeMinutes: 0, paidMinutes: target, flags, rawPunches };
  const overtimeMinutes = worked >= minOt ? worked : 0;
  return { status: "Absent", inTime, outTime, regularMinutes: 0, overtimeMinutes, paidMinutes: overtimeMinutes, flags, rawPunches };
}

export function settingsForMonth(employee: SalaryEmployee, month: string): SalarySettings | null {
  return [...employee.settings].filter((settings) => settings.effectiveFrom.slice(0, 7) <= month)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

export function monthDates(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  if (!year || !monthNum) return [];
  const days = new Date(year, monthNum, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export function isSunday(date: string): boolean { return new Date(`${date}T12:00:00`).getDay() === 0; }

export interface SalaryCardDay extends DayCalculation { date: string; dayName: string; }
export interface EmployeeSalarySummary {
  settings: SalarySettings;
  days: SalaryCardDay[];
  daysPresent: number;
  regularMinutes: number;
  holidayMinutes: number;
  overtimeMinutes: number;
  paidMinutes: number;
  grossSalary: number;
  advancesGiven: number;
  carriedBalance: number;
  dueAdvances: number;
  advanceRecovered: number;
  amountPayable: number;
  payment: SalaryPayment | null;
}

export function calculateEmployeeSalary(employee: SalaryEmployee, month: string, state: SalaryState): EmployeeSalarySummary | null {
  const settings = settingsForMonth(employee, month);
  if (!settings) return null;
  const recordedDays = new Map(state.days.filter((day) => day.employeeId === employee.id && day.month === month).map((day) => [day.date, day]));
  const holidayDates = new Map(state.holidays.map((holiday) => [holiday.date, holiday.name]));
  const days = monthDates(month).map((date): SalaryCardDay => {
    const recorded = recordedDays.get(date);
    const holidayName = holidayDates.get(date);
    const sunday = isSunday(date);
    const holiday = Boolean(holidayName) || sunday;
    const punches = recorded?.punches ?? [];
    const calculated = calculateSalaryDay({ punches, inEdited: recorded?.inTimeEdited, outEdited: recorded?.outTimeEdited,
      settings, rules: state.rules, holiday });
    if (holiday) calculated.flags = [...calculated.flags, holidayName || (sunday ? "Sunday" : "Holiday")];
    const [year, monthNumber, dayNumber] = date.split("-").map(Number);
    const dayName = new Date(year ?? 0, (monthNumber ?? 1) - 1, dayNumber ?? 1).toLocaleDateString("en-IN", { weekday: "short" });
    return { ...calculated, date, dayName };
  });
  const presentDays = days.filter((day) => day.status === "Present").length;
  const holidayDays = days.filter((day) => day.status === "Holiday" && state.rules.holidaysArePaid).length;
  const regularMinutes = presentDays * Math.round(settings.workingHoursPerDay * 60);
  const holidayMinutes = holidayDays * (state.rules.holidayHoursEqualWorkingHours ? Math.round(settings.workingHoursPerDay * 60) : 0);
  const overtimeMinutes = days.reduce((sum, day) => sum + day.overtimeMinutes, 0);
  const paidMinutes = regularMinutes + holidayMinutes + overtimeMinutes;
  const daysInMonth = days.length;
  const grossSalary = daysInMonth && settings.workingHoursPerDay > 0
    ? Math.round(settings.monthlySalary / (daysInMonth * settings.workingHoursPerDay) * (paidMinutes / 60)) : 0;
  const advancesGiven = state.advances.filter((advance) => advance.employeeId === employee.id && advance.monthToDeductFrom === month)
    .reduce((sum, advance) => sum + advance.amount, 0);
  const priorRecoveries = state.recoveries.filter((recovery) => recovery.employeeId === employee.id && recovery.salaryMonth < month)
    .sort((a, b) => b.salaryMonth.localeCompare(a.salaryMonth));
  const carriedBalance = priorRecoveries[0]?.remainingBalanceAfter ?? 0;
  const dueAdvances = advancesGiven + carriedBalance;
  const payment = state.payments.find((row) => row.employeeId === employee.id && row.salaryMonth === month) ?? null;
  const advanceRecovered = payment?.status === "Paid" && !payment.changedAfterPayment
    ? payment.advanceRecovered : Math.min(dueAdvances, grossSalary);
  return { settings, days, daysPresent: presentDays + holidayDays, regularMinutes, holidayMinutes, overtimeMinutes, paidMinutes,
    grossSalary, advancesGiven, carriedBalance, dueAdvances, advanceRecovered, amountPayable: Math.max(0, grossSalary - advanceRecovered), payment };
}

export function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(value));
}
