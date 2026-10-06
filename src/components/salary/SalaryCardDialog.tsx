import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  calcMonth, fmtHM, fmtHMZero, type DayResult, type SalarySettings, type TimeOverride,
} from '@/lib/salaryCalc';
import {
  useSalaryEdits, useSaveTimeEdit, type SalaryEmployee, type SalaryPayment, type SalaryAdvance,
} from '@/hooks/useSalary';

const inr = (v: number) => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const dayLabel = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const hoursStr = (min: number) => String(Math.round((min / 60) * 100) / 100);

interface Props {
  employee: SalaryEmployee;
  month: string;
  settings: SalarySettings;
  punchesByDate: Record<string, string[]>;
  overridesByDate: Record<string, TimeOverride>;
  holidays: Record<string, string>;
  payment?: SalaryPayment;
  advances?: SalaryAdvance[];
  onManageAdvances?: () => void;
  onClose: () => void;
  onMarkPaid: () => void;
  onUndoPaid: () => void;
}

type EditTarget = { day: DayResult; field: 'in' | 'out' };

const Tile: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`rounded-md border p-2.5 ${strong ? 'bg-primary/5 border-primary/30' : ''}`}>
    <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
    <div className={`${strong ? 'text-lg' : 'text-base'} font-semibold mt-0.5`}>{value}</div>
  </div>
);

