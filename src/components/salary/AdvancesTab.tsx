import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { advanceBalanceNow, dayLabel, inr, monthLabel, today, type Recovery } from '@/components/salary/common';
import { useAddSalaryAdvance, useDeleteSalaryAdvance, type SalaryAdvance, type SalaryEmployee } from '@/hooks/useSalary';

interface Props { employees: SalaryEmployee[]; advances: SalaryAdvance[]; recoveries: Recovery[] }

const AdvancesTab: React.FC<Props> = ({ employees, advances, recoveries }) => {
  const add = useAddSalaryAdvance();
  const del = useDeleteSalaryAdvance();
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyOwing, setOnlyOwing] = useState(true);
  const [form, setForm] = useState({ amount: '', givenOn: today(), note: '' });

  const rows = useMemo(() => employees
    .map(e => ({ e, ...advanceBalanceNow(e.id, advances, recoveries) }))
    .filter(r => (onlyOwing ? r.balance > 0 : r.given > 0 || r.e.is_active)), [employees, advances, recoveries, onlyOwing]);
  const totalBalance = rows.reduce((t, r) => t + r.balance, 0);
  const emp = employees.find(e => e.id === openId) || null;
  const ledger = advances.filter(a => a.employee_id === openId);
  const back = recoveries.filter(r => r.employee_id === openId);
  const now = openId ? advanceBalanceNow(openId, advances, recoveries) : null;

  const submit = async () => {
    const amt = Number(form.amount);
    if (!openId || !Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid advance amount.'); return; }
    if (!form.givenOn) { toast.error('Pick the date it was given.'); return; }
    try {
      await add.mutateAsync({ employeeId: openId, amount: amt, givenOn: form.givenOn, note: form.note });
      setForm({ amount: '', givenOn: today(), note: '' });
      toast.success('Advance saved.');
    } catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Advances are saved here and stay on each employee's balance until they are recovered. When you generate a month's salary, the balance is
        filled in as the amount to recover (you can reduce it), and whatever is not recovered carries over to the next month.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Switch id="only-owing" checked={onlyOwing} onCheckedChange={setOnlyOwing} />
          <Label htmlFor="only-owing" className="font-normal">Only employees with an advance balance</Label>
        </div>
        <span className="ml-auto">Total advance balance: <b>{inr(totalBalance)}</b></span>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Advance Given</TableHead>
              <TableHead className="text-right">Recovered</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Add / History</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No advances to show.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.e.id}>
                <TableCell className="font-medium">{r.e.name}{!r.e.is_active && <Badge variant="secondary" className="ml-2">Left</Badge>}</TableCell>
                <TableCell className="text-right">{inr(r.given)}</TableCell>
                <TableCell className="text-right">{inr(r.recovered)}</TableCell>
                <TableCell className="text-right font-semibold">{inr(r.balance)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => { setOpenId(r.e.id); setForm({ amount: '', givenOn: today(), note: '' }); }}>Open</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!openId} onOpenChange={o => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Advance: {emp?.name}</DialogTitle>
            <DialogDescription>Balance now: {now ? inr(now.balance) : ''} (given {now ? inr(now.given) : ''}, recovered {now ? inr(now.recovered) : ''}).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[6.5rem_9rem_1fr_auto] gap-2 items-end">
            <div><Label className="text-xs">Amount (₹)</Label><Input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label className="text-xs">Given on</Label><Input type="date" value={form.givenOn} onChange={e => setForm({ ...form, givenOn: e.target.value })} /></div>
            <div><Label className="text-xs">Note</Label><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
            <Button onClick={submit} disabled={add.isPending}>Add</Button>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-1">Advances given</h4>
            <div className="max-h-44 overflow-y-auto border rounded-md divide-y">
              {ledger.length === 0 && <div className="p-3 text-sm text-muted-foreground">None yet.</div>}
              {[...ledger].reverse().map(a => (
                <div key={a.id} className="flex items-center justify-between p-2 text-sm">
                  <span>{dayLabel(a.given_on)}: <b>{inr(a.amount)}</b>{a.note ? ` (${a.note})` : ''}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => {
                    if (!window.confirm('Delete this advance entry?')) return;
                    try { await del.mutateAsync(a.id); } catch (err: any) { toast.error(err?.message || 'Could not delete.'); }
                  }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-1">Recovered from salary</h4>
            <div className="max-h-32 overflow-y-auto border rounded-md divide-y">
              {back.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nothing recovered yet.</div>}
              {[...back].reverse().map(r => (
                <div key={r.month} className="p-2 text-sm">{monthLabel(r.month)} salary: <b>{inr(r.amount)}</b></div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdvancesTab;
