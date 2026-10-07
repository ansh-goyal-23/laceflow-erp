import React, { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { advanceBalanceNow, dayLabel, inr, monthLabel, today, type Recovery } from '@/components/salary/common';
import {
  useAddSalaryAdvance, useDeleteSalaryAdvance, useUpdateSalaryAdvance, type SalaryAdvance,
} from '@/hooks/useSalary';

interface Props { employeeId: string; advances: SalaryAdvance[]; recoveries: Recovery[] }

/** Add, edit and delete one employee's advances. Edits and deletes are written to the change log. */
const AdvanceLedger: React.FC<Props> = ({ employeeId, advances, recoveries }) => {
  const add = useAddSalaryAdvance();
  const upd = useUpdateSalaryAdvance();
  const del = useDeleteSalaryAdvance();
  const [form, setForm] = useState({ amount: '', givenOn: today(), note: '' });
  const [edit, setEdit] = useState<{ adv: SalaryAdvance; amount: string; givenOn: string; note: string } | null>(null);

  const ledger = advances.filter(a => a.employee_id === employeeId);
  const back = recoveries.filter(r => r.employee_id === employeeId);
  const now = advanceBalanceNow(employeeId, advances, recoveries);

  const submit = async () => {
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid advance amount.'); return; }
    if (!form.givenOn) { toast.error('Pick the date it was given.'); return; }
    try {
      await add.mutateAsync({ employeeId, amount: amt, givenOn: form.givenOn, note: form.note });
      setForm({ amount: '', givenOn: today(), note: '' });
      toast.success('Advance saved.');
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const amt = Number(edit.amount);
    if (!Number.isFinite(amt) || amt <= 0 || !edit.givenOn) { toast.error('Enter a valid amount and date.'); return; }
    try {
      await upd.mutateAsync({ previous: edit.adv, amount: amt, givenOn: edit.givenOn, note: edit.note });
      toast.success('Advance updated and logged.');
      setEdit(null);
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm">
        Balance now: <b>{inr(now.balance)}</b>{' '}
        <span className="text-muted-foreground">(given {inr(now.given)}, recovered {inr(now.recovered)})</span>
      </div>
      <div className="grid grid-cols-[6.5rem_9rem_1fr_auto] gap-2 items-end">
        <div><Label className="text-xs">Amount (₹)</Label><Input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
        <div><Label className="text-xs">Given on</Label><Input type="date" value={form.givenOn} onChange={e => setForm({ ...form, givenOn: e.target.value })} /></div>
        <div><Label className="text-xs">Note</Label><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
        <Button onClick={submit} disabled={add.isPending}>Add</Button>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-1">Advances given</h4>
        <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
          {ledger.length === 0 && <div className="p-3 text-sm text-muted-foreground">None yet.</div>}
          {[...ledger].reverse().map(a => (
            <div key={a.id} className="flex items-center justify-between p-2 text-sm">
              <span>{dayLabel(a.given_on)}: <b>{inr(a.amount)}</b>{a.note ? ` (${a.note})` : ''}</span>
              <span className="flex">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit (logged)"
                  onClick={() => setEdit({ adv: a, amount: String(a.amount), givenOn: a.given_on, note: a.note || '' })}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete (logged)" onClick={async () => {
                  if (!window.confirm('Delete this advance entry? The deletion is saved in the audit log.')) return;
                  try { await del.mutateAsync(a); } catch (err: any) { toast.error(err?.message || 'Could not delete.'); }
                }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-1">Recovered from salary</h4>
        <div className="max-h-28 overflow-y-auto border rounded-md divide-y">
          {back.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nothing recovered yet.</div>}
          {[...back].reverse().map(r => <div key={r.month} className="p-2 text-sm">{monthLabel(r.month)} salary: <b>{inr(r.amount)}</b></div>)}
        </div>
      </div>

      <Dialog open={!!edit} onOpenChange={o => { if (!o) setEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit advance</DialogTitle>
            <DialogDescription>The old and new values are saved in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (₹)</Label><Input inputMode="decimal" value={edit?.amount || ''} onChange={e => edit && setEdit({ ...edit, amount: e.target.value })} /></div>
            <div><Label>Given on</Label><Input type="date" value={edit?.givenOn || ''} onChange={e => edit && setEdit({ ...edit, givenOn: e.target.value })} /></div>
            <div><Label>Note</Label><Input value={edit?.note || ''} onChange={e => edit && setEdit({ ...edit, note: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={upd.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdvanceLedger;
