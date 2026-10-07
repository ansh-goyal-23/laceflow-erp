import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Clock, MoonStar, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { crossesMidnight, shiftOf, shiftRange } from '@/components/salary/common';
import {
  useDeleteShift, useSaveShift, useSetEmployeeShift, type SalaryEmployee, type SalaryShift,
} from '@/hooks/useSalary';

interface Props { shifts: SalaryShift[]; employees: SalaryEmployee[] }

const emptyForm = { name: '', start: '09:00', end: '17:00', lunch: false };

const ShiftsTab: React.FC<Props> = ({ shifts, employees }) => {
  const save = useSaveShift();
  const del = useDeleteShift();
  const setShift = useSetEmployeeShift();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dlg, setDlg] = useState<{ mode: 'new' | 'edit'; shift?: SalaryShift } | null>(null);
  const [form, setForm] = useState(emptyForm);

  const selected = shifts.find(s => s.id === selectedId) || shifts[0] || null;
  const general = shifts.find(s => s.name === 'General') || null;
  const working = useMemo(() => employees.filter(e => e.is_active), [employees]);
  const members = useMemo(() => (selected ? working.filter(e => shiftOf(e, shifts)?.id === selected.id) : []), [working, selected, shifts]);
  const addable = useMemo(() => (selected ? working.filter(e => shiftOf(e, shifts)?.id !== selected.id) : []), [working, selected, shifts]);
  const countOf = (s: SalaryShift) => working.filter(e => shiftOf(e, shifts)?.id === s.id).length;

  const openDlg = (mode: 'new' | 'edit', shift?: SalaryShift) => {
    setDlg({ mode, shift });
    setForm(shift ? { name: shift.name, start: shift.start_time, end: shift.end_time, lunch: shift.lunch_applies } : emptyForm);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('Give the shift a name.'); return; }
    if (!form.start || !form.end) { toast.error('Enter the start and end time.'); return; }
    if (form.start === form.end) { toast.error('Start and end time cannot be the same.'); return; }
    if (shifts.some(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== dlg?.shift?.id)) { toast.error('A shift with this name already exists.'); return; }
    try {
      await save.mutateAsync({
        id: dlg?.shift?.id, previous: dlg?.shift, name, start_time: form.start, end_time: form.end, lunch_applies: form.lunch,
      });
      toast.success(dlg?.mode === 'new' ? 'Shift created.' : 'Shift updated and logged. Months already generated keep their old shift timings.');
      setDlg(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save the shift.'); }
  };

  const addEmployee = async (id: string) => {
    if (!selected || !id) return;
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    const from = shiftOf(emp, shifts);
    try {
      await setShift.mutateAsync({ employee: emp, shiftId: selected.id, fromName: from?.name || 'None', toName: selected.name });
      toast.success(`${emp.name} added to ${selected.name}.`);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const removeEmployee = async (emp: SalaryEmployee) => {
    if (!selected || !general) return;
    try {
      await setShift.mutateAsync({ employee: emp, shiftId: general.id, fromName: selected.name, toName: general.name });
      toast.success(`${emp.name} moved to ${general.name}.`);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const removeShift = async (s: SalaryShift) => {
    const n = countOf(s);
    if (!window.confirm(`Delete the ${s.name} shift?${n ? ` Its ${n} employee(s) move to General.` : ''} Months already generated keep their own copy.`)) return;
    try { await del.mutateAsync(s); setSelectedId(null); toast.success('Shift deleted.'); }
    catch (err: any) { toast.error(err?.message || 'Could not delete.'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create the shifts your company runs and put each worker in one. A worker's shift decides when their day starts (nothing is paid before the
        shift start), when overtime begins, and which lunch rule applies. Workers with no shift chosen use General. You can also change a worker's
        shift from their details in the Employees tab. Moves and shift edits are saved in the audit log.
      </p>
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          <Button className="w-full" onClick={() => openDlg('new')}><Plus className="h-4 w-4 mr-1" />New shift</Button>
          {shifts.map(s => (
            <button
              key={s.id} type="button" onClick={() => setSelectedId(s.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === s.id ? 'border-primary bg-primary/5' : 'bg-card hover:bg-accent'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                <Badge variant="secondary">{countOf(s)}</Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {crossesMidnight(s) ? <MoonStar className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{shiftRange(s)}
              </div>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">{selected.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {shiftRange(selected)}{crossesMidnight(selected) ? ' (ends the next morning)' : ''}.{' '}
                  {selected.lunch_applies ? 'Lunch 1:00-1:30 pm rules apply.' : 'No lunch is deducted.'}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => openDlg('edit', selected)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                {selected.name !== 'General' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete shift" onClick={() => removeShift(selected)}><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs">Add a worker to {selected.name}</Label>
                <select
                  className="h-9 w-72 rounded-md border bg-background px-2 text-sm" value="" disabled={setShift.isPending}
                  onChange={e => addEmployee(e.target.value)}
                >
                  <option value="">Select a worker...</option>
                  {addable.map(e => (
                    <option key={e.id} value={e.id}>{e.name} (now in {shiftOf(e, shifts)?.name || 'none'})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-1">Workers in this shift ({members.length})</h4>
              <div className="border rounded-md divide-y">
                {members.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nobody is in this shift yet.</div>}
                {members.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-2 text-sm">
                    <span>
                      {e.name} <span className="text-xs text-muted-foreground">Machine no. {e.machine_no}</span>
                      {e.pay_type === 'fixed' && <Badge variant="secondary" className="ml-2">Fixed salary</Badge>}
                    </span>
                    {selected.name !== 'General' && (
                      <Button variant="ghost" size="sm" onClick={() => removeEmployee(e)}><UserMinus className="h-4 w-4 mr-1" />Remove</Button>
                    )}
                  </div>
                ))}
              </div>
              {selected.name === 'General' && <p className="mt-1 text-xs text-muted-foreground">To move someone out of General, add them to another shift.</p>}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">No shifts yet. Create one to begin.</div>
        )}
      </div>

      <Dialog open={!!dlg} onOpenChange={o => { if (!o) setDlg(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dlg?.mode === 'new' ? 'New shift' : `Edit ${dlg?.shift?.name}`}</DialogTitle>
            <DialogDescription>
              {dlg?.mode === 'edit' ? 'Months already generated keep the shift they were generated with. ' : ''}
              If the end time is not after the start time, the shift runs overnight (for example 9 pm to 9 am).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Starts</Label><Input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} /></div>
              <div><Label>Ends</Label><Input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} /></div>
            </div>
            {form.start && form.end && form.start !== form.end && crossesMidnight({ start_time: form.start, end_time: form.end }) && (
              <p className="text-xs text-muted-foreground">Overnight shift: In is the evening punch, Out is the next morning's punch.</p>
            )}
            <div className="flex items-start gap-2">
              <Switch id="shift-lunch" checked={form.lunch} onCheckedChange={v => setForm({ ...form, lunch: v })} />
              <Label htmlFor="shift-lunch" className="font-normal text-sm leading-snug">
                The 1:00-1:30 pm lunch rules apply to this shift (leave off for shifts with no lunch break, like 6 am-2 pm and 2 pm-10 pm).
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftsTab;
