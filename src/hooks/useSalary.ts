import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { daysInMonthOf, type TimeOverride } from '@/lib/salaryCalc';
import type { ParsedAttendance } from '@/lib/attendanceParser';

// All salary tables are admin-only (enforced by RLS) -- non-admins get empty/errors.
const sb = supabase as any;

export interface SalaryEmployee {
  id: string;
  machine_no: number;
  name: string;
  department: string | null;
  is_active: boolean;
  monthly_salary: number | null;
  working_hours: number | null;
  lunch_included: boolean;
  joined_on: string | null;
  left_on: string | null;
  /** 'hourly' = attendance based; 'fixed' = the monthly amount is paid as is. */
  pay_type: 'hourly' | 'fixed';
}

export interface SalaryChangeRow {
  id: number; employee_id: string | null; entity: 'employee' | 'advance' | 'upload'; action: 'edit' | 'delete';
  field: string | null; old_value: string | null; new_value: string | null; note: string | null; by_email: string | null; at: string;
}

export interface SalaryHoliday { holiday_date: string; name: string; confirmed: boolean }

export interface SalaryRun {
  employee_id: string;
  month: string;
  monthly_salary: number;
  working_hours: number;
  lunch_included: boolean;
  pay_type: 'hourly' | 'fixed';
  holidays: Record<string, string>;
  days_present: number;
  overtime_minutes: number;
  paid_hours: number;
  salary: number;
  advance_balance_before: number;
  advance_recovered: number;
  net_payable: number;
  generated_at: string;
  generated_by: string | null;
}

export interface SalaryRunLogRow {
  id: number; employee_id: string; month: string; action: 'generate' | 'reopen';
  reason: string | null; amount: number | null; by_email: string | null; at: string;
}

export interface SalaryPayment {
  employee_id: string;
  month: string;
  amount: number;
  paid_on: string;
  remarks: string | null;
  paid_by: string | null;
}

export interface SalaryAdvance {
  id: number;
  employee_id: string;
  month: string;
  amount: number;
  given_on: string;
  note: string | null;
  created_by: string | null;
}

export interface SalaryEditRow {
  id: number;
  employee_id: string;
  work_date: string;
  field: 'in' | 'out';
  old_value: string | null;
  new_value: string | null;
  machine_value: string | null;
  reason: string;
  edited_by_email: string | null;
  edited_at: string;
}

const monthRange = (month: string) => ({ from: `${month}-01`, to: `${month}-${String(daysInMonthOf(month)).padStart(2, '0')}` });

/** Supabase returns at most 1000 rows per request; page through. */
async function fetchAll(build: () => any): Promise<any[]> {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

const invalidateSalary = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith('salary_') });

export function useSalaryEmployees() {
  return useQuery({
    queryKey: ['salary_employees'],
    queryFn: async (): Promise<SalaryEmployee[]> => {
      const rows = await fetchAll(() => sb.from('salary_employees').select('*').order('machine_no'));
      return rows.map((r: any) => ({
        ...r,
        monthly_salary: r.monthly_salary == null ? null : Number(r.monthly_salary),
        working_hours: r.working_hours == null ? null : Number(r.working_hours),
      }));
    },
  });
}

/** Months that have an uploaded attendance sheet, newest first. */
export function useSalaryUploadedMonths() {
  return useQuery({
    queryKey: ['salary_uploads'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb.from('salary_uploads').select('month, uploaded_at').order('uploaded_at', { ascending: false });
      if (error) throw error;
      return Array.from(new Set((data || []).map((r: any) => r.month as string)));
    },
  });
}

/** employeeId -> date -> punches */
export function useSalaryPunches(month: string) {
  return useQuery({
    queryKey: ['salary_punches', month],
    queryFn: async (): Promise<Record<string, Record<string, string[]>>> => {
      const { from, to } = monthRange(month);
      const rows = await fetchAll(() =>
        sb.from('salary_punches').select('employee_id, work_date, punch_time').gte('work_date', from).lte('work_date', to).order('id'));
      const out: Record<string, Record<string, string[]>> = {};
      rows.forEach((r: any) => {
        ((out[r.employee_id] ||= {})[r.work_date] ||= []).push(r.punch_time);
      });
      return out;
    },
  });
}

