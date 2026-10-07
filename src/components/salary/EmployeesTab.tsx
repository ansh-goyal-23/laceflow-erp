import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Pencil, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdvanceLedger from '@/components/salary/AdvanceLedger';
import { advanceBalanceNow, dayLabel, inr, shiftLabel, shiftOf, today, type Recovery } from '@/components/salary/common';
import { useUpdateSalaryEmployee, type SalaryAdvance, type SalaryEmployee, type SalaryShift } from '@/hooks/useSalary';

interface Props { employees: SalaryEmployee[]; advances: SalaryAdvance[]; recoveries: Recovery[]; shifts: SalaryShift[] }

const needsSetup = (e: SalaryEmployee) => e.monthly_salary == null || (e.pay_type !== 'fixed' && !e.working_hours);

const EmployeesTab: React.FC<Props> = ({ employees, advances, recoveries, shifts }) => {
  const update = useUpdateSalaryEmployee();
  const [search, setSearch] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [editing, setEditing] = useState<SalaryEmployee | null>(null);
  const [form, setForm] = useState({ salary: '', hours: '', lunchIncluded: false, active: true, leftOn: '', fixed: false, shiftId: '' });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e =>
      (showLeft || e.is_active) &&
      (!q || e.name.toLowerCase().includes(q) || String(e.machine_no).includes(q) || (e.department || '').toLowerCase().includes(q)));
  }, [employees, search, showLeft]);
  const missing = employees.filter(e => e.is_active && needsSetup(e));
  const leftCount = employees.filter(e => !e.is_active).length;

  const open = (e: SalaryEmployee) => {
    setEditing(e);
    setForm({
      salary: e.monthly_salary == null ? '' : String(e.monthly_salary),
      hours: e.working_hours == null ? '' : String(e.working_hours),
      lunchIncluded: e.lunch_included, active: e.is_active, leftOn: e.left_on || '', fixed: e.pay_type === 'fixed',
      shiftId: shiftOf(e, shifts)?.id || '',
    });
  };

  const save = async () => {
    if (!editing) return;
    const salary = form.salary.trim() === '' ? null : Number(form.salary);
    const hours = form.hours.trim() === '' ? null : Number(form.hours);
    if (salary != null && (!Number.isFinite(salary) || salary < 0)) { toast.error('Enter a valid monthly salary.'); return; }
    if (!form.fixed && hours != null && (!Number.isFinite(hours) || hours <= 0 || hours > 24)) { toast.error('Working hours must be between 0 and 24.'); return; }
    if (!form.active && !form.leftOn) { toast.error('Enter this person\'s last working day.'); return; }
    const prevShift = shiftOf(editing, shifts);
    const newShift = shifts.find(s => s.id === form.shiftId) || null;
    // keep the stored value unchanged when the effective shift did not change (null means General)
    const shiftId = newShift && newShift.id === prevShift?.id ? editing.shift_id : (newShift?.id ?? null);
    try {
      await update.mutateAsync({
        previous: editing, shift_id: shiftId, shiftNames: { from: prevShift?.name || 'None', to: newShift?.name || 'None' }, monthly_salary: salary, working_hours: form.fixed ? null : hours,
        lunch_included: form.fixed ? false : form.lunchIncluded,
        is_active: form.active, left_on: form.active ? null : form.leftOn, pay_type: form.fixed ? 'fixed' : 'hourly',
      });
      toast.success('Saved.');
      setEditing(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The master list of everyone on the thumb-print machine. Set each person's monthly salary and working hours once; they are used for every
        month you generate. Choose "Fixed salary" for workers who are paid the same amount every month regardless of attendance. New people appear
        here automatically when an attendance sheet is uploaded. Mark someone as Left and enter their last working day: that month's salary is paid only up to that day, and later months leave them out.
        Changes to a person's details after the first entry are saved in the audit log.
      </p>
      {missing.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />{missing.length} working employee(s) still need salary details.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Search name, machine no. or department" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch id="show-left" checked={showLeft} onCheckedChange={setShowLeft} />
          <Label htmlFor="show-left" className="font-normal">Show employees who have left ({leftCount})</Label>
        </div>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Machine no.</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Pay type</TableHead>
              <TableHead className="text-right">Monthly Salary</TableHead>
              <TableHead className="text-right">Working Hours</TableHead>
              <TableHead className="text-right">Advance Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No employees to show.</TableCell></TableRow>}
            {rows.map(e => {
              const fixed = e.pay_type === 'fixed';
              const bal = advanceBalanceNow(e.id, advances, recoveries).balance;
              return (
                <TableRow key={e.id}>
                  <TableCell>{e.machine_no}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.department || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-sm">{shiftOf(e, shifts)?.name || '-'}</TableCell>
                  <TableCell>{fixed ? <Badge variant="secondary">Fixed salary</Badge> : <span className="text-sm">By attendance</span>}</TableCell>
                  <TableCell className="text-right">{e.monthly_salary != null ? inr(e.monthly_salary) : <Badge variant="outline" className="text-amber-600 border-amber-400">Not set</Badge>}</TableCell>
                  <TableCell className="text-right">{fixed ? <span className="text-muted-foreground">-</span> : e.working_hours ?? <Badge variant="outline" className="text-amber-600 border-amber-400">Not set</Badge>}</TableCell>
                  <TableCell className="text-right">{bal > 0 ? inr(bal) : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell>{e.is_active ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Working</Badge> : <Badge variant="secondary">Left{e.left_on ? `, last day ${dayLabel(e.left_on)}` : ''}</Badge>}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open(e)}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.name}: details</DialogTitle>
            <DialogDescription>
              Used for every month you generate from now on. Months that are already generated keep the values they were generated with.
              Changes after the first entry are saved in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Switch checked={form.fixed} onCheckedChange={v => setForm({ ...form, fixed: v })} id="fixed" />
              <Label htmlFor="fixed" className="font-normal text-sm leading-snug">
                Fixed salary: this person is paid the monthly amount below every month, whatever the attendance. No overtime or deductions.
              </Label>
            </div>
            <div><Label>Monthly salary (₹)</Label><Input inputMode="decimal" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 12500" /></div>
            <div>
              <Label>Shift</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.shiftId} onChange={e => setForm({ ...form, shiftId: e.target.value })}>
                {shifts.map(s => <option key={s.id} value={s.id}>{shiftLabel(s)}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Decides when the day starts and which lunch rule applies. Create or manage shifts in the Shifts tab.</p>
            </div>
            {!form.fixed && (
              <>
                <div><Label>Working hours per day</Label><Input inputMode="decimal" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="e.g. 8, 10 or 12" /></div>
                {(shifts.find(s => s.id === form.shiftId)?.lunch_applies ?? true) && (
                <div className="flex items-start gap-2">
                  <Switch checked={form.lunchIncluded} onCheckedChange={v => setForm({ ...form, lunchIncluded: v })} id="lunch" />
                  <Label htmlFor="lunch" className="font-normal text-sm leading-snug">
                    Lunch is included in the working hours (use for 10 and 12 hour workers). Leave off for 8 hour workers, whose 30 minute lunch is extra and unpaid.
                  </Label>
                </div>
                )}
              </>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v, leftOn: v ? '' : form.leftOn || today() })} id="active" />
              <Label htmlFor="active" className="font-normal text-sm">Currently working (turn off if this person has left)</Label>
            </div>
            {!form.active && (
              <div><Label>Last working day</Label><Input type="date" value={form.leftOn} onChange={e => setForm({ ...form, leftOn: e.target.value })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={update.isPending}>Save details</Button>
          </DialogFooter>
          {editing && (
            <div className="border-t pt-3">
              <h3 className="font-semibold text-sm mb-2">Salary advance</h3>
              <AdvanceLedger employeeId={editing.id} advances={advances} recoveries={recoveries} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeesTab;
