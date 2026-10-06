import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dayLabel, inr, monthLabel } from '@/components/salary/common';
import { useSalaryAuditEdits, useSalaryRunLog, type SalaryEmployee } from '@/hooks/useSalary';

const stamp = (iso: string) => new Date(iso).toLocaleString('en-IN');

const AuditTab: React.FC<{ employees: SalaryEmployee[] }> = ({ employees }) => {
  const { data: edits = [] } = useSalaryAuditEdits();
  const { data: runLog = [] } = useSalaryRunLog();
  const name = (id: string) => employees.find(e => e.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-semibold">Salary generation and reopening</h3>
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead><TableHead>Employee</TableHead><TableHead>Month</TableHead>
                <TableHead>Action</TableHead><TableHead className="text-right">Net payable</TableHead><TableHead>Reason / note</TableHead><TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runLog.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nothing yet.</TableCell></TableRow>}
              {runLog.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{stamp(r.at)}</TableCell>
                  <TableCell>{name(r.employee_id)}</TableCell>
                  <TableCell>{monthLabel(r.month)}</TableCell>
                  <TableCell>{r.action === 'generate' ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Generated</Badge> : <Badge variant="outline" className="text-amber-600 border-amber-400">Reopened</Badge>}</TableCell>
                  <TableCell className="text-right">{r.amount != null ? inr(r.amount) : '-'}</TableCell>
                  <TableCell className="text-sm">{r.reason || '-'}</TableCell>
                  <TableCell className="text-xs">{r.by_email || 'unknown'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">In / Out time corrections</h3>
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Field</TableHead>
                <TableHead>Change</TableHead><TableHead>Reason</TableHead><TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {edits.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No manual corrections yet.</TableCell></TableRow>}
              {edits.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs">{stamp(e.edited_at)}</TableCell>
                  <TableCell>{name(e.employee_id)}</TableCell>
                  <TableCell>{dayLabel(e.work_date)}</TableCell>
                  <TableCell>{e.field === 'in' ? 'In' : 'Out'}</TableCell>
                  <TableCell className="text-sm">
                    <span className="line-through">{e.old_value || 'none'}</span> to <b>{e.new_value || 'none'}</b>
                    {e.machine_value && <span className="text-muted-foreground"> (machine: {e.machine_value})</span>}
                  </TableCell>
                  <TableCell className="text-sm">{e.reason}</TableCell>
                  <TableCell className="text-xs">{e.edited_by_email || 'unknown'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">Showing the latest 300 entries of each. Entries cannot be edited or deleted.</p>
    </div>
  );
};

export default AuditTab;
