import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_RULES, EMPTY_SALARY_STATE, type ParsedAttendance, type SalaryAdvance,
  type SalaryDay, type SalaryEdit, type SalaryEmployee, type SalaryHoliday,
  type SalaryPayment, type SalaryRecovery, type SalaryRules, type SalarySettings,
  type SalaryState, type SalaryUpload,
} from "@/lib/salary-engine";
import { logActivity } from "@/lib/audit";

const asRows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value as Record<string, unknown>[] : [];
const asString = (value: unknown): string => typeof value === "string" ? value : "";
const asNumber = (value: unknown): number => Number(value ?? 0);
const toSettings = (row: Record<string, unknown>): SalarySettings => ({
  monthlySalary: asNumber(row.monthly_salary), workingHoursPerDay: asNumber(row.working_hours_per_day),
  shiftStartTime: asString(row.shift_start_time) || "09:00", shiftLengthInclLunchHours: asNumber(row.shift_length_incl_lunch_hours),
  lunchMinutes: asNumber(row.lunch_minutes ?? 30), lunchUnpaidIfOutBefore: asString(row.lunch_unpaid_if_out_before) || "18:30",
  effectiveFrom: asString(row.effective_from),
});
const mapEmployee = (row: Record<string, unknown>, settings: SalarySettings[]): SalaryEmployee => ({
  id: asString(row.id), machineNo: asString(row.machine_no), name: asString(row.name),
  department: asString(row.department), isActive: Boolean(row.is_active), joinedOn: asString(row.joined_on),
  leftOn: asString(row.left_on), createdFromUploadId: asString(row.created_from_upload_id),
  createdAt: asString(row.created_at), createdBy: asString(row.created_by), settings,
});
const mapUpload = (r: Record<string, unknown>): SalaryUpload => ({ id: asString(r.id), month: asString(r.month),
  fileName: asString(r.file_name), filePath: asString(r.file_path), uploadedBy: asString(r.uploaded_by),
  uploadedAt: asString(r.uploaded_at), version: asNumber(r.version), status: asString(r.status) });
const mapDay = (r: Record<string, unknown>): SalaryDay => ({ employeeId: asString(r.employee_id), month: asString(r.month),
  date: asString(r.date), punches: Array.isArray(r.raw_punches) ? r.raw_punches as string[] : [],
  inTimeEdited: r.in_time_edited == null ? null : asString(r.in_time_edited),
  outTimeEdited: r.out_time_edited == null ? null : asString(r.out_time_edited) });
const mapEdit = (r: Record<string, unknown>): SalaryEdit => ({ id: asString(r.id), employeeId: asString(r.employee_id),
  date: asString(r.date), field: asString(r.field) as SalaryEdit["field"], oldValue: asString(r.old_value),
  newValue: asString(r.new_value), reason: asString(r.reason), editedBy: asString(r.edited_by), editedAt: asString(r.edited_at) });
const mapHoliday = (r: Record<string, unknown>): SalaryHoliday => ({ date: asString(r.date), name: asString(r.name), isRecurringSunday: Boolean(r.is_recurring_sunday) });
const mapAdvance = (r: Record<string, unknown>): SalaryAdvance => ({ id: asString(r.id), employeeId: asString(r.employee_id),
  date: asString(r.date), amount: asNumber(r.amount), type: asString(r.type), note: asString(r.note),
  enteredBy: asString(r.entered_by), monthToDeductFrom: asString(r.month_to_deduct_from) });
const mapRecovery = (r: Record<string, unknown>): SalaryRecovery => ({ id: asString(r.id), employeeId: asString(r.employee_id),
  salaryMonth: asString(r.salary_month), amountRecovered: asNumber(r.amount_recovered),
  remainingBalanceAfter: asNumber(r.remaining_balance_after), recoveredBy: asString(r.recovered_by), recoveredAt: asString(r.recovered_at) });
const mapPayment = (r: Record<string, unknown>): SalaryPayment => ({ id: asString(r.id), employeeId: asString(r.employee_id),
  salaryMonth: asString(r.salary_month), grossSalary: asNumber(r.gross_salary), advanceRecovered: asNumber(r.advance_recovered),
  amountPayable: asNumber(r.amount_payable), status: asString(r.status), paidOn: asString(r.paid_on),
  paymentMode: asString(r.payment_mode), remarks: asString(r.remarks), paidBy: asString(r.paid_by),
  changedAfterPayment: Boolean(r.changed_after_payment) });