const SalaryCardDialog: React.FC<Props> = ({
  employee, month, settings, punchesByDate, overridesByDate, holidays, payment, advances = [], onManageAdvances, onClose, onMarkPaid, onUndoPaid,
}) => {
  const summary = useMemo(
    () => calcMonth({ month, punchesByDate, overridesByDate, holidays }, settings),
    [month, punchesByDate, overridesByDate, holidays, settings],
  );
  const { data: edits = [] } = useSalaryEdits(employee.id, month);
  const saveEdit = useSaveTimeEdit();
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  const openEdit = (day: DayResult, field: 'in' | 'out') => {
    setTarget({ day, field });
    setValue((field === 'in' ? day.inTime : day.outTime) || '');
    setReason('');
  };

  const submit = async (reset: boolean) => {
    if (!target) return;
    const { day, field } = target;
    if (!reason.trim()) { toast.error('Please give a reason for this change.'); return; }
    const machine = field === 'in' ? day.machineIn : day.machineOut;
    const oldValue = field === 'in' ? day.inTime : day.outTime;
    const newValue = reset ? machine : (value || null);
    if (!reset && newValue === oldValue) { toast.info('Nothing changed.'); return; }
    try {
      await saveEdit.mutateAsync({
        employeeId: employee.id, date: day.date, field, oldValue, newValue, machineValue: machine,
        reason, reset, current: overridesByDate[day.date],
      });
      toast.success(reset ? 'Reset to the machine value.' : 'Time updated and logged.');
      setTarget(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the change.');
    }
  };

  const advanceTotal = advances.reduce((a, x) => a + x.amount, 0);
  const netPayable = summary.salary - advanceTotal;
  const paidDiffers = payment && payment.amount !== netPayable;

  const timeCell = (day: DayResult, field: 'in' | 'out') => {
    const t = field === 'in' ? day.inTime : day.outTime;
    const edited = field === 'in' ? day.inEdited : day.outEdited;
    const machine = field === 'in' ? day.machineIn : day.machineOut;
    return (
      <button
        type="button"
        onClick={() => openEdit(day, field)}
        className={`group inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent ${edited ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}`}
        title={edited ? `Edited. Machine value: ${machine || 'none'}` : 'Click to edit'}
      >
        <span className="tabular-nums">{t || '--:--'}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  };

  const rowFor = (day: DayResult) => {
    const noTimes = !day.inTime && !day.outTime;
    const flagIcon = day.flags.length > 0 && (
      <Tooltip>
        <TooltipTrigger asChild><AlertTriangle className="h-4 w-4 text-amber-500 inline" /></TooltipTrigger>
        <TooltipContent><div className="space-y-0.5">{day.flags.map(f => <div key={f}>{f}</div>)}
          {day.rawPunches.length > 0 && <div className="text-xs opacity-80">Machine punches: {day.rawPunches.join(', ')}</div>}</div></TooltipContent>
      </Tooltip>
    );
    const base = 'text-sm';
    if (day.status === 'Holiday' && noTimes) {
      return (
        <TableRow key={day.date} className="bg-muted/40">
          <TableCell className={base}>{dayLabel(day.date)}</TableCell>
          <TableCell className={base}>{day.dow}</TableCell>
          <TableCell colSpan={3} className="text-center text-muted-foreground font-medium">H / Holiday{day.holidayName && day.holidayName !== 'Sunday' ? ` (${day.holidayName})` : ''}</TableCell>
          <TableCell className="text-center">
            <button className="text-xs text-muted-foreground hover:underline" onClick={() => openEdit(day, 'in')}>add time</button>
          </TableCell>
        </TableRow>
      );
    }
    if (day.status === 'Absent' && noTimes) {
      return (
        <TableRow key={day.date} className="bg-muted/40">
          <TableCell className={base}>{dayLabel(day.date)}</TableCell>
          <TableCell className={base}>{day.dow}</TableCell>
          <TableCell colSpan={3} className="text-center text-muted-foreground font-medium">A / Absent</TableCell>
          <TableCell className="text-center">
            <button className="text-xs text-muted-foreground hover:underline" onClick={() => openEdit(day, 'in')}>add time</button>
          </TableCell>
        </TableRow>
      );
    }
    return (
      <TableRow key={day.date} className={day.status === 'Absent' ? 'bg-destructive/5' : day.status === 'Holiday' ? 'bg-muted/40' : ''}>
        <TableCell className={base}>{dayLabel(day.date)} {flagIcon}</TableCell>
        <TableCell className={base}>{day.dow}</TableCell>
        <TableCell className="text-center">{timeCell(day, 'in')}</TableCell>
        <TableCell className="text-center">{timeCell(day, 'out')}</TableCell>
        <TableCell className="text-center">
          {day.status === 'Absent' ? <span className="text-destructive font-medium">A / Absent</span>
            : day.status === 'Holiday' ? <span className="text-muted-foreground font-medium">H / Holiday</span>
            : hoursStr(day.regularMin)}
        </TableCell>
        <TableCell className="text-center tabular-nums">{fmtHM(day.otMin)}</TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendance / Salary Card: {employee.name}</DialogTitle>
            <DialogDescription>{monthLabel(month)}. Click an In or Out time to correct it; every change is logged.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Monthly Salary" value={inr(settings.monthlySalary)} />
            <Tile label="Working Hours (per day)" value={String(settings.workingHours)} />
            <Tile label="Total Days Present (incl. paid holidays)" value={String(summary.daysPresent)} />
            <Tile label="Total Overtime" value={fmtHMZero(summary.otMin)} />
            <Tile label="Regular Hours Worked (excl. holidays)" value={hoursStr(summary.regularMin)} />
            <Tile label="Holiday Hours (paid)" value={hoursStr(summary.holidayMin)} />
            <Tile label="Total Paid Hours" value={summary.paidHours.toFixed(2)} />
            <Tile label="Total Salary Calculated" value={inr(summary.salary)} />
            <Tile label="Salary Advance (this month)" value={inr(advanceTotal)} />
            <Tile label="Net Payable (salary - advance)" value={inr(netPayable)} strong />
          </div>
          <div className="text-xs text-muted-foreground">
            Salary = monthly salary / ({summary.daysInMonth} days x {settings.workingHours} hrs) x total paid hours
            (hourly rate {summary.hourlyRate.toFixed(2)}). Overtime is paid at the same rate.
            {payment && (
              <span className={paidDiffers ? ' text-amber-600 font-medium' : ''}>
                {' '}Paid {inr(payment.amount)} on {dayLabel(payment.paid_on)}
                {paidDiffers ? ` (the net payable is now ${inr(netPayable)}, a difference of ${inr(netPayable - payment.amount)})` : ''}.
              </span>
            )}
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-center">In Time</TableHead>
                  <TableHead className="text-center">Out Time</TableHead>
                  <TableHead className="text-center">Hours Worked</TableHead>
                  <TableHead className="text-center">Overtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{summary.days.map(rowFor)}</TableBody>
            </Table>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-1">Edit history ({edits.length})</h4>
            {edits.length === 0 ? (
              <p className="text-xs text-muted-foreground">No manual changes were made to this card.</p>
            ) : (
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto text-xs">
                {edits.map(e => (
                  <div key={e.id} className="p-2">
                    <div>
                      <b>{dayLabel(e.work_date)}</b>, {e.field === 'in' ? 'In' : 'Out'} time:{' '}
                      <span className="line-through">{e.old_value || 'none'}</span> to <b>{e.new_value || 'none'}</b>
                      {e.machine_value && <span className="text-muted-foreground"> (machine: {e.machine_value})</span>}
                    </div>
                    <div className="text-muted-foreground">
                      Reason: {e.reason}. By {e.edited_by_email || 'unknown'} on {new Date(e.edited_at).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {payment
              ? <Button variant="outline" onClick={onUndoPaid}>Undo "Paid"</Button>
              : <Button onClick={onMarkPaid}>Mark as paid ({inr(netPayable)})</Button>}
            {onManageAdvances && <Button variant="outline" onClick={onManageAdvances}>Salary advances ({advances.length})</Button>}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!target} onOpenChange={o => { if (!o) setTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit {target?.field === 'in' ? 'In' : 'Out'} time</DialogTitle>
            <DialogDescription>
              {employee.name}, {target ? dayLabel(target.day.date) : ''}.
              {target && (target.field === 'in' ? target.day.machineIn : target.day.machineOut)
                ? ` Machine recorded ${target.field === 'in' ? target.day.machineIn : target.day.machineOut}.`
                : ' The machine recorded nothing for this.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-time">{target?.field === 'in' ? 'In' : 'Out'} time (leave empty to clear)</Label>
              <Input id="edit-time" type="time" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-reason">Reason (required, saved in the log)</Label>
              <Textarea id="edit-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. forgot to punch out, left at 6 pm as told by manager" rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {target && (target.field === 'in' ? target.day.inEdited : target.day.outEdited) && (
              <Button variant="outline" onClick={() => submit(true)} disabled={saveEdit.isPending}>Reset to machine</Button>
            )}
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => submit(false)} disabled={saveEdit.isPending}>Save change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SalaryCardDialog;
