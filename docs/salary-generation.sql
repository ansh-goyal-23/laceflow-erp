-- 20261006_salary_generation.sql  (public schema)
--
-- Salary Generation tab (admin-only): upload the thumb-print machine's
-- attendance sheet, keep an employee list with salary + working hours,
-- calculate attendance / overtime / salary per month, and log every manual
-- edit of an in/out time.
--
-- ADMIN-ONLY at the database level (not just hidden in the UI): salaries are
-- confidential. Every table below has a single admin-only RLS policy.
--
-- Design notes
--  * salary_punches holds the RAW machine punches. They are never edited;
--    re-uploading a month replaces that month's punches only.
--  * Manual corrections live in salary_time_overrides (current state), and
--    EVERY change is also appended to salary_time_edits (audit log). The log
--    is append-only: no update/delete grant, no update/delete policy.
--  * Employees are matched by the machine "No" (stable), not by name.
--  * Overtime / salary are computed in the app (src/lib/salaryCalc.ts), not
--    stored, so they always follow the latest edits and settings.
--  * salary_payments records "Paid" with the amount at the time of payment,
--    so a later edit shows up as a difference instead of silently changing
--    history.
-- SAFE / additive. Run in the Supabase SQL editor (if a big paste times out, run it in
-- 3-4 chunks: tables, grants + RLS, policies, seed).
-- notify pgrst, 'reload schema';  -- run once after, so the API sees the new tables

