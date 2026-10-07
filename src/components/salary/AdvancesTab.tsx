import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdvanceLedger from '@/components/salary/AdvanceLedger';
import { advanceBalanceNow, inr, type Recovery } from '@/components/salary/common';
import type { SalaryAdvance, SalaryEmployee } from '@/hooks/useSalary';

interface Props { employees: SalaryEmployee[]; advances: SalaryAdvance[]; recoveries: Recovery[] }

const AdvancesTab: React.FC<Props> = ({ employees, advances, recoveries }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyOwing, setOnlyOwing] = useState(true);

  const rows = useMemo(() => employees
    .map(e => ({ e, ...advanceBalanceNow(e.id, advances, recoveries) }))
    .filter(r => (onlyOwing ? r.balance > 0 : r.given > 0 || r.e.is_active)), [employees, advances, recoveries, onlyOwing]);
  const totalBalance = rows.reduce((t, r) => t + r.balance, 0);
  const emp = employees.find(e => e.id === openId) || null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Advances are saved here and stay on each employee's balance until they are recovered. When you generate a month's salary, the balance is
        filled in as the amount to recover (you can reduce it), and whatever is not recovered carries over to the next month. You can also add
        an advance from an employee's details in the Employees tab. Edits and deletions are logged.
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
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setOpenId(r.e.id)}>Open</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!openId} onOpenChange={o => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Advance: {emp?.name}</DialogTitle>
            <DialogDescription>Add an advance, or edit or delete an entry. Changes are saved in the audit log.</DialogDescription>
          </DialogHeader>
          {openId && <AdvanceLedger employeeId={openId} advances={advances} recoveries={recoveries} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdvancesTab;
