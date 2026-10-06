-- Salary Generation schema. Keep this independent of existing payroll-agnostic modules.
-- Run the enum change by itself first, then run the remainder after it commits.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accounts';

-- Storage bucket: create a private `salary-attendance` bucket in Storage before uploads.

CREATE TABLE IF NOT EXISTS public.salary_rules_global (
  id text PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  ot_grace_minutes integer NOT NULL DEFAULT 20,
  min_ot_minutes integer NOT NULL DEFAULT 0,
  hours_rounding_minutes integer NOT NULL DEFAULT 30,
  ignore_punches_before time NOT NULL DEFAULT '06:00',
  lunch_window_start time NOT NULL DEFAULT '13:00',
  lunch_window_end time NOT NULL DEFAULT '13:30',
  holidays_are_paid boolean NOT NULL DEFAULT true,
  holiday_hours_equal_working_hours boolean NOT NULL DEFAULT true,
  advance_max_percent_of_salary numeric NOT NULL DEFAULT 50,
  salary_pay_day integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.salary_rules_global TO authenticated;
GRANT ALL ON public.salary_rules_global TO service_role;
ALTER TABLE public.salary_rules_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salary rules read payroll roles" ON public.salary_rules_global FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "salary rules manage admin" ON public.salary_rules_global FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.salary_rules_global (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.attendance_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL CHECK (month ~ '^\\d{4}-\\d{2}$'),
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','previous')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_uploads_active_month_idx ON public.attendance_uploads(month) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE ON public.attendance_uploads TO authenticated;
GRANT ALL ON public.attendance_uploads TO service_role;
ALTER TABLE public.attendance_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance uploads payroll roles" ON public.attendance_uploads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "attendance uploads add payroll roles" ON public.attendance_uploads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "attendance uploads update payroll roles" ON public.attendance_uploads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_no text NOT NULL UNIQUE,
  name text NOT NULL,
  department text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  joined_on date,
  left_on date,
  created_from_upload_id uuid REFERENCES public.attendance_uploads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees payroll roles" ON public.employees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "employees manage admin" ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "employees import payroll roles" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE TABLE IF NOT EXISTS public.employee_salary_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  monthly_salary numeric NOT NULL CHECK (monthly_salary >= 0),
  working_hours_per_day numeric NOT NULL CHECK (working_hours_per_day > 0),
  shift_start_time time NOT NULL DEFAULT '09:00',
  shift_length_incl_lunch_hours numeric NOT NULL,
  lunch_minutes integer NOT NULL DEFAULT 30,
  lunch_unpaid_if_out_before time NOT NULL DEFAULT '18:30',
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS employee_salary_settings_effective_idx ON public.employee_salary_settings(employee_id,effective_from DESC);
GRANT SELECT, INSERT ON public.employee_salary_settings TO authenticated;
GRANT ALL ON public.employee_salary_settings TO service_role;
ALTER TABLE public.employee_salary_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salary settings payroll roles read" ON public.employee_salary_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "salary settings admin insert" ON public.employee_salary_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.punch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.attendance_uploads(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  punch_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS punch_logs_date_employee_idx ON public.punch_logs(employee_id,date);
GRANT SELECT, INSERT ON public.punch_logs TO authenticated;
GRANT ALL ON public.punch_logs TO service_role;
ALTER TABLE public.punch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "punch logs payroll roles read" ON public.punch_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "punch logs payroll roles insert" ON public.punch_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE TABLE IF NOT EXISTS public.attendance_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^\\d{4}-\\d{2}$'),
  date date NOT NULL,
  raw_punches text[] NOT NULL DEFAULT '{}',
  in_time_edited time,
  out_time_edited time,
  status text NOT NULL DEFAULT 'Absent' CHECK (status IN ('Present','Absent','Holiday')),
  regular_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_edited boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (employee_id,date)
);
CREATE INDEX IF NOT EXISTS attendance_days_month_idx ON public.attendance_days(month,date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_days TO authenticated;
GRANT ALL ON public.attendance_days TO service_role;
ALTER TABLE public.attendance_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance days payroll roles" ON public.attendance_days FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE TABLE IF NOT EXISTS public.attendance_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  field text NOT NULL CHECK (field IN ('in_time','out_time')),
  old_value text,
  new_value text,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS attendance_edits_employee_date_idx ON public.attendance_edits(employee_id,date,edited_at DESC);
GRANT SELECT, INSERT ON public.attendance_edits TO authenticated;
GRANT ALL ON public.attendance_edits TO service_role;
ALTER TABLE public.attendance_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance edits payroll roles read" ON public.attendance_edits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "attendance edits payroll roles append" ON public.attendance_edits FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts')) AND edited_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.holidays (
  date date PRIMARY KEY,
  name text NOT NULL,
  is_recurring_sunday boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holidays payroll roles read" ON public.holidays FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "holidays admin manage" ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('Regular 25th','Emergency','Other')),
  note text NOT NULL DEFAULT '',
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  month_to_deduct_from text NOT NULL CHECK (month_to_deduct_from ~ '^\\d{4}-\\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS advances_employee_month_idx ON public.advances(employee_id,month_to_deduct_from);
GRANT SELECT, INSERT ON public.advances TO authenticated;
GRANT ALL ON public.advances TO service_role;
ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advances payroll roles read" ON public.advances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "advances payroll roles insert" ON public.advances FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts')) AND entered_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.advance_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  salary_month text NOT NULL CHECK (salary_month ~ '^\\d{4}-\\d{2}$'),
  amount_recovered numeric NOT NULL DEFAULT 0 CHECK (amount_recovered >= 0),
  remaining_balance_after numeric NOT NULL DEFAULT 0 CHECK (remaining_balance_after >= 0),
  recovered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (employee_id,salary_month)
);
GRANT SELECT, INSERT, DELETE ON public.advance_recoveries TO authenticated;
GRANT ALL ON public.advance_recoveries TO service_role;
ALTER TABLE public.advance_recoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recoveries payroll roles" ON public.advance_recoveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));

CREATE TABLE IF NOT EXISTS public.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  salary_month text NOT NULL CHECK (salary_month ~ '^\\d{4}-\\d{2}$'),
  gross_salary numeric NOT NULL DEFAULT 0,
  advance_recovered numeric NOT NULL DEFAULT 0,
  amount_payable numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid','Paid')),
  paid_on date,
  payment_mode text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_after_payment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id,salary_month)
);
GRANT SELECT, INSERT, UPDATE ON public.salary_payments TO authenticated;
GRANT ALL ON public.salary_payments TO service_role;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments payroll roles read" ON public.salary_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "payments admin manage" ON public.salary_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Database-enforced append-only attendance audit log.
CREATE OR REPLACE FUNCTION public.reject_attendance_edit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Attendance edit audit entries cannot be changed or deleted';
END;
$$;
DROP TRIGGER IF EXISTS attendance_edits_append_only ON public.attendance_edits;
CREATE TRIGGER attendance_edits_append_only BEFORE UPDATE OR DELETE ON public.attendance_edits
FOR EACH ROW EXECUTE FUNCTION public.reject_attendance_edit_mutation();