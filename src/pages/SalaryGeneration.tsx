import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, FileSpreadsheet, Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SalaryCardDialog, { monthLabel } from '@/components/salary/SalaryCardDialog';
import { parseAttendanceWorkbook } from '@/lib/attendanceParser';
import { calcMonth, fmtHMZero, type MonthSummary, type SalarySettings } from '@/lib/salaryCalc';
import {
  useSalaryEmployees, useSalaryUploadedMonths, useSalaryPunches, useSalaryOverrides, useSalaryHolidays,
  useSalaryPayments, useUpdateSalaryEmployee, useUploadAttendance, useMarkSalaryPaid, useUnmarkSalaryPaid,
  useSaveHoliday, useDeleteHoliday, useSalaryAdvances, useAddSalaryAdvance, useDeleteSalaryAdvance, type SalaryEmployee,
} from '@/hooks/useSalary';

const inr = (v: number) => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const prevMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const settingsOf = (e: SalaryEmployee): SalarySettings | null =>
  e.monthly_salary != null && e.working_hours ? {
    monthlySalary: e.monthly_salary, workingHours: e.working_hours, lunchIncluded: e.lunch_included,
  } : null;

const SalaryGeneration: React.FC = () => {
  const { data: employees = [], isLoading: loadingEmp, error: empErr } = useSalaryEmployees();
  const { data: uploadedMonths = [] } = useSalaryUploadedMonths();
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const month = monthPick || uploadedMonths[0] || prevMonth();

  const { data: punches = {} } = useSalaryPunches(month);
  const { data: overrides = {} } = useSalaryOverrides(month);
  const { data: holidayRows = [] } = useSalaryHolidays();
  const { data: payments = {} } = useSalaryPayments(month);
  const { data: advancesBy = {} } = useSalaryAdvances(month);
  const addAdvance = useAddSalaryAdvance();
  const deleteAdvance = useDeleteSalaryAdvance();
  const holidays = useMemo(() => Object.fromEntries(holidayRows.map(h => [h.holiday_date, h.name])), [holidayRows]);

  const upload = useUploadAttendance();
  const updateEmp = useUpdateSalaryEmployee();
  const markPaid = useMarkSalaryPaid();
  const unmarkPaid = useUnmarkSalaryPaid();
  const saveHoliday = useSaveHoliday();
  const deleteHoliday = useDeleteHoliday();

  const fileRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [cardEmpId, setCardEmpId] = useState<string | null>(null);
  const [settingsEmp, setSettingsEmp] = useState<SalaryEmployee | null>(null);
  const [form, setForm] = useState({ salary: '', hours: '', lunchIncluded: false, active: true });
  const [payEmp, setPayEmp] = useState<{ emp: SalaryEmployee; amount: number } | null>(null);
  const [payForm, setPayForm] = useState({ paidOn: today(), remarks: '' });
  const [advEmpId, setAdvEmpId] = useState<string | null>(null);
  const [advForm, setAdvForm] = useState({ amount: '', givenOn: today(), note: '' });
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const rows = useMemo(() => {
    return employees
      .filter(e => showAll || Object.keys(punches[e.id] || {}).length > 0)
      .map(e => {
        const s = settingsOf(e);
        const summary: MonthSummary | null = s
          ? calcMonth({ month, punchesByDate: punches[e.id] || {}, overridesByDate: overrides[e.id] || {}, holidays }, s)
          : null;
        const advance = (advancesBy[e.id] || []).reduce((a, x) => a + x.amount, 0);
        return { e, s, summary, payment: payments[e.id], advance };
      });
  }, [employees, punches, overrides, holidays, payments, advancesBy, month, showAll]);

  const totals = useMemo(() => {
    let salary = 0, advance = 0, net = 0, paid = 0, due = 0, missing = 0;
    rows.forEach(r => {
      if (!r.summary) { missing++; return; }
      const n = r.summary.salary - r.advance;
      salary += r.summary.salary; advance += r.advance; net += n;
      if (r.payment) paid += r.payment.amount; else due += n;
    });
    return { salary, advance, net, paid, due, missing };
  }, [rows]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseAttendanceWorkbook(await file.arrayBuffer());
      if (uploadedMonths.includes(parsed.month) &&
          !window.confirm(`Attendance for ${monthLabel(parsed.month)} is already uploaded. Replace the machine punches for that month? (Manual edits and payments are kept.)`)) return;
      const res = await upload.mutateAsync({ parsed, fileName: file.name });
      setMonthPick(res.month);
      toast.success(`${monthLabel(res.month)} uploaded: ${res.withPunches} employees with attendance, ${res.added} new employee(s) added.`);
      if (res.added > 0) toast.info('Set salary and working hours for the new employees to see their salary.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not read this file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openSettings = (e: SalaryEmployee) => {
    setSettingsEmp(e);
    setForm({
      salary: e.monthly_salary == null ? '' : String(e.monthly_salary),
      hours: e.working_hours == null ? '' : String(e.working_hours),
      lunchIncluded: e.lunch_included,
      active: e.is_active,
    });
  };

  const saveSettings = async () => {
    if (!settingsEmp) return;
    const salary = form.salary.trim() === '' ? null : Number(form.salary);
    const hours = form.hours.trim() === '' ? null : Number(form.hours);
    if (salary != null && (!Number.isFinite(salary) || salary < 0)) { toast.error('Enter a valid monthly salary.'); return; }
    if (hours != null && (!Number.isFinite(hours) || hours <= 0 || hours > 24)) { toast.error('Working hours must be between 0 and 24.'); return; }
    try {
      await updateEmp.mutateAsync({
        id: settingsEmp.id, monthly_salary: salary, working_hours: hours,
        lunch_included: form.lunchIncluded, is_active: form.active,
      });
      toast.success('Saved.');
      setSettingsEmp(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const confirmPay = async () => {
    if (!payEmp) return;
    try {
      await markPaid.mutateAsync({
        employeeId: payEmp.emp.id, month, amount: payEmp.amount, paidOn: payForm.paidOn, remarks: payForm.remarks,
      });
      toast.success(`${payEmp.emp.name} marked as paid.`);
      setPayEmp(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const undoPaid = async (e: SalaryEmployee) => {
    if (!window.confirm(`Mark ${e.name}'s ${monthLabel(month)} salary as not paid?`)) return;
    try { await unmarkPaid.mutateAsync({ employeeId: e.id, month }); toast.success('Marked as yet to be paid.'); }
    catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const cardRow = rows.find(r => r.e.id === cardEmpId) || (cardEmpId ? { e: employees.find(x => x.id === cardEmpId)!, s: settingsOf(employees.find(x => x.id === cardEmpId)!), payment: payments[cardEmpId] } : null);

  if (empErr) {
    return <div className="p-6 text-destructive">Could not load salary data: {(empErr as any).message}. This page needs the salary tables (see sql_migrations/20261006_salary_generation*.sql) and an admin login.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Salary Generation</h1>
          <p className="text-sm text-muted-foreground">
            Upload the thumb-print attendance sheet, set each worker's salary and hours, and review the month's salaries.
            Salary for a month is normally paid on the 10th of the next month.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={e => e.target.value && setMonthPick(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={() => setHolidaysOpen(true)}><CalendarDays className="h-4 w-4 mr-1" />Holidays</Button>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload attendance sheet
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Switch checked={showAll} onCheckedChange={setShowAll} id="show-all" />
        <Label htmlFor="show-all" className="font-normal">Also show employees with no attendance in {monthLabel(month)}</Label>
      </div>

      {loadingEmp ? (
        <div className="p-6 text-muted-foreground">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-50" />
          Upload the attendance sheet from the thumb-print machine to begin. Every employee in the sheet is added automatically.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Monthly Salary</TableHead>
                <TableHead className="text-right">Working Hours</TableHead>
                <TableHead className="text-right">Days Present</TableHead>
                <TableHead className="text-right">Total Overtime</TableHead>
                <TableHead className="text-right">Total Paid Hours</TableHead>
                <TableHead className="text-right">Salary Calculated</TableHead>
                <TableHead className="text-right">Advance</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Card</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No attendance for {monthLabel(month)}. Upload that month's sheet, or pick another month.
                </TableCell></TableRow>
              )}
              {rows.map(({ e, s, summary, payment, advance }) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium">{e.name}{!e.is_active && <Badge variant="secondary" className="ml-2">Left</Badge>}</div>
                        <div className="text-xs text-muted-foreground">Machine no. {e.machine_no}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSettings(e)} title="Edit salary and working hours">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{e.monthly_salary != null ? inr(e.monthly_salary) : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-right">{e.working_hours ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  {summary ? (
                    <>
                      <TableCell className="text-right">{summary.daysPresent}</TableCell>
                      <TableCell className="text-right">{fmtHMZero(summary.otMin)}</TableCell>
                      <TableCell className="text-right">{summary.paidHours.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{inr(summary.salary)}</TableCell>
                      <TableCell className="text-right">
                        <button className="underline-offset-2 hover:underline" title="Add or view salary advances" onClick={() => { setAdvEmpId(e.id); setAdvForm({ amount: '', givenOn: today(), note: '' }); }}>
                          {advance > 0 ? inr(advance) : <span className="text-muted-foreground">+ Add</span>}
                        </button>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{inr(summary.salary - advance)}</TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={6} className="text-center">
                      <Button variant="outline" size="sm" onClick={() => openSettings(e)}>Set salary and working hours</Button>
                    </TableCell>
                  )}
                  <TableCell>
                    {!summary ? <span className="text-muted-foreground text-sm">-</span>
                      : payment ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
                          {payment.amount !== summary.salary - advance && (
                            <Badge variant="outline" className="text-amber-600 border-amber-400" title={`Paid ${inr(payment.amount)}, payable now ${inr(summary.salary - advance)}`}>Changed since paid</Badge>
                          )}
                          <button className="text-xs text-muted-foreground hover:underline" onClick={() => undoPaid(e)}>undo</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-amber-600 border-amber-400">Yet to be paid</Badge>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setPayEmp({ emp: e, amount: summary.salary - advance }); setPayForm({ paidOn: today(), remarks: '' }); }}>Mark paid</Button>
                        </div>
                      )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled={!s} onClick={() => setCardEmpId(e.id)}>View card</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-right font-semibold">Total ({monthLabel(month)})</TableCell>
                  <TableCell className="text-right font-bold">{inr(totals.salary)}</TableCell>
                  <TableCell className="text-right font-bold">{inr(totals.advance)}</TableCell>
                  <TableCell className="text-right font-bold">{inr(totals.net)}</TableCell>
                  <TableCell colSpan={2} className="text-xs text-muted-foreground">
                    Paid {inr(totals.paid)}. Yet to be paid {inr(totals.due)}.
                    {totals.missing > 0 && ` ${totals.missing} employee(s) have no salary set.`}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}

      {cardRow && cardRow.s && (
        <SalaryCardDialog
          employee={cardRow.e}
          month={month}
          settings={cardRow.s}
          punchesByDate={punches[cardRow.e.id] || {}}
          overridesByDate={overrides[cardRow.e.id] || {}}
          holidays={holidays}
          payment={payments[cardRow.e.id]}
          advances={advancesBy[cardRow.e.id] || []}
          onManageAdvances={() => { setAdvEmpId(cardRow.e.id); setAdvForm({ amount: '', givenOn: today(), note: '' }); }}
          onClose={() => setCardEmpId(null)}
          onMarkPaid={() => {
            const sm = calcMonth({ month, punchesByDate: punches[cardRow.e.id] || {}, overridesByDate: overrides[cardRow.e.id] || {}, holidays }, cardRow.s!);
            setPayEmp({ emp: cardRow.e, amount: sm.salary - (advancesBy[cardRow.e.id] || []).reduce((a, x) => a + x.amount, 0) }); setPayForm({ paidOn: today(), remarks: '' });
          }}
          onUndoPaid={() => undoPaid(cardRow.e)}
        />
      )}

      {/* Salary / working hours */}
      <Dialog open={!!settingsEmp} onOpenChange={o => { if (!o) setSettingsEmp(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{settingsEmp?.name}: salary and working hours</DialogTitle>
            <DialogDescription>These apply to every month's calculation. Changing them recalculates all months that are not yet marked paid (paid months keep the amount that was paid).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monthly salary (₹)</Label>
              <Input inputMode="decimal" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 12500" />
            </div>
            <div>
              <Label>Working hours per day</Label>
              <Input inputMode="decimal" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="e.g. 8, 10 or 12" />
            </div>
            <div className="flex items-start gap-2">
              <Switch checked={form.lunchIncluded} onCheckedChange={v => setForm({ ...form, lunchIncluded: v })} id="lunch" />
              <Label htmlFor="lunch" className="font-normal text-sm leading-snug">
                Lunch is included in the working hours (use for 10 and 12 hour workers).
                Leave off for 8 hour workers, whose 30 minute lunch is extra and unpaid.
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} id="active" />
              <Label htmlFor="active" className="font-normal text-sm">Currently working (turn off if this person has left)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsEmp(null)}>Cancel</Button>
            <Button onClick={saveSettings} disabled={updateEmp.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid */}
      <Dialog open={!!payEmp} onOpenChange={o => { if (!o) setPayEmp(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark salary as paid</DialogTitle>
            <DialogDescription>{payEmp?.emp.name}, {monthLabel(month)}: {payEmp ? inr(payEmp.amount) : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Paid on</Label><Input type="date" value={payForm.paidOn} onChange={e => setPayForm({ ...payForm, paidOn: e.target.value })} /></div>
            <div><Label>Remarks (optional)</Label><Input value={payForm.remarks} onChange={e => setPayForm({ ...payForm, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayEmp(null)}>Cancel</Button>
            <Button onClick={confirmPay} disabled={markPaid.isPending}>Confirm paid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary advances */}
      <Dialog open={!!advEmpId} onOpenChange={o => { if (!o) setAdvEmpId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Salary advance: {employees.find(x => x.id === advEmpId)?.name}</DialogTitle>
            <DialogDescription>Advances given against {monthLabel(month)} salary. The total is deducted to give the net payable.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[7rem_9rem_1fr_auto] gap-2 items-end">
            <div><Label className="text-xs">Amount (₹)</Label><Input inputMode="decimal" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })} /></div>
            <div><Label className="text-xs">Given on</Label><Input type="date" value={advForm.givenOn} onChange={e => setAdvForm({ ...advForm, givenOn: e.target.value })} /></div>
            <div><Label className="text-xs">Note</Label><Input value={advForm.note} onChange={e => setAdvForm({ ...advForm, note: e.target.value })} /></div>
            <Button disabled={addAdvance.isPending} onClick={async () => {
              const amt = Number(advForm.amount);
              if (!advEmpId || !Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid advance amount.'); return; }
              if (!advForm.givenOn) { toast.error('Pick the date it was given.'); return; }
              try {
                await addAdvance.mutateAsync({ employeeId: advEmpId, month, amount: amt, givenOn: advForm.givenOn, note: advForm.note });
                setAdvForm({ amount: '', givenOn: today(), note: '' });
              } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
            }}>Add</Button>
          </div>
          <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
            {(advancesBy[advEmpId || ''] || []).length === 0 && <div className="p-3 text-sm text-muted-foreground">No advance for {monthLabel(month)}.</div>}
            {(advancesBy[advEmpId || ''] || []).map(a => (
              <div key={a.id} className="flex items-center justify-between p-2 text-sm">
                <span>{new Date(a.given_on + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}: <b>{inr(a.amount)}</b>{a.note ? ` (${a.note})` : ''}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => {
                  if (!window.confirm('Delete this advance?')) return;
                  try { await deleteAdvance.mutateAsync(a.id); } catch (err: any) { toast.error(err?.message || 'Could not delete.'); }
                }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
          <div className="text-sm font-medium text-right">Total advance: {inr((advancesBy[advEmpId || ''] || []).reduce((a, x) => a + x.amount, 0))}</div>
        </DialogContent>
      </Dialog>

      {/* Holidays */}
      <Dialog open={holidaysOpen} onOpenChange={setHolidaysOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Paid holidays</DialogTitle>
            <DialogDescription>All Sundays are paid holidays automatically. Add the other holidays here (festival dates change every year). A day when workers are asked not to come is not a holiday: it is simply Absent.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })} className="w-40" />
            <Input placeholder="Name (e.g. Holi)" value={newHoliday.name} onChange={e => setNewHoliday({ ...newHoliday, name: e.target.value })} />
            <Button onClick={async () => {
              if (!newHoliday.date || !newHoliday.name.trim()) { toast.error('Enter a date and a name.'); return; }
              try { await saveHoliday.mutateAsync({ holiday_date: newHoliday.date, name: newHoliday.name.trim() }); setNewHoliday({ date: '', name: '' }); }
              catch (err: any) { toast.error(err?.message || 'Could not save.'); }
            }}>Add</Button>
          </div>
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {holidayRows.length === 0 && <div className="p-3 text-sm text-muted-foreground">No holidays added yet.</div>}
            {[...holidayRows].reverse().map(h => (
              <div key={h.holiday_date} className="flex items-center justify-between p-2 text-sm">
                <span>{new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}: {h.name}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteHoliday.mutate(h.holiday_date)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalaryGeneration;
