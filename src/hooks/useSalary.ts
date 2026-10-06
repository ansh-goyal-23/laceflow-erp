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
}

export interface SalaryPayment {
  employee_id: string;
  month: string;
  amount: number;
  paid_on: string;
  remarks: string | null;
  paid_by: string | null;
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
    queryFn: async (): Promise<{ holiday_date: string; name: string }[]> => {
      const { data, error } = await sb.from('salary_holidays').select('*').order('holiday_date');
      if (error) throw error;
      return data || [];
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

export function useUpdateSalaryEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string; monthly_salary: number | null; working_hours: number | null; lunch_included: boolean; is_active: boolean;
    }) => {
      const { id, ...patch } = input;
      const { error } = await sb.from('salary_employees').update(patch).eq('id', id);
      if (error) throw error;
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
      const { error } = await sb.from('salary_holidays').upsert(input, { onConflict: 'holiday_date' });
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
