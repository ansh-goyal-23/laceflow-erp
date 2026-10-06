import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SalaryRunTab from '@/components/salary/SalaryRunTab';
import EmployeesTab from '@/components/salary/EmployeesTab';
import AdvancesTab from '@/components/salary/AdvancesTab';
import HolidaysTab from '@/components/salary/HolidaysTab';
import AuditTab from '@/components/salary/AuditTab';
import UploadTab from '@/components/salary/UploadTab';
import { monthLabel, prevMonth } from '@/components/salary/common';
import { parseAttendanceWorkbook } from '@/lib/attendanceParser';
import {
  useSalaryEmployees, useSalaryUploadedMonths, useSalaryPunches, useSalaryOverrides, useSalaryHolidays,
  useSalaryPayments, useSalaryRuns, useSalaryAdvanceLedger, useSalaryRecoveries, useUploadAttendance,
} from '@/hooks/useSalary';

const SalaryGeneration: React.FC = () => {
  const { data: employees = [], isLoading, error } = useSalaryEmployees();
  const { data: uploadedMonths = [] } = useSalaryUploadedMonths();
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const [tab, setTab] = useState('run');
  const month = monthPick || uploadedMonths[0] || prevMonth();

  const { data: punches = {} } = useSalaryPunches(month);
  const { data: overrides = {} } = useSalaryOverrides(month);
  const { data: holidayRows = [] } = useSalaryHolidays();
  const { data: payments = {} } = useSalaryPayments(month);
  const { data: runs = {} } = useSalaryRuns(month);
  const { data: advances = [] } = useSalaryAdvanceLedger();
  const { data: recoveries = [] } = useSalaryRecoveries();
  const upload = useUploadAttendance();

  // Only holidays with a confirmed date count in salary; Sundays are automatic.
  const holidays = useMemo(
    () => Object.fromEntries(holidayRows.filter(h => h.confirmed).map(h => [h.holiday_date, h.name])),
    [holidayRows],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseAttendanceWorkbook(await file.arrayBuffer());
      if (uploadedMonths.includes(parsed.month) &&
          !window.confirm(`Attendance for ${monthLabel(parsed.month)} is already uploaded. Replace the machine punches for that month? (Manual edits and payments are kept.)`)) return;
      const res = await upload.mutateAsync({ parsed, fileName: file.name });
      setMonthPick(res.month);
      toast.success(`${monthLabel(res.month)} uploaded: ${res.withPunches} employees with attendance, ${res.added} new employee(s) added.`);
      if (res.added > 0) { toast.info('New employees were added to the master list. Set their salary and working hours.'); setTab('employees'); }
      else setTab('run');
    } catch (err: any) {
      toast.error(err?.message || 'Could not read this file.');
    }
  };

  if (error) {
    return <div className="p-6 text-destructive">Could not load salary data: {(error as any).message}. This page needs the salary tables (see docs/salary-generation.sql) and an admin login.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Salary Generation</h1>
          <p className="text-sm text-muted-foreground">
            Upload the thumb-print attendance sheet, keep the master employee list, and generate each month's salary. Salary for a month is normally paid on the 10th of the next month.
          </p>
        </div>
        {(tab === 'run') && (
          <div>
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={e => e.target.value && setMonthPick(e.target.value)} className="w-40" />
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="run">Salary Run</TabsTrigger>
          <TabsTrigger value="upload">Upload Attendance</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {isLoading ? <div className="p-6 text-muted-foreground">Loading...</div> : (
          <>
            <TabsContent value="run" className="mt-4">
              <SalaryRunTab
                month={month} employees={employees} punches={punches} overrides={overrides} holidays={holidays}
                payments={payments} runs={runs} advances={advances} recoveries={recoveries} goTo={setTab}
              />
            </TabsContent>
            <TabsContent value="upload" className="mt-4"><UploadTab onFile={onFile} busy={upload.isPending} /></TabsContent>
            <TabsContent value="employees" className="mt-4"><EmployeesTab employees={employees} /></TabsContent>
            <TabsContent value="advances" className="mt-4"><AdvancesTab employees={employees} advances={advances} recoveries={recoveries} /></TabsContent>
            <TabsContent value="holidays" className="mt-4"><HolidaysTab holidays={holidayRows} /></TabsContent>
            <TabsContent value="audit" className="mt-4"><AuditTab employees={employees} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default SalaryGeneration;