/** employeeId -> date -> override */
export function useSalaryOverrides(month: string) {
  return useQuery({
    queryKey: ['salary_overrides', month],
    queryFn: async (): Promise<Record<string, Record<string, TimeOverride>>> => {
      const { from, to } = monthRange(month);
      const rows = await fetchAll(() =>
        sb.from('salary_time_overrides').select('*').gte('work_date', from).lte('work_date', to).order('work_date'));
      const out: Record<string, Record<string, TimeOverride>> = {};
      rows.forEach((r: any) => {
        (out[r.employee_id] ||= {})[r.work_date] = {
          inSet: r.in_set, inTime: r.in_time, outSet: r.out_set, outTime: r.out_time,
        };
      });
      return out;
    },
  });
}

export function useSalaryHolidays() {
  return useQuery({
    queryKey: ['salary_holidays'],
    queryFn: async (): Promise<SalaryHoliday[]> => {
      const { data, error } = await sb.from('salary_holidays').select('*').order('holiday_date');
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, confirmed: r.confirmed !== false }));
    },
  });
}

export function useSalaryPayments(month: string) {
  return useQuery({
    queryKey: ['salary_payments', month],
    queryFn: async (): Promise<Record<string, SalaryPayment>> => {
      const { data, error } = await sb.from('salary_payments').select('*').eq('month', month);
      if (error) throw error;
      const out: Record<string, SalaryPayment> = {};
      (data || []).forEach((r: any) => { out[r.employee_id] = { ...r, amount: Number(r.amount) }; });
      return out;
    },
  });
}