function mapRules(row: Record<string, unknown> | null): SalaryRules {
  if (!row) return DEFAULT_RULES;
  return {
    otGraceMinutes: asNumber(row.ot_grace_minutes), minOtMinutes: asNumber(row.min_ot_minutes),
    hoursRoundingMinutes: asNumber(row.hours_rounding_minutes), ignorePunchesBefore: asString(row.ignore_punches_before),
    lunchWindowStart: asString(row.lunch_window_start), lunchWindowEnd: asString(row.lunch_window_end),
    holidaysArePaid: Boolean(row.holidays_are_paid), holidayHoursEqualWorkingHours: Boolean(row.holiday_hours_equal_working_hours),
    advanceMaxPercentOfSalary: asNumber(row.advance_max_percent_of_salary), salaryPayDay: asNumber(row.salary_pay_day),
  };
}

function rulesToRow(rules: SalaryRules) {
  return { id: true, ot_grace_minutes: rules.otGraceMinutes, min_ot_minutes: rules.minOtMinutes,
    hours_rounding_minutes: rules.hoursRoundingMinutes, ignore_punches_before: rules.ignorePunchesBefore,
    lunch_window_start: rules.lunchWindowStart, lunch_window_end: rules.lunchWindowEnd,
    holidays_are_paid: rules.holidaysArePaid, holiday_hours_equal_working_hours: rules.holidayHoursEqualWorkingHours,
    advance_max_percent_of_salary: rules.advanceMaxPercentOfSalary, salary_pay_day: rules.salaryPayDay };
}

export async function loadSalaryState(): Promise<SalaryState> {
  const [employees, settings, rules, uploads, days, edits, holidays, advances, recoveries, payments] = await Promise.all([
    supabase.from("employees").select("*").order("machine_no"),
    supabase.from("employee_salary_settings").select("*"),
    supabase.from("salary_rules_global").select("*").limit(1).maybeSingle(),
    supabase.from("attendance_uploads").select("*").order("uploaded_at", { ascending: false }),
    supabase.from("attendance_days").select("*"),
    supabase.from("attendance_edits").select("*").order("edited_at", { ascending: false }),
    supabase.from("holidays").select("*"),
    supabase.from("advances").select("*").order("date", { ascending: false }),
    supabase.from("advance_recoveries").select("*"),
    supabase.from("salary_payments").select("*"),
  ]);
  const error = [employees, settings, rules, uploads, days, edits, holidays, advances, recoveries, payments].find((result) => result.error)?.error;
  if (error) throw error;
  const settingsByEmployee = new Map<string, SalarySettings[]>();
  for (const row of asRows(settings.data)) {
    const id = asString(row.employee_id);
    settingsByEmployee.set(id, [...(settingsByEmployee.get(id) ?? []), toSettings(row)]);
  }
  return {
    employees: asRows(employees.data).map((row) => mapEmployee(row, settingsByEmployee.get(asString(row.id)) ?? [])),
    rules: mapRules(rules.data as Record<string, unknown> | null),
    uploads: asRows(uploads.data).map(mapUpload), days: asRows(days.data).map(mapDay),
    edits: asRows(edits.data).map(mapEdit), holidays: asRows(holidays.data).map(mapHoliday),
    advances: asRows(advances.data).map(mapAdvance), recoveries: asRows(recoveries.data).map(mapRecovery),
    payments: asRows(payments.data).map(mapPayment),
  };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Your sign-in session has expired. Sign in again to continue.");
  return data.user.id;
}

function throwIf(error: { message: string } | null) { if (error) throw new Error(error.message); }

