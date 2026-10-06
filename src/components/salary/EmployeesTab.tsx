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
import { dayLabel, inr, today } from '@/components/salary/common';
import { useUpdateSalaryEmployee, type SalaryEmployee } from '@/hooks/useSalary';

const EmployeesTab: React.FC<{ employees: SalaryEmployee[] }> = ({ employees }) => {
  const update = useUpdateSalaryEmployee();
  const [search, setSearch] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [editing, setEditing] = useState<SalaryEmployee | null>(null);
  const [form, setForm] = useState({ salary: '', hours: '', lunchIncluded: false, active: true, leftOn: '' });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e =>
      (showLeft || e.is_active) &&
      (!q || e.name.toLowerCase().includes(q) || String(e.machine_no).includes(q) || (e.department || '').toLowerCase().includes(q)));
  }, [employees, search, showLeft]);
  const missing = employees.filter(e => e.is_active && (e.monthly_salary == null || !e.working_hours));
  const leftCount = employees.filter(e => !e.is_active).length;

  const open = (e: SalaryEmployee) => {
    setEditing(e);
    setForm({
      salary: e.monthly_salary == null ? '' : String(e.monthly_salary),
      hours: e.working_hours == null ? '' : String(e.working_hours),
      lunchIncluded: e.lunch_included, active: e.is_active, leftOn: e.left_on || '',
    });
  };

  const save = async () => {
    if (!editing) return;
    const salary = form.salary.trim() === '' ? null : Number(form.salary);
    const hours = form.hours.trim() === '' ? null : Number(form.hours);
    if (salary != null && (!Number.isFinite(salary) || salary < 0)) { toast.error('Enter a valid monthly salary.'); return; }
    if (hours != null && (!Number.isFinite(hours) || hours <= 0 || hours > 24)) { toast.error('Working hours must be between 0 and 24.'); return; }
    if (!form.active && !form.leftOn) { toast.error('Enter the date this person left.'); return; }
    try {
      await update.mutateAsync({
        id: editing.id, monthly_salary: salary, working_hours: hours, lunch_included: form.lunchIncluded,
        is_active: form.active, left_on: form.active ? null : form.leftOn,
      });
      toast.success('Saved.');
      setEditing(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The master list of everyone on the thumb-print machine. Set each person's monthly salary and working hours once; they are used for every
        month you generate. New people appear here automatically when an attendance sheet is uploaded. Mark someone as Left to leave them out of
        future salary runs (their past months stay).
      </p>
      {missing.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />{missing.length} working employee(s) still need salary and working hours.
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
              <TableHead className="text-right">Monthly Salary</TableHead>
              <TableHead className="text-right">Working Hours</TableHead>
              <TableHead>Lunch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No employees to show.</TableCell></TableRow>}
            {rows.map(e => (
              <TableRow key={e.id}>
                <TableCell>{e.machine_no}</TableCell>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{e.department || <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell className="text-right">{e.monthly_salary != null ? inr(e.monthly_salary) : <Badge variant="outline" className="text-amber-600 border-amber-400">Not set</Badge>}</TableCell>
                <TableCell className="text-right">{e.working_hours ?? <Badge variant="outline" className="text-amber-600 border-amber-400">Not set</Badge>}</TableCell>
                <TableCell className="text-sm">{e.lunch_included ? 'Included in hours' : 'Extra 30 min'}</TableCell>
                <TableCell>{e.is_active ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Working</Badge> : <Badge variant="secondary">Left{e.left_on ? ` ${dayLabel(e.left_on)}` : ''}</Badge>}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open(e)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.name}: salary and working hours</DialogTitle>
            <DialogDescription>These are used for every month you generate from now on. Months that are already generated keep the values they were generated with.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Monthly salary (₹)</Label><Input inputMode="decimal" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 12500" /></div>
            <div><Label>Working hours per day</Label><Input inputMode="decimal" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="e.g. 8, 10 or 12" /></div>
            <div className="flex items-start gap-2">
              <Switch checked={form.lunchIncluded} onCheckedChange={v => setForm({ ...form, lunchIncluded: v })} id="lunch" />
              <Label htmlFor="lunch" className="font-normal text-sm leading-snug">
                Lunch is included in the working hours (use for 10 and 12 hour workers). Leave off for 8 hour workers, whose 30 minute lunch is extra and unpaid.
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v, leftOn: v ? '' : form.leftOn || today() })} id="active" />
              <Label htmlFor="active" className="font-normal text-sm">Currently working (turn off if this person has left)</Label>
            </div>
            {!form.active && (
              <div><Label>Date left</Label><Input type="date" value={form.leftOn} onChange={e => setForm({ ...form, leftOn: e.target.value })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeesTab;