export function useSalaryEdits(employeeId: string | null, month: string) {
  return useQuery({
    queryKey: ['salary_edits', employeeId, month],
    enabled: !!employeeId,
    queryFn: async (): Promise<SalaryEditRow[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await sb.from('salary_time_edits').select('*')
        .eq('employee_id', employeeId).gte('work_date', from).lte('work_date', to)
        .order('edited_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

type ChangeInput = Omit<SalaryChangeRow, 'id' | 'by_email' | 'at'>;

/** Append rows to the change log (admin-only, append-only table). */
async function logChanges(rows: ChangeInput[]) {
  if (!rows.length) return;
  const { data: u } = await supabase.auth.getUser();
  const email = u?.user?.email || null;
  const { error } = await sb.from('salary_change_log').insert(rows.map(r => ({ ...r, by_email: email })));
  if (error) throw error;
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

export function useUpdateSalaryEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      previous: SalaryEmployee; monthly_salary: number | null; working_hours: number | null; lunch_included: boolean;
      is_active: boolean; left_on: string | null; pay_type: 'hourly' | 'fixed';
    }) => {
      const { previous, ...patch } = input;
      const { error } = await sb.from('salary_employees').update(patch).eq('id', previous.id);
      if (error) throw error;
      // The first time salary details are entered is not logged; every change after that is.
      if (previous.monthly_salary != null || previous.working_hours != null) {
        const fields: [string, unknown, unknown][] = [
          ['Pay type', previous.pay_type, patch.pay_type],
          ['Monthly salary', previous.monthly_salary, patch.monthly_salary],
          ['Working hours', previous.working_hours, patch.working_hours],
          ['Lunch included', previous.lunch_included, patch.lunch_included],
          ['Working', previous.is_active, patch.is_active],
          ['Date left', previous.left_on, patch.left_on],
        ];
        await logChanges(fields.filter(([, o, n]) => show(o) !== show(n)).map(([field, o, n]) => ({
          employee_id: previous.id, entity: 'employee', action: 'edit', field, old_value: show(o), new_value: show(n), note: null,
        })));
      }
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export interface UploadResult { month: string; total: number; added: number; withPunches: number; punchRows: number }

export function useUploadAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { parsed: ParsedAttendance; fileName: string }): Promise<UploadResult> => {
      const { parsed, fileName } = input;
      const { data: u } = await supabase.auth.getUser();

      const { count: locked, error: eLock } = await sb.from('salary_runs').select('employee_id', { count: 'exact', head: true }).eq('month', parsed.month);
      if (eLock) throw eLock;
      if (locked) throw new Error(`Salary for ${parsed.month} is already generated for ${locked} employee(s). Reopen those first, then upload again.`);

      // 1. Add employees we have not seen before (never overwrite salary settings).
      const { data: existing, error: e0 } = await sb.from('salary_employees').select('machine_no');
      if (e0) throw e0;
      const known = new Set((existing || []).map((r: any) => r.machine_no));
      const fresh = parsed.employees.filter(e => !known.has(e.machineNo));
      if (fresh.length) {
        const { error } = await sb.from('salary_employees').upsert(
          fresh.map(e => ({ machine_no: e.machineNo, name: e.name, department: e.department || null })),
          { onConflict: 'machine_no', ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      const { data: emps, error: e1 } = await sb.from('salary_employees').select('id, machine_no');
      if (e1) throw e1;
      const idByNo = new Map<number, string>((emps || []).map((r: any) => [r.machine_no, r.id]));

      // 2. Record the upload.
      const { data: up, error: e2 } = await sb.from('salary_uploads')
        .insert({ month: parsed.month, file_name: fileName, uploaded_by: u?.user?.email || null })
        .select('id').single();
      if (e2) throw e2;

      // 3. Replace this month's raw punches (manual edits are kept: they are separate).
      const { from, to } = monthRange(parsed.month);
      const { error: e3 } = await sb.from('salary_punches').delete().gte('work_date', from).lte('work_date', to);
      if (e3) throw e3;
      const rows: any[] = [];
      parsed.employees.forEach(e => {
        const id = idByNo.get(e.machineNo);
        if (!id) return;
        Object.entries(e.punches).forEach(([date, times]) =>
          times.forEach(t => rows.push({ employee_id: id, work_date: date, punch_time: t, upload_id: up.id })));
      });
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('salary_punches').insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      return {
        month: parsed.month,
        total: parsed.employees.length,
        added: fresh.length,
        withPunches: parsed.employees.filter(e => Object.keys(e.punches).length > 0).length,
        punchRows: rows.length,
      };
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

/**
 * Save a manual in/out time edit. The change is written to the append-only
 * salary_time_edits log AND to salary_time_overrides (current value). Raw
 * machine punches are never touched.
 */
export function useSaveTimeEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employeeId: string; date: string; field: 'in' | 'out';
      oldValue: string | null; newValue: string | null; machineValue: string | null;
      reason: string; reset: boolean; current?: TimeOverride;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await sb.from('salary_time_edits').insert({
        employee_id: input.employeeId, work_date: input.date, field: input.field,
        old_value: input.oldValue, new_value: input.newValue, machine_value: input.machineValue,
        reason: input.reason.trim(), edited_by: u?.user?.id || null, edited_by_email: u?.user?.email || null,
      });
      if (e1) throw e1;
      const cur = input.current || {};
      const row: any = {
        employee_id: input.employeeId, work_date: input.date,
        in_set: !!cur.inSet, in_time: cur.inTime ?? null,
        out_set: !!cur.outSet, out_time: cur.outTime ?? null,
        updated_at: new Date().toISOString(),
      };
      if (input.field === 'in') { row.in_set = !input.reset; row.in_time = input.reset ? null : input.newValue; }
      else { row.out_set = !input.reset; row.out_time = input.reset ? null : input.newValue; }
      const { error: e2 } = await sb.from('salary_time_overrides').upsert(row, { onConflict: 'employee_id,work_date' });
      if (e2) throw e2;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useMarkSalaryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; month: string; amount: number; paidOn: string; remarks: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb.from('salary_payments').upsert({
        employee_id: input.employeeId, month: input.month, amount: input.amount,
        paid_on: input.paidOn, remarks: input.remarks.trim() || null, paid_by: u?.user?.email || null,
      }, { onConflict: 'employee_id,month' });
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useUnmarkSalaryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; month: string }) => {
      const { error } = await sb.from('salary_payments').delete().eq('employee_id', input.employeeId).eq('month', input.month);
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useSaveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { holiday_date: string; name: string }) => {
      const { error } = await sb.from('salary_holidays').upsert({ ...input, confirmed: true }, { onConflict: 'holiday_date' });
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

/** Edit a holiday's date and/or name (also confirms a carried-forward date). */
export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { oldDate: string; newDate: string; name: string }) => {
      const { error } = await sb.from('salary_holidays')
        .update({ holiday_date: input.newDate, name: input.name, confirmed: true }).eq('holiday_date', input.oldDate);
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await sb.from('salary_holidays').delete().eq('holiday_date', date);
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

/** Copy a year's holiday names into the next year as "date to confirm" (does not count in salary until confirmed). */
export function useCarryHolidaysForward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fromYear: number): Promise<number> => {
      const { data, error } = await sb.from('salary_holidays').select('*')
        .gte('holiday_date', `${fromYear}-01-01`).lte('holiday_date', `${fromYear}-12-31`).eq('confirmed', true);
      if (error) throw error;
      const rows = (data || []).map((r: any) => {
        const [, m, d] = String(r.holiday_date).split('-').map(Number);
        const dt = new Date(fromYear + 1, m - 1, Math.min(d, new Date(fromYear + 1, m, 0).getDate()));
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        return { holiday_date: date, name: r.name, confirmed: false };
      });
      if (!rows.length) return 0;
      const { error: e2 } = await sb.from('salary_holidays').upsert(rows, { onConflict: 'holiday_date', ignoreDuplicates: true });
      if (e2) throw e2;
      return rows.length;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

/** Whole advance ledger (all months). Balance = sum(given) - sum(recovered in generated salaries). */
export function useSalaryAdvanceLedger() {
  return useQuery({
    queryKey: ['salary_advances'],
    queryFn: async (): Promise<SalaryAdvance[]> => {
      const rows = await fetchAll(() => sb.from('salary_advances').select('*').order('given_on').order('id'));
      return rows.map((r: any) => ({ ...r, amount: Number(r.amount) }));
    },
  });
}

export function useAddSalaryAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; amount: number; givenOn: string; note: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sb.from('salary_advances').insert({
        employee_id: input.employeeId, month: input.givenOn.slice(0, 7), amount: input.amount,
        given_on: input.givenOn, note: input.note.trim() || null, created_by: u?.user?.email || null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useUpdateSalaryAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { previous: SalaryAdvance; amount: number; givenOn: string; note: string }) => {
      const { previous } = input;
      const { error } = await sb.from('salary_advances').update({
        amount: input.amount, given_on: input.givenOn, month: input.givenOn.slice(0, 7), note: input.note.trim() || null,
      }).eq('id', previous.id);
      if (error) throw error;
      const fields: [string, unknown, unknown][] = [
        ['Amount', previous.amount, input.amount], ['Given on', previous.given_on, input.givenOn], ['Note', previous.note, input.note.trim() || null],
      ];
      await logChanges(fields.filter(([, o, n]) => show(o) !== show(n)).map(([field, o, n]) => ({
        employee_id: previous.employee_id, entity: 'advance', action: 'edit', field, old_value: show(o), new_value: show(n), note: null,
      })));
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useDeleteSalaryAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (advance: SalaryAdvance) => {
      const { error } = await sb.from('salary_advances').delete().eq('id', advance.id);
      if (error) throw error;
      await logChanges([{
        employee_id: advance.employee_id, entity: 'advance', action: 'delete', field: 'Advance entry',
        old_value: `${advance.amount} on ${advance.given_on}${advance.note ? ` (${advance.note})` : ''}`, new_value: null, note: null,
      }]);
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

const mapRun = (r: any): SalaryRun => ({
  ...r,
  monthly_salary: Number(r.monthly_salary), working_hours: Number(r.working_hours), paid_hours: Number(r.paid_hours),
  salary: Number(r.salary), advance_balance_before: Number(r.advance_balance_before),
  advance_recovered: Number(r.advance_recovered), net_payable: Number(r.net_payable),
  holidays: r.holidays || {},
});

/** Generated salaries for one month, by employee. */
export function useSalaryRuns(month: string) {
  return useQuery({
    queryKey: ['salary_runs', month],
    queryFn: async (): Promise<Record<string, SalaryRun>> => {
      const { data, error } = await sb.from('salary_runs').select('*').eq('month', month);
      if (error) throw error;
      const out: Record<string, SalaryRun> = {};
      (data || []).forEach((r: any) => { out[r.employee_id] = mapRun(r); });
      return out;
    },
  });
}

/** Every generated salary's advance recovery (for balances and the ledger). */
export function useSalaryRecoveries() {
  return useQuery({
    queryKey: ['salary_runs_recoveries'],
    queryFn: async (): Promise<{ employee_id: string; month: string; amount: number }[]> => {
      const rows = await fetchAll(() => sb.from('salary_runs').select('employee_id, month, advance_recovered').gt('advance_recovered', 0).order('month'));
      return rows.map((r: any) => ({ employee_id: r.employee_id, month: r.month, amount: Number(r.advance_recovered) }));
    },
  });
}

export function useGenerateSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<SalaryRun, 'generated_at' | 'generated_by'>[]) => {
      const { data: u } = await supabase.auth.getUser();
      const email = u?.user?.email || null;
      const { error } = await sb.from('salary_runs').insert(rows.map(r => ({ ...r, generated_by: email })));
      if (error) throw error;
      const { error: e2 } = await sb.from('salary_run_log').insert(rows.map(r => ({
        employee_id: r.employee_id, month: r.month, action: 'generate', amount: r.net_payable,
        reason: r.advance_recovered > 0 ? `Advance recovered: ${r.advance_recovered}` : null, by_email: email,
      })));
      if (e2) throw e2;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useReopenSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; month: string; reason: string; amount: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await sb.from('salary_run_log').insert({
        employee_id: input.employeeId, month: input.month, action: 'reopen', reason: input.reason.trim(),
        amount: input.amount, by_email: u?.user?.email || null,
      });
      if (e1) throw e1;
      const { error } = await sb.from('salary_runs').delete().eq('employee_id', input.employeeId).eq('month', input.month);
      if (error) throw error;
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useSalaryUploadsList() {
  return useQuery({
    queryKey: ['salary_uploads_list'],
    queryFn: async (): Promise<{ id: string; month: string; file_name: string | null; uploaded_by: string | null; uploaded_at: string }[]> => {
      const { data, error } = await sb.from('salary_uploads').select('*').order('uploaded_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSalaryAuditEdits() {
  return useQuery({
    queryKey: ['salary_audit_edits'],
    queryFn: async (): Promise<(SalaryEditRow)[]> => {
      const { data, error } = await sb.from('salary_time_edits').select('*').order('edited_at', { ascending: false }).limit(300);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSalaryRunLog() {
  return useQuery({
    queryKey: ['salary_run_log'],
    queryFn: async (): Promise<SalaryRunLogRow[]> => {
      const { data, error } = await sb.from('salary_run_log').select('*').order('at', { ascending: false }).limit(300);
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) }));
    },
  });
}

/** Delete an uploaded attendance sheet and the machine punches that came from it. Blocked once salary is generated for that month. */
export function useDeleteSalaryUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (upload: { id: string; month: string; file_name: string | null }) => {
      const { count, error: e0 } = await sb.from('salary_runs').select('employee_id', { count: 'exact', head: true }).eq('month', upload.month);
      if (e0) throw e0;
      if (count) throw new Error(`Salary for ${upload.month} is already generated for ${count} employee(s). Reopen those first, then delete the sheet.`);
      const { error: e1 } = await sb.from('salary_punches').delete().eq('upload_id', upload.id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from('salary_uploads').delete().eq('id', upload.id);
      if (e2) throw e2;
      // If this was the last sheet for the month, clear any punches left over from replaced uploads too.
      const { count: left, error: e3 } = await sb.from('salary_uploads').select('id', { count: 'exact', head: true }).eq('month', upload.month);
      if (e3) throw e3;
      if (!left) {
        const { from, to } = monthRange(upload.month);
        const { error: e4 } = await sb.from('salary_punches').delete().gte('work_date', from).lte('work_date', to);
        if (e4) throw e4;
      }
      await logChanges([{
        employee_id: null, entity: 'upload', action: 'delete', field: 'Attendance sheet',
        old_value: `${upload.month}: ${upload.file_name || 'file'}`, new_value: null, note: null,
      }]);
    },
    onSuccess: () => invalidateSalary(qc),
  });
}

export function useSalaryChangeLog() {
  return useQuery({
    queryKey: ['salary_change_log'],
    queryFn: async (): Promise<SalaryChangeRow[]> => {
      const { data, error } = await sb.from('salary_change_log').select('*').order('at', { ascending: false }).limit(300);
      if (error) throw error;
      return data || [];
    },
  });
}