export async function saveAttendanceUpload(file: File, parsed: ParsedAttendance, prior: SalaryUpload | null, keepEdits: Map<string, SalaryDay>): Promise<void> {
  const uid = await currentUserId();
  const version = (prior?.version ?? 0) + 1;
  const filePath = `${uid}/${parsed.month}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const storage = await supabase.storage.from("salary-attendance").upload(filePath, file, { contentType: file.type || "application/vnd.ms-excel", upsert: false });
  throwIf(storage.error);
  if (prior) throwIf((await supabase.from("attendance_uploads").update({ status: "previous" }).eq("id", prior.id)).error);
  const { data: uploadRow, error: uploadError } = await supabase.from("attendance_uploads").insert({
    month: parsed.month, file_name: file.name, file_path: filePath, uploaded_by: uid, version, status: "active",
  }).select("id").single();
  throwIf(uploadError);
  const uploadId = asString((uploadRow as Record<string, unknown> | null)?.id);
  const employees: Array<Record<string, unknown>> = [];
  for (const emp of parsed.employees) employees.push({ machine_no: emp.machineNo, name: emp.name, department: emp.department,
    is_active: true, created_from_upload_id: uploadId, created_by: uid });
  if (employees.length) throwIf((await supabase.from("employees").upsert(employees, { onConflict: "machine_no", ignoreDuplicates: true })).error);
  const { data: dbEmployees, error: listErr } = await supabase.from("employees").select("id,machine_no");
  throwIf(listErr);
  const idByNo = new Map(asRows(dbEmployees).map((row) => [asString(row.machine_no), asString(row.id)]));
  const punchRows: Array<Record<string, unknown>> = [];
  const dayRows: Array<Record<string, unknown>> = [];
  for (const emp of parsed.employees) {
    const employeeId = idByNo.get(emp.machineNo);
    if (!employeeId) continue;
    for (const [date, punches] of Object.entries(emp.punches)) {
      for (const punchTime of punches) punchRows.push({ upload_id: uploadId, employee_id: employeeId, date, punch_time: punchTime });
      const priorDay = keepEdits.get(`${employeeId}|${date}`);
      dayRows.push({ employee_id: employeeId, month: parsed.month, date, raw_punches: punches,
        in_time_edited: priorDay?.inTimeEdited ?? null, out_time_edited: priorDay?.outTimeEdited ?? null,
        is_edited: Boolean(priorDay?.inTimeEdited || priorDay?.outTimeEdited) });
    }
    for (const dayRow of Object.values(emp.punches).flatMap(() => [])) void dayRow;
  }
  throwIf((await supabase.from("attendance_days").delete().eq("month", parsed.month)).error);
  if (punchRows.length) throwIf((await supabase.from("punch_logs").insert(punchRows)).error);
  if (dayRows.length) throwIf((await supabase.from("attendance_days").upsert(dayRows, { onConflict: "employee_id,date" })).error);
  await logActivity("Salary Generation", "IMPORT", "Attendance", parsed.month);
}

export async function saveGlobalRules(rules: SalaryRules): Promise<void> {
  const { error } = await supabase.from("salary_rules_global").upsert(rulesToRow(rules), { onConflict: "id" });
  throwIf(error); await logActivity("Salary Generation", "EDIT", "Global Rules", "Salary rules");
}

export async function saveEmployee(input: { id?: string; machineNo: string; name: string; department: string; isActive: boolean; joinedOn: string; leftOn: string }): Promise<void> {
  const uid = await currentUserId();
  const row = { machine_no: input.machineNo, name: input.name.trim(), department: input.department.trim(), is_active: input.isActive,
    joined_on: input.joinedOn || null, left_on: input.leftOn || null, updated_at: new Date().toISOString() };
  const query = input.id ? supabase.from("employees").update(row).eq("id", input.id) : supabase.from("employees").insert({ ...row, created_by: uid });
  const { error } = await query; throwIf(error); await logActivity("Salary Generation", input.id ? "EDIT" : "CREATE", "Employee", input.machineNo);
}

export async function saveEmployeeSettings(employeeId: string, settings: SalarySettings): Promise<void> {
  const uid = await currentUserId();
  throwIf((await supabase.from("employee_salary_settings").insert({ employee_id: employeeId, monthly_salary: settings.monthlySalary,
    working_hours_per_day: settings.workingHoursPerDay, shift_start_time: settings.shiftStartTime,
    shift_length_incl_lunch_hours: settings.shiftLengthInclLunchHours, lunch_minutes: settings.lunchMinutes,
    lunch_unpaid_if_out_before: settings.lunchUnpaidIfOutBefore, effective_from: settings.effectiveFrom, created_by: uid })).error);
  await logActivity("Salary Generation", "EDIT", "Salary Settings", employeeId);
}

export async function saveAttendanceEdit(input: { employeeId: string; date: string; field: SalaryEdit["field"]; value: string; reason: string }): Promise<void> {
  const uid = await currentUserId();
  if (!input.reason.trim()) throw new Error("A reason is required for every attendance edit.");
  const column = input.field === "in_time" ? "in_time_edited" : "out_time_edited";
  const { data: prior, error: priorError } = await supabase.from("attendance_days").select("*").eq("employee_id", input.employeeId).eq("date", input.date).maybeSingle();
  throwIf(priorError);
  const current = prior as Record<string, unknown> | null;
  const oldValue = asString(current?.[column]) || (Array.isArray(current?.raw_punches) ? asString((current?.raw_punches as unknown[])[input.field === "in_time" ? 0 : (current?.raw_punches as unknown[]).length - 1]) : "");
  throwIf((await supabase.from("attendance_edits").insert({ employee_id: input.employeeId, date: input.date, field: input.field,
    old_value: oldValue || null, new_value: input.value || null, reason: input.reason.trim(), edited_by: uid })).error);
  throwIf((await supabase.from("attendance_days").upsert({ employee_id: input.employeeId, month: input.date.slice(0, 7), date: input.date,
    raw_punches: current?.raw_punches ?? [], [column]: input.value || null, is_edited: true }, { onConflict: "employee_id,date" })).error);
  const { error: paymentError } = await supabase.from("salary_payments").update({ status: "Unpaid", changed_after_payment: true })
    .eq("employee_id", input.employeeId).eq("salary_month", input.date.slice(0, 7)).eq("status", "Paid");
  throwIf(paymentError);
  await logActivity("Salary Generation", "EDIT", "Attendance", input.date);
}

export async function addHoliday(input: SalaryHoliday): Promise<void> {
  const uid = await currentUserId();
  throwIf((await supabase.from("holidays").upsert({ date: input.date, name: input.name, is_recurring_sunday: input.isRecurringSunday, created_by: uid }, { onConflict: "date" })).error);
  await logActivity("Salary Generation", "CREATE", "Holiday", input.date);
}
export async function removeHoliday(date: string): Promise<void> {
  throwIf((await supabase.from("holidays").delete().eq("date", date)).error);
  await logActivity("Salary Generation", "DELETE", "Holiday", date);
}

export async function addAdvance(input: Omit<SalaryAdvance, "id" | "enteredBy">): Promise<void> {
  const uid = await currentUserId();
  throwIf((await supabase.from("advances").insert({ employee_id: input.employeeId, date: input.date, amount: input.amount,
    type: input.type, note: input.note, entered_by: uid, month_to_deduct_from: input.monthToDeductFrom })).error);
  await logActivity("Salary Generation", "CREATE", "Advance", input.employeeId);
}

export async function markSalaryPaid(input: { employeeId: string; salaryMonth: string; grossSalary: number; advanceRecovered: number; dueAdvances: number; paidOn: string; paymentMode: string; remarks: string }): Promise<void> {
  const uid = await currentUserId();
  const recovery = Math.max(0, Math.min(input.advanceRecovered, input.dueAdvances, input.grossSalary));
  const remaining = Math.max(0, input.dueAdvances - recovery);
  const { error } = await supabase.from("salary_payments").upsert({ employee_id: input.employeeId, salary_month: input.salaryMonth,
    gross_salary: input.grossSalary, advance_recovered: recovery, amount_payable: Math.max(0, input.grossSalary - recovery),
    status: "Paid", paid_on: input.paidOn, payment_mode: input.paymentMode, remarks: input.remarks, paid_by: uid, changed_after_payment: false }, { onConflict: "employee_id,salary_month" });
  throwIf(error);
  throwIf((await supabase.from("advance_recoveries").delete().eq("employee_id", input.employeeId).eq("salary_month", input.salaryMonth)).error);
  throwIf((await supabase.from("advance_recoveries").insert({ employee_id: input.employeeId, salary_month: input.salaryMonth,
    amount_recovered: recovery, remaining_balance_after: remaining, recovered_by: uid })).error);
  await logActivity("Salary Generation", "EDIT", "Salary Payment", `${input.salaryMonth} · ${input.employeeId}`);
}

export function resetSalaryState(): SalaryState { return EMPTY_SALARY_STATE; }
