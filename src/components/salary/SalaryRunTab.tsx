import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarCheck, FileSpreadsheet, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SalaryCardDialog from '@/components/salary/SalaryCardDialog';
import RulesHelp from '@/components/salary/RulesHelp';
import { advanceBalanceFor, inr, monthLabel, settingsOf, today, type Recovery } from '@/components/salary/common';
import { calcMonth, daysInMonthOf, fmtHMZero, type TimeOverride } from '@/lib/salaryCalc';
import {
  useGenerateSalary, useMarkSalaryPaid, useReopenSalary, useUnmarkSalaryPaid,
  type SalaryAdvance, type SalaryEmployee, type SalaryPayment, type SalaryRun,
} from '@/hooks/useSalary';

interface Props {
  month: string;
  employees: SalaryEmployee[];
  punches: Record<string, Record<string, string[]>>;
  overrides: Record<string, Record<string, TimeOverride>>;
  holidays: Record<string, string>; // confirmed holidays, all years
  payments: Record<string, SalaryPayment>;
  runs: Record<string, SalaryRun>;
  advances: SalaryAdvance[];
  recoveries: Recovery[];
  goTo: (tab: string) => void;
}

const SalaryRunTab: React.FC<Props> = ({ month, employees, punches, overrides, holidays, payments, runs, advances, recoveries, goTo }) => {
  const generate = useGenerateSalary();
  const reopen = useReopenSalary();
  const markPaid = useMarkSalaryPaid();
  const unmarkPaid = useUnmarkSalaryPaid();

  const [showAll, setShowAll] = useState(false);
  const [recovery, setRecovery] = useState<Record<string, string>>({}); // employeeId -> typed amount (overrides the prefill)
  const [cardEmpId, setCardEmpId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [payEmp, setPayEmp] = useState<{ emp: SalaryEmployee; amount: number } | null>(null);
  const [payForm, setPayForm] = useState({ paidOn: today(), remarks: '' });
  const [reopenEmp, setReopenEmp] = useState<SalaryEmployee | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonthOf(month)).padStart(2, '0')}`;
  const monthHolidays = useMemo(
    () => Object.fromEntries(Object.entries(holidays).filter(([d]) => d >= monthStart && d <= monthEnd)),
    [holidays, monthStart, monthEnd],
  );

  const rows = useMemo(() => {
    return employees
      .filter(e => {
        if (Object.keys(punches[e.id] || {}).length > 0 || runs[e.id]) return true;
        // fixed-salary people are always listed while they work (no attendance needed)
        if (e.pay_type === 'fixed' && (e.is_active || (e.left_on != null && e.left_on >= monthStart))) return true;
        // "show all" lists people still working, or who left during/after this month
        return showAll && (e.is_active || (e.left_on != null && e.left_on >= monthStart));
      })
      .map(e => {
        const run = runs[e.id];
        const fixed = run ? run.pay_type === 'fixed' : e.pay_type === 'fixed';
        const liveSettings = fixed ? (e.monthly_salary != null ? { monthlySalary: e.monthly_salary, workingHours: 0, lunchIncluded: false } : null) : settingsOf(e);
        // A generated month always uses the settings and holidays it was generated with.
        const s = run ? { monthlySalary: run.monthly_salary, workingHours: run.working_hours, lunchIncluded: run.lunch_included } : liveSettings;
        const hol = run ? run.holidays : holidays;
        const summary = s && !fixed
          ? calcMonth({ month, punchesByDate: punches[e.id] || {}, overridesByDate: overrides[e.id] || {}, holidays: hol }, s)
          : null;
        const balance = run ? run.advance_balance_before : advanceBalanceFor(e.id, month, advances, recoveries);
        const amount: number | null = fixed ? (s ? s.monthlySalary : null) : summary ? summary.salary : null;
        const maxRecover = amount != null ? Math.max(0, Math.min(balance, amount)) : 0;
        const typed = recovery[e.id];
        const recover = run ? run.advance_recovered
          : amount != null ? (typed === undefined ? maxRecover : Math.min(Math.max(Number(typed) || 0, 0), maxRecover)) : 0;
        const review = summary ? summary.days.filter(d => d.flags.length > 0 && d.status !== 'Holiday').length : 0;
        return { e, run, s, summary, fixed, amount, balance, maxRecover, recover, net: amount != null ? amount - recover : 0, review, payment: payments[e.id] };
      });
  }, [employees, punches, overrides, holidays, runs, advances, recoveries, recovery, payments, month, showAll, monthStart]);

  const pending = rows.filter(r => !r.run && r.amount != null);
  const missing = rows.filter(r => r.amount == null);

  const totals = useMemo(() => {
    let salary = 0, rec = 0, net = 0, paid = 0;
    rows.forEach(r => {
      if (r.amount == null) return;
      salary += r.amount; rec += r.recover; net += r.net;
      if (r.payment) paid += r.payment.amount;
    });
    return { salary, rec, net, paid, due: net - paid };
  }, [rows]);

  const invalidTyped = rows.find(r => !r.run && r.amount != null && recovery[r.e.id] !== undefined && Number(recovery[r.e.id]) > r.maxRecover + 0.001);

  const doGenerate = async () => {
    try {
      await generate.mutateAsync(pending.map(r => ({
        employee_id: r.e.id, month,
        pay_type: r.fixed ? 'fixed' as const : 'hourly' as const,
        monthly_salary: r.s!.monthlySalary, working_hours: r.s!.workingHours, lunch_included: r.s!.lunchIncluded,
        holidays: r.fixed ? {} : monthHolidays,
        days_present: r.summary ? r.summary.daysPresent : 0, overtime_minutes: r.summary ? r.summary.otMin : 0,
        paid_hours: r.summary ? Math.round(r.summary.paidHours * 100) / 100 : 0,
        salary: r.amount!, advance_balance_before: r.balance, advance_recovered: r.recover,
        net_payable: r.net,
      })));
      toast.success(`Salary generated for ${pending.length} employee(s).`);
      setConfirmOpen(false);
      setRecovery({});
    } catch (err: any) { toast.error(err?.message || 'Could not generate salary.'); }
  };

  const confirmPay = async () => {
    if (!payEmp) return;
    try {
      await markPaid.mutateAsync({ employeeId: payEmp.emp.id, month, amount: payEmp.amount, paidOn: payForm.paidOn, remarks: payForm.remarks });
      toast.success(`${payEmp.emp.name} marked as paid.`);
      setPayEmp(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const undoPaid = async (e: SalaryEmployee) => {
    if (!window.confirm(`Mark ${e.name}'s ${monthLabel(month)} salary as not paid?`)) return;
    try { await unmarkPaid.mutateAsync({ employeeId: e.id, month }); toast.success('Marked as yet to be paid.'); }
    catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const doReopen = async () => {
    if (!reopenEmp) return;
    if (!reopenReason.trim()) { toast.error('Please give a reason.'); return; }
    const run = runs[reopenEmp.id];
    try {
      await reopen.mutateAsync({ employeeId: reopenEmp.id, month, reason: reopenReason, amount: run?.net_payable ?? 0 });
      toast.success(`${reopenEmp.name}'s ${monthLabel(month)} salary reopened.`);
      setReopenEmp(null); setReopenReason('');
    } catch (err: any) { toast.error(err?.message || 'Could not reopen.'); }
  };

  const card = rows.find(r => r.e.id === cardEmpId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showAll} onCheckedChange={setShowAll} id="show-all" />
          <Label htmlFor="show-all" className="font-normal">Also show working employees with no attendance in {monthLabel(month)}</Label>
        </div>
        <Button disabled={pending.length === 0 || generate.isPending || !!invalidTyped} onClick={() => setConfirmOpen(true)}>
          <CalendarCheck className="h-4 w-4 mr-1" />Generate salary for {monthLabel(month)} ({pending.length})
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {missing.length} employee(s) have no salary or working hours set, so no salary can be made for them:
          <span className="font-medium">{missing.map(r => r.e.name).join(', ')}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => goTo('employees')}>Open Employees</Button>
        </div>
      )}

      {employees.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-50" />
          Upload the attendance sheet from the thumb-print machine to begin. Every employee in the sheet is added automatically.
          <div className="mt-3"><Button onClick={() => goTo('upload')}>Go to Upload</Button></div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Monthly Salary</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Days Present</TableHead>
                <TableHead className="text-right">Overtime</TableHead>
                <TableHead className="text-right">Paid Hours</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead className="text-right">Advance Balance</TableHead>
                <TableHead className="text-right">Recover Now</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  No attendance for {monthLabel(month)}. Upload that month's sheet, or pick another month.
                </TableCell></TableRow>
              )}
              {rows.map(({ e, run, s, summary, fixed, amount, balance, maxRecover, recover, net, review, payment }) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.name}{!e.is_active && <Badge variant="secondary" className="ml-2">Left</Badge>}</div>
                    <div className="text-xs text-muted-foreground">Machine no. {e.machine_no}{fixed && <Badge variant="secondary" className="ml-2">Fixed salary</Badge>}</div>
                    {review > 0 && !run && <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{review} day(s) to review</div>}
                  </TableCell>
                  <TableCell className="text-right">{s ? inr(s.monthlySalary) : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-right">{fixed || !s ? <span className="text-muted-foreground">-</span> : s.workingHours}</TableCell>
                  {amount != null ? (
                    <>
                      <TableCell className="text-right">{summary ? summary.daysPresent : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right">{summary ? fmtHMZero(summary.otMin) : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right">{summary ? summary.paidHours.toFixed(2) : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right">{inr(amount)}</TableCell>
                      <TableCell className="text-right">{balance > 0 ? inr(balance) : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right">
                        {run ? (recover > 0 ? inr(recover) : <span className="text-muted-foreground">-</span>)
                          : balance > 0 ? (
                            <Input
                              inputMode="decimal" className="h-8 w-24 ml-auto text-right"
                              value={recovery[e.id] ?? String(maxRecover)}
                              onChange={ev => setRecovery({ ...recovery, [e.id]: ev.target.value })}
                              title={`Up to ${inr(maxRecover)} (advance balance or salary, whichever is smaller)`}
                            />
                          ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{inr(net)}</TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={7} className="text-center">
                      <Button variant="outline" size="sm" onClick={() => goTo('employees')}>Set salary and working hours</Button>
                    </TableCell>
                  )}
                  <TableCell>
                    {amount == null ? <span className="text-muted-foreground text-sm">-</span>
                      : !run ? <Badge variant="outline">Not generated</Badge>
                      : payment ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
                      : <Badge variant="outline" className="text-amber-600 border-amber-400">Generated, yet to be paid</Badge>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="outline" size="sm" disabled={!s || fixed} title={fixed ? 'Fixed salary: no attendance card' : undefined} onClick={() => setCardEmpId(e.id)}>Card</Button>
                    {run && !payment && (
                      <Button variant="ghost" size="sm" className="ml-1" onClick={() => { setPayEmp({ emp: e, amount: run.net_payable }); setPayForm({ paidOn: today(), remarks: '' }); }}>Mark paid</Button>
                    )}
                    {run && payment && <Button variant="ghost" size="sm" className="ml-1" onClick={() => undoPaid(e)}>Undo paid</Button>}
                    {run && !payment && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" title="Reopen (unlock) this salary" onClick={() => { setReopenEmp(e); setReopenReason(''); }}>
                        <Unlock className="h-4 w-4" />
                      </Button>
                    )}
                    {run && <Lock className="h-3.5 w-3.5 inline ml-1 text-muted-foreground" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-right font-semibold">Total ({monthLabel(month)})</TableCell>
                  <TableCell className="text-right font-bold">{inr(totals.salary)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-bold">{inr(totals.rec)}</TableCell>
                  <TableCell className="text-right font-bold">{inr(totals.net)}</TableCell>
                  <TableCell colSpan={2} className="text-xs text-muted-foreground">Paid {inr(totals.paid)}. Yet to be paid {inr(totals.due)}.</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
      {invalidTyped && (
        <p className="text-sm text-destructive">
          {invalidTyped.e.name}: recovery cannot be more than {inr(invalidTyped.maxRecover)} (the advance balance or the salary, whichever is smaller).
        </p>
      )}

      <RulesHelp />

      {card && card.s && (
        <SalaryCardDialog
          employee={card.e}
          month={month}
          settings={card.s}
          punchesByDate={punches[card.e.id] || {}}
          overridesByDate={overrides[card.e.id] || {}}
          holidays={card.run ? card.run.holidays : holidays}
          payment={card.payment}
          advanceRecovered={card.recover}
          locked={!!card.run}
          onClose={() => setCardEmpId(null)}
          onMarkPaid={() => {
            if (!card.run) { toast.info('Generate the salary first, then mark it as paid.'); return; }
            setPayEmp({ emp: card.e, amount: card.run.net_payable }); setPayForm({ paidOn: today(), remarks: '' });
          }}
          onUndoPaid={() => undoPaid(card.e)}
        />
      )}

      {/* Generate */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate salary for {monthLabel(month)}</DialogTitle>
            <DialogDescription>
              This locks each employee's salary, working hours, holidays and advance recovery for this month, so later changes
              to the master list or holidays do not alter it. You can reopen an employee with a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-1">
            <div>Employees: <b>{pending.length}</b></div>
            <div>Total salary: <b>{inr(pending.reduce((t, r) => t + r.amount!, 0))}</b></div>
            <div>Advance recovered: <b>{inr(pending.reduce((t, r) => t + r.recover, 0))}</b></div>
            <div>Net payable: <b>{inr(pending.reduce((t, r) => t + r.net, 0))}</b></div>
            {pending.some(r => r.review > 0) && (
              <div className="text-amber-600 flex items-center gap-1 pt-1"><AlertTriangle className="h-4 w-4" />Some days still need review (flagged in the table). Open the Card to fix them first if needed.</div>
            )}
            {missing.length > 0 && <div className="text-muted-foreground pt-1">{missing.length} employee(s) without salary settings are skipped.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={doGenerate} disabled={generate.isPending}>Generate</Button>
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

      {/* Reopen */}
      <Dialog open={!!reopenEmp} onOpenChange={o => { if (!o) setReopenEmp(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reopen {reopenEmp?.name}'s {monthLabel(month)} salary</DialogTitle>
            <DialogDescription>
              The locked figures are removed so the month can be corrected and generated again. The advance recovery returns to the balance.
              The reason is saved in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason (required)</Label>
            <Textarea rows={3} value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder="e.g. out time was wrong for 12 Aug" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenEmp(null)}>Cancel</Button>
            <Button onClick={doReopen} disabled={reopen.isPending}>Reopen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalaryRunTab;