create table if not exists public.salary_employees (
  id             uuid primary key default gen_random_uuid(),
  machine_no     integer not null unique,
  name           text not null,
  department     text,
  is_active      boolean not null default true,        -- false = has left
  monthly_salary numeric(12, 2) check (monthly_salary >= 0),
  working_hours  numeric(5, 2)  check (working_hours > 0 and working_hours <= 24),
  -- true  = lunch is part of the paid working hours (12-hr / 10-hr workers)
  -- false = lunch is extra, unpaid 30 min on top (8-hr workers)
  lunch_included boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.salary_uploads (
  id          uuid primary key default gen_random_uuid(),
  month       text not null,                            -- 'YYYY-MM'
  file_name   text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.salary_punches (
  id          bigint generated always as identity primary key,
  employee_id uuid not null references public.salary_employees(id) on delete cascade,
  work_date   date not null,
  punch_time  text not null check (punch_time ~ '^[0-9]{2}:[0-9]{2}$'),
  upload_id   uuid references public.salary_uploads(id) on delete set null
);
create index if not exists salary_punches_emp_date_idx on public.salary_punches (employee_id, work_date);
create index if not exists salary_punches_date_idx on public.salary_punches (work_date);

create table if not exists public.salary_time_overrides (
  employee_id uuid not null references public.salary_employees(id) on delete cascade,
  work_date   date not null,
  in_set      boolean not null default false,           -- true = in_time overrides the machine
  in_time     text check (in_time is null or in_time ~ '^[0-9]{2}:[0-9]{2}$'),
  out_set     boolean not null default false,
  out_time    text check (out_time is null or out_time ~ '^[0-9]{2}:[0-9]{2}$'),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, work_date)
);

create table if not exists public.salary_time_edits (
  id           bigint generated always as identity primary key,
  employee_id  uuid not null references public.salary_employees(id) on delete cascade,
  work_date    date not null,
  field        text not null check (field in ('in', 'out')),
  old_value    text,
  new_value    text,
  machine_value text,
  reason       text not null check (length(btrim(reason)) > 0),
  edited_by    uuid,
  edited_by_email text,
  edited_at    timestamptz not null default now()
);
create index if not exists salary_time_edits_emp_idx on public.salary_time_edits (employee_id, work_date);

create table if not exists public.salary_holidays (
  holiday_date date primary key,
  name         text not null
);

create table if not exists public.salary_payments (
  employee_id uuid not null references public.salary_employees(id) on delete cascade,
  month       text not null,                            -- 'YYYY-MM'
  amount      numeric(12, 2) not null,                  -- salary at the time it was marked paid
  paid_on     date not null default current_date,
  remarks     text,
  paid_by     text,
  created_at  timestamptz not null default now(),
  primary key (employee_id, month)
);

-- Grants: the audit log is append-only (select + insert only).
grant select, insert, update, delete on public.salary_employees      to authenticated;
grant select, insert, update, delete on public.salary_uploads        to authenticated;
grant select, insert, update, delete on public.salary_punches        to authenticated;
grant select, insert, update, delete on public.salary_time_overrides to authenticated;
grant select, insert                 on public.salary_time_edits     to authenticated;
grant select, insert, update, delete on public.salary_holidays       to authenticated;
grant select, insert, update, delete on public.salary_payments       to authenticated;
grant all on public.salary_employees, public.salary_uploads, public.salary_punches,
             public.salary_time_overrides, public.salary_time_edits,
             public.salary_holidays, public.salary_payments to service_role;

-- Default privileges can hand out more than the grants above, so tighten explicitly.
-- The audit log must be append-only (RLS does not cover TRUNCATE, so revoke it).
revoke all on public.salary_time_edits from authenticated, anon;
grant select, insert on public.salary_time_edits to authenticated;
revoke all on public.salary_employees, public.salary_uploads, public.salary_punches,
              public.salary_time_overrides, public.salary_holidays, public.salary_payments from anon;
revoke truncate, trigger, references on public.salary_employees, public.salary_uploads,
              public.salary_punches, public.salary_time_overrides, public.salary_holidays,
              public.salary_payments from authenticated;

alter table public.salary_employees      enable row level security;
alter table public.salary_uploads        enable row level security;
alter table public.salary_punches        enable row level security;
alter table public.salary_time_overrides enable row level security;
alter table public.salary_time_edits     enable row level security;
alter table public.salary_holidays       enable row level security;
alter table public.salary_payments       enable row level security;

drop policy if exists "salary_employees_admin_all" on public.salary_employees;
create policy "salary_employees_admin_all" on public.salary_employees for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "salary_uploads_admin_all" on public.salary_uploads;
create policy "salary_uploads_admin_all" on public.salary_uploads for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "salary_punches_admin_all" on public.salary_punches;
create policy "salary_punches_admin_all" on public.salary_punches for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "salary_time_overrides_admin_all" on public.salary_time_overrides;
create policy "salary_time_overrides_admin_all" on public.salary_time_overrides for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "salary_holidays_admin_all" on public.salary_holidays;
create policy "salary_holidays_admin_all" on public.salary_holidays for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "salary_payments_admin_all" on public.salary_payments;
create policy "salary_payments_admin_all" on public.salary_payments for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Audit log: admins can read and append, nobody can change or delete.
drop policy if exists "salary_time_edits_admin_select" on public.salary_time_edits;
create policy "salary_time_edits_admin_select" on public.salary_time_edits
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "salary_time_edits_admin_insert" on public.salary_time_edits;
create policy "salary_time_edits_admin_insert" on public.salary_time_edits
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

-- Seed: the paid holidays known for Aug 2026 (Sundays are automatic in the app).
insert into public.salary_holidays (holiday_date, name) values
  ('2026-08-15', 'Independence Day'),
  ('2026-08-28', 'Raksha Bandhan')
on conflict (holiday_date) do nothing;

-- Salary advances (added later): per employee, per salary month; deducted from net payable.
create table if not exists public.salary_advances (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.salary_employees(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount numeric(12,2) not null check (amount > 0),
  given_on date not null default current_date,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists salary_advances_emp_month_idx on public.salary_advances (employee_id, month);
revoke all on public.salary_advances from anon;
grant select, insert, update, delete on public.salary_advances to authenticated;
grant all on public.salary_advances to service_role;
alter table public.salary_advances enable row level security;
create policy "salary_advances_admin_all" on public.salary_advances for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Master employees, monthly salary runs, holiday confirmation (added later)
alter table public.salary_employees add column if not exists joined_on date;
alter table public.salary_employees add column if not exists left_on date;
alter table public.salary_holidays add column if not exists confirmed boolean not null default true;

create table if not exists public.salary_runs (
  employee_id uuid not null references public.salary_employees(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  monthly_salary numeric(12,2) not null,
  working_hours numeric(5,2) not null,
  lunch_included boolean not null default false,
  holidays jsonb not null default '{}'::jsonb,
  days_present integer not null default 0,
  overtime_minutes integer not null default 0,
  paid_hours numeric(10,2) not null default 0,
  salary numeric(12,2) not null,
  advance_balance_before numeric(12,2) not null default 0,
  advance_recovered numeric(12,2) not null default 0 check (advance_recovered >= 0),
  net_payable numeric(12,2) not null,
  generated_at timestamptz not null default now(),
  generated_by text,
  primary key (employee_id, month)
);
create table if not exists public.salary_run_log (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.salary_employees(id) on delete cascade,
  month text not null,
  action text not null check (action in ('generate','reopen')),
  reason text,
  amount numeric(12,2),
  by_email text,
  at timestamptz not null default now()
);
revoke all on public.salary_runs, public.salary_run_log from anon;
grant select, insert, update, delete on public.salary_runs to authenticated;
grant select, insert on public.salary_run_log to authenticated;
grant all on public.salary_runs, public.salary_run_log to service_role;
revoke truncate, trigger, references on public.salary_runs, public.salary_run_log from authenticated;
alter table public.salary_runs enable row level security;
alter table public.salary_run_log enable row level security;
create policy "salary_runs_admin_all" on public.salary_runs for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "salary_run_log_admin_select" on public.salary_run_log for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "salary_run_log_admin_insert" on public.salary_run_log for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
